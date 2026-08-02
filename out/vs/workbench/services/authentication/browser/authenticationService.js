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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, isDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { equalsIgnoreCase, isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { isString } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IAuthenticationAccessService } from "./authenticationAccessService.js";
import { IAuthenticationService, isAuthenticationWwwAuthenticateRequest } from "../common/authentication.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { ActivationKind, IExtensionService } from "../../extensions/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { match } from "../../../../base/common/glob.js";
import { parseWWWAuthenticateHeader } from "../../../../base/common/oauth.js";
import { raceCancellation, raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
function getAuthenticationProviderActivationEvent(id) {
  return `onAuthenticationRequest:${id}`;
}
async function getCurrentAuthenticationSessionInfo(secretStorageService, productService) {
  const authenticationSessionValue = await secretStorageService.get(`${productService.urlProtocol}.loginAccount`);
  if (authenticationSessionValue) {
    try {
      const authenticationSessionInfo = JSON.parse(authenticationSessionValue);
      if (authenticationSessionInfo && isString(authenticationSessionInfo.id) && isString(authenticationSessionInfo.accessToken) && isString(authenticationSessionInfo.providerId)) {
        return authenticationSessionInfo;
      }
    } catch (e) {
      console.error(`Failed parsing current auth session value: ${e}`);
    }
  }
  return void 0;
}
const authenticationDefinitionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description: localize("authentication.id", "The id of the authentication provider.")
    },
    label: {
      type: "string",
      description: localize("authentication.label", "The human readable name of the authentication provider.")
    },
    authorizationServerGlobs: {
      type: "array",
      items: {
        type: "string",
        description: localize("authentication.authorizationServerGlobs", "A list of globs that match the authorization servers that this provider supports.")
      },
      description: localize("authentication.authorizationServerGlobsDescription", "A list of globs that match the authorization servers that this provider supports.")
    }
  }
};
const authenticationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "authentication",
  jsonSchema: {
    description: localize({ key: "authenticationExtensionPoint", comment: [`'Contributes' means adds here`] }, "Contributes authentication"),
    type: "array",
    items: authenticationDefinitionSchema
  },
  activationEventsGenerator: function* (authenticationProviders) {
    for (const authenticationProvider of authenticationProviders) {
      if (authenticationProvider.id) {
        yield `onAuthenticationRequest:${authenticationProvider.id}`;
      }
    }
  }
});
let AuthenticationService = class extends Disposable {
  constructor(_extensionService, authenticationAccessService, _environmentService, _logService) {
    super();
    this._extensionService = _extensionService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._onDidRegisterAuthenticationProvider = this._register(new Emitter());
    this.onDidRegisterAuthenticationProvider = this._onDidRegisterAuthenticationProvider.event;
    this._onDidUnregisterAuthenticationProvider = this._register(new Emitter());
    this.onDidUnregisterAuthenticationProvider = this._onDidUnregisterAuthenticationProvider.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidChangeDeclaredProviders = this._register(new Emitter());
    this.onDidChangeDeclaredProviders = this._onDidChangeDeclaredProviders.event;
    this._authenticationProviders = /* @__PURE__ */ new Map();
    this._authenticationProviderDisposables = this._register(new DisposableMap());
    this._dynamicAuthenticationProviderIds = /* @__PURE__ */ new Set();
    this._delegates = [];
    this._disposedSource = new CancellationTokenSource();
    this._declaredProviders = [];
    this._register(toDisposable(() => this._disposedSource.dispose(true)));
    this._register(authenticationAccessService.onDidChangeExtensionSessionAccess((e) => {
      this._onDidChangeSessions.fire({
        providerId: e.providerId,
        label: e.accountName,
        event: {
          added: [],
          changed: [],
          removed: []
        }
      });
    }));
    this._registerEnvContributedAuthenticationProviders();
    this._registerAuthenticationExtensionPointHandler();
  }
  get declaredProviders() {
    return this._declaredProviders;
  }
  _registerEnvContributedAuthenticationProviders() {
    if (!this._environmentService.options?.authenticationProviders?.length) {
      return;
    }
    for (const provider of this._environmentService.options.authenticationProviders) {
      this.registerDeclaredAuthenticationProvider(provider);
      this.registerAuthenticationProvider(provider.id, provider);
    }
  }
  _registerAuthenticationExtensionPointHandler() {
    this._register(authenticationExtPoint.setHandler((_extensions, { added, removed }) => {
      this._logService.debug(`Found authentication providers. added: ${added.length}, removed: ${removed.length}`);
      added.forEach((point) => {
        for (const provider of point.value) {
          if (isFalsyOrWhitespace(provider.id)) {
            point.collector.error(localize("authentication.missingId", "An authentication contribution must specify an id."));
            continue;
          }
          if (isFalsyOrWhitespace(provider.label)) {
            point.collector.error(localize("authentication.missingLabel", "An authentication contribution must specify a label."));
            continue;
          }
          if (!this.declaredProviders.some((p) => p.id === provider.id)) {
            this.registerDeclaredAuthenticationProvider(provider);
            this._logService.debug(`Declared authentication provider: ${provider.id}`);
          } else {
            point.collector.error(localize("authentication.idConflict", "This authentication id '{0}' has already been registered", provider.id));
          }
        }
      });
      const removedExtPoints = removed.flatMap((r) => r.value);
      removedExtPoints.forEach((point) => {
        const provider = this.declaredProviders.find((provider2) => provider2.id === point.id);
        if (provider) {
          this.unregisterDeclaredAuthenticationProvider(provider.id);
          this._logService.debug(`Undeclared authentication provider: ${provider.id}`);
        }
      });
    }));
  }
  registerDeclaredAuthenticationProvider(provider) {
    if (isFalsyOrWhitespace(provider.id)) {
      throw new Error(localize("authentication.missingId", "An authentication contribution must specify an id."));
    }
    if (isFalsyOrWhitespace(provider.label)) {
      throw new Error(localize("authentication.missingLabel", "An authentication contribution must specify a label."));
    }
    if (this.declaredProviders.some((p) => p.id === provider.id)) {
      throw new Error(localize("authentication.idConflict", "This authentication id '{0}' has already been registered", provider.id));
    }
    this._declaredProviders.push(provider);
    this._onDidChangeDeclaredProviders.fire();
  }
  unregisterDeclaredAuthenticationProvider(id) {
    const index = this.declaredProviders.findIndex((provider) => provider.id === id);
    if (index > -1) {
      this.declaredProviders.splice(index, 1);
    }
    this._onDidChangeDeclaredProviders.fire();
  }
  isAuthenticationProviderRegistered(id) {
    return this._authenticationProviders.has(id);
  }
  isDynamicAuthenticationProvider(id) {
    return this._dynamicAuthenticationProviderIds.has(id);
  }
  registerAuthenticationProvider(id, authenticationProvider) {
    this._authenticationProviders.set(id, authenticationProvider);
    const disposableStore = new DisposableStore();
    disposableStore.add(authenticationProvider.onDidChangeSessions((e) => this._onDidChangeSessions.fire({
      providerId: id,
      label: authenticationProvider.label,
      event: e
    })));
    if (isDisposable(authenticationProvider)) {
      disposableStore.add(authenticationProvider);
    }
    this._authenticationProviderDisposables.set(id, disposableStore);
    this._onDidRegisterAuthenticationProvider.fire({ id, label: authenticationProvider.label });
  }
  unregisterAuthenticationProvider(id) {
    const provider = this._authenticationProviders.get(id);
    if (provider) {
      this._authenticationProviders.delete(id);
      this._dynamicAuthenticationProviderIds.delete(id);
      this._onDidUnregisterAuthenticationProvider.fire({ id, label: provider.label });
    }
    this._authenticationProviderDisposables.deleteAndDispose(id);
  }
  getProviderIds() {
    const providerIds = [];
    this._authenticationProviders.forEach((provider) => {
      providerIds.push(provider.id);
    });
    return providerIds;
  }
  getProvider(id) {
    if (this._authenticationProviders.has(id)) {
      return this._authenticationProviders.get(id);
    }
    throw new Error(`No authentication provider '${id}' is currently registered.`);
  }
  async getAccounts(id) {
    const sessions = await this.getSessions(id);
    const accounts = new Array();
    const seenAccounts = /* @__PURE__ */ new Set();
    for (const session of sessions) {
      if (!seenAccounts.has(session.account.label)) {
        seenAccounts.add(session.account.label);
        accounts.push(session.account);
      }
    }
    return accounts;
  }
  async getSessions(id, scopeListOrRequest, options, activateImmediate = false) {
    if (this._disposedSource.token.isCancellationRequested) {
      return [];
    }
    const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, activateImmediate);
    if (authProvider) {
      const server = options?.authorizationServer;
      if (server) {
        if (!this.matchesProvider(authProvider, server)) {
          throw new Error(`The authentication provider '${id}' does not support the authorization server '${server.toString(true)}'.`);
        }
      }
      if (isAuthenticationWwwAuthenticateRequest(scopeListOrRequest)) {
        if (!authProvider.getSessionsFromChallenges) {
          throw new Error(`The authentication provider '${id}' does not support getting sessions from challenges.`);
        }
        return await authProvider.getSessionsFromChallenges(
          { challenges: parseWWWAuthenticateHeader(scopeListOrRequest.wwwAuthenticate), fallbackScopes: scopeListOrRequest.fallbackScopes },
          { ...options }
        );
      }
      return await authProvider.getSessions(scopeListOrRequest ? [...scopeListOrRequest] : void 0, { ...options });
    } else {
      throw new Error(`No authentication provider '${id}' is currently registered.`);
    }
  }
  async createSession(id, scopeListOrRequest, options) {
    if (this._disposedSource.token.isCancellationRequested) {
      throw new Error("Authentication service is disposed.");
    }
    const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, !!options?.activateImmediate);
    if (authProvider) {
      if (isAuthenticationWwwAuthenticateRequest(scopeListOrRequest)) {
        if (!authProvider.createSessionFromChallenges) {
          throw new Error(`The authentication provider '${id}' does not support creating sessions from challenges.`);
        }
        return await authProvider.createSessionFromChallenges(
          { challenges: parseWWWAuthenticateHeader(scopeListOrRequest.wwwAuthenticate), fallbackScopes: scopeListOrRequest.fallbackScopes },
          { ...options }
        );
      }
      return await authProvider.createSession([...scopeListOrRequest], { ...options });
    } else {
      throw new Error(`No authentication provider '${id}' is currently registered.`);
    }
  }
  async removeSession(id, sessionId) {
    if (this._disposedSource.token.isCancellationRequested) {
      throw new Error("Authentication service is disposed.");
    }
    const authProvider = this._authenticationProviders.get(id);
    if (authProvider) {
      return authProvider.removeSession(sessionId);
    } else {
      throw new Error(`No authentication provider '${id}' is currently registered.`);
    }
  }
  async getOrActivateProviderIdForServer(authorizationServer, resourceServer) {
    for (const provider of this._authenticationProviders.values()) {
      if (this.matchesProvider(provider, authorizationServer, resourceServer)) {
        return provider.id;
      }
    }
    const authServerStr = authorizationServer.toString(true);
    const providers = this._declaredProviders.filter((p) => !this._authenticationProviders.has(p.id)).filter((p) => !!p.authorizationServerGlobs?.some((i) => match(i, authServerStr, { ignoreCase: true })));
    for (const provider of providers) {
      const activeProvider = await this.tryActivateProvider(provider.id, true);
      if (this.matchesProvider(activeProvider, authorizationServer, resourceServer)) {
        return activeProvider.id;
      }
    }
    return void 0;
  }
  async createDynamicAuthenticationProvider(authorizationServer, serverMetadata, resource, clientId, clientSecret) {
    const delegate = this._delegates[0];
    if (!delegate) {
      this._logService.error("No authentication provider host delegate found");
      return void 0;
    }
    const providerId = await delegate.create(authorizationServer, serverMetadata, resource, clientId, clientSecret);
    const provider = this._authenticationProviders.get(providerId);
    if (provider) {
      this._logService.debug(`Created dynamic authentication provider: ${providerId}`);
      this._dynamicAuthenticationProviderIds.add(providerId);
      return provider;
    }
    this._logService.error(`Failed to create dynamic authentication provider: ${providerId}`);
    return void 0;
  }
  async createOrGetXaaProvider(issuer) {
    const providerId = `xaa:${issuer.toString(true)}`;
    if (this._authenticationProviders.has(providerId)) {
      return providerId;
    }
    const delegate = this._delegates.find((d) => !!d.createXaa);
    if (!delegate) {
      this._logService.error("No authentication provider host delegate supports XAA");
      return void 0;
    }
    const created = await delegate.createXaa(issuer);
    if (this._authenticationProviders.has(created)) {
      this._logService.debug(`Created XAA authentication provider: ${created}`);
      return created;
    }
    this._logService.error(`Failed to create XAA authentication provider for issuer: ${issuer.toString(true)}`);
    return void 0;
  }
  registerAuthenticationProviderHostDelegate(delegate) {
    this._delegates.push(delegate);
    this._delegates.sort((a, b) => b.priority - a.priority);
    return {
      dispose: () => {
        const index = this._delegates.indexOf(delegate);
        if (index !== -1) {
          this._delegates.splice(index, 1);
        }
      }
    };
  }
  matchesProvider(provider, authorizationServer, resourceServer) {
    if (resourceServer && provider.resourceServer) {
      const resourceServerStr = resourceServer.toString(true);
      const providerResourceServerStr = provider.resourceServer.toString(true);
      if (!equalsIgnoreCase(providerResourceServerStr, resourceServerStr)) {
        return false;
      }
    }
    if (provider.authorizationServers) {
      const authServerStr = authorizationServer.toString(true);
      for (const server of provider.authorizationServers) {
        const str = server.toString(true);
        if (equalsIgnoreCase(str, authServerStr) || match(str, authServerStr, { ignoreCase: true })) {
          return true;
        }
      }
    }
    return false;
  }
  async tryActivateProvider(providerId, activateImmediate) {
    const store = new DisposableStore();
    try {
      const activationPromise = this._extensionService.activateByEvent(
        getAuthenticationProviderActivationEvent(providerId),
        activateImmediate ? ActivationKind.Immediate : ActivationKind.Normal
      );
      let provider = this._authenticationProviders.get(providerId);
      if (provider) {
        return provider;
      }
      if (this._disposedSource.token.isCancellationRequested) {
        throw new Error("Authentication service is disposed.");
      }
      const providerRegistered = raceCancellation(
        Event.toPromise(
          Event.filter(
            this.onDidRegisterAuthenticationProvider,
            (e) => e.id === providerId,
            store
          ),
          store
        ),
        this._disposedSource.token
      );
      await Promise.race([activationPromise, providerRegistered]);
      provider = this._authenticationProviders.get(providerId);
      if (provider) {
        return provider;
      }
      const result = await raceTimeout(providerRegistered, 5e3);
      provider = this._authenticationProviders.get(providerId);
      if (provider) {
        return provider;
      }
      if (!result) {
        throw new Error(`Timed out waiting for authentication provider '${providerId}' to register.`);
      }
      throw new Error(`No authentication provider '${providerId}' is currently registered.`);
    } finally {
      store.dispose();
    }
  }
};
AuthenticationService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IAuthenticationAccessService),
  __decorateParam(2, IBrowserWorkbenchEnvironmentService),
  __decorateParam(3, ILogService)
], AuthenticationService);
registerSingleton(IAuthenticationService, AuthenticationService, InstantiationType.Delayed);
export {
  AuthenticationService,
  getAuthenticationProviderActivationEvent,
  getCurrentAuthenticationSessionInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgaXNEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXF1YWxzSWdub3JlQ2FzZSwgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSB9IGZyb20gJy4vYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbiwgQXV0aGVudGljYXRpb25TZXNzaW9uLCBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50LCBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQsIElBdXRoZW50aWNhdGlvbkNyZWF0ZVNlc3Npb25PcHRpb25zLCBJQXV0aGVudGljYXRpb25HZXRTZXNzaW9uc09wdGlvbnMsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJQXV0aGVudGljYXRpb25Qcm92aWRlckhvc3REZWxlZ2F0ZSwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgSUF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QgfSBmcm9tICcuLi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3RpdmF0aW9uS2luZCwgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBtYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgcGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYXV0aC5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQoaWQ6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiBgb25BdXRoZW50aWNhdGlvblJlcXVlc3Q6JHtpZH1gOyB9XG5cbi8vIFRPRE86IHB1bGwgdGhpcyBvdXQgaW50byBpdHMgb3duIHNlcnZpY2VcbmV4cG9ydCB0eXBlIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gPSB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGFjY2Vzc1Rva2VuOiBzdHJpbmc7IHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZzsgcmVhZG9ubHkgY2FuU2lnbk91dD86IGJvb2xlYW4gfTtcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDdXJyZW50QXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyhcblx0c2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0cHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZVxuKTogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvblZhbHVlID0gYXdhaXQgc2VjcmV0U3RvcmFnZVNlcnZpY2UuZ2V0KGAke3Byb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sfS5sb2dpbkFjY291bnRgKTtcblx0aWYgKGF1dGhlbnRpY2F0aW9uU2Vzc2lvblZhbHVlKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gPSBKU09OLnBhcnNlKGF1dGhlbnRpY2F0aW9uU2Vzc2lvblZhbHVlKTtcblx0XHRcdGlmIChhdXRoZW50aWNhdGlvblNlc3Npb25JbmZvXG5cdFx0XHRcdCYmIGlzU3RyaW5nKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8uaWQpXG5cdFx0XHRcdCYmIGlzU3RyaW5nKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8uYWNjZXNzVG9rZW4pXG5cdFx0XHRcdCYmIGlzU3RyaW5nKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8ucHJvdmlkZXJJZClcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gYXV0aGVudGljYXRpb25TZXNzaW9uSW5mbztcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBUaGlzIGlzIGEgYmVzdCBlZmZvcnQgb3BlcmF0aW9uLlxuXHRcdFx0Y29uc29sZS5lcnJvcihgRmFpbGVkIHBhcnNpbmcgY3VycmVudCBhdXRoIHNlc3Npb24gdmFsdWU6ICR7ZX1gKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuY29uc3QgYXV0aGVudGljYXRpb25EZWZpbml0aW9uU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0cHJvcGVydGllczoge1xuXHRcdGlkOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0aGVudGljYXRpb24uaWQnLCAnVGhlIGlkIG9mIHRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlci4nKVxuXHRcdH0sXG5cdFx0bGFiZWw6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRoZW50aWNhdGlvbi5sYWJlbCcsICdUaGUgaHVtYW4gcmVhZGFibGUgbmFtZSBvZiB0aGUgYXV0aGVudGljYXRpb24gcHJvdmlkZXIuJyksXG5cdFx0fSxcblx0XHRhdXRob3JpemF0aW9uU2VydmVyR2xvYnM6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRoZW50aWNhdGlvbi5hdXRob3JpemF0aW9uU2VydmVyR2xvYnMnLCAnQSBsaXN0IG9mIGdsb2JzIHRoYXQgbWF0Y2ggdGhlIGF1dGhvcml6YXRpb24gc2VydmVycyB0aGF0IHRoaXMgcHJvdmlkZXIgc3VwcG9ydHMuJyksXG5cdFx0XHR9LFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRoZW50aWNhdGlvbi5hdXRob3JpemF0aW9uU2VydmVyR2xvYnNEZXNjcmlwdGlvbicsICdBIGxpc3Qgb2YgZ2xvYnMgdGhhdCBtYXRjaCB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXJzIHRoYXQgdGhpcyBwcm92aWRlciBzdXBwb3J0cy4nKVxuXHRcdH1cblx0fVxufTtcblxuY29uc3QgYXV0aGVudGljYXRpb25FeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnYXV0aGVudGljYXRpb24nLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKHsga2V5OiAnYXV0aGVudGljYXRpb25FeHRlbnNpb25Qb2ludCcsIGNvbW1lbnQ6IFtgJ0NvbnRyaWJ1dGVzJyBtZWFucyBhZGRzIGhlcmVgXSB9LCAnQ29udHJpYnV0ZXMgYXV0aGVudGljYXRpb24nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiBhdXRoZW50aWNhdGlvbkRlZmluaXRpb25TY2hlbWFcblx0fSxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChhdXRoZW50aWNhdGlvblByb3ZpZGVycykge1xuXHRcdGZvciAoY29uc3QgYXV0aGVudGljYXRpb25Qcm92aWRlciBvZiBhdXRoZW50aWNhdGlvblByb3ZpZGVycykge1xuXHRcdFx0aWYgKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpIHtcblx0XHRcdFx0eWllbGQgYG9uQXV0aGVudGljYXRpb25SZXF1ZXN0OiR7YXV0aGVudGljYXRpb25Qcm92aWRlci5pZH1gO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBBdXRoZW50aWNhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBFbWl0dGVyPEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBdXRoZW50aWNhdGlvblByb3ZpZGVySW5mb3JtYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcjogRXZlbnQ8QXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uPiA9IHRoaXMuX29uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkVW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IEVtaXR0ZXI8QXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IEV2ZW50PEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbj4gPSB0aGlzLl9vbkRpZFVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU2Vzc2lvbnM6IEVtaXR0ZXI8eyBwcm92aWRlcklkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGV2ZW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQgfT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHByb3ZpZGVySWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZXZlbnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudCB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQ8eyBwcm92aWRlcklkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGV2ZW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQgfT4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlRGVjbGFyZWRQcm92aWRlcnM6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZWNsYXJlZFByb3ZpZGVyczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZURlY2xhcmVkUHJvdmlkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzOiBNYXA8c3RyaW5nLCBJQXV0aGVudGljYXRpb25Qcm92aWRlcj4gPSBuZXcgTWFwPHN0cmluZywgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJEaXNwb3NhYmxlczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIF9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGVnYXRlczogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJIb3N0RGVsZWdhdGVbXSA9IFtdO1xuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZTogSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZGlzcG9zZWRTb3VyY2UuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvblNlc3Npb25BY2Nlc3MoZSA9PiB7XG5cdFx0XHQvLyBUaGUgYWNjZXNzIGhhcyBjaGFuZ2VkLCBub3QgdGhlIGFjdHVhbCBzZXNzaW9uIGl0c2VsZiBidXQgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcyBldmVudCBmaXJpbmdcblx0XHRcdC8vIHdoZW4gdGhleSBoYXZlIGdhaW5lZCBhY2Nlc3MgdG8gYW4gYWNjb3VudCBzbyB0aGlzIGZpcmVzIHRoYXQgZXZlbnQuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoe1xuXHRcdFx0XHRwcm92aWRlcklkOiBlLnByb3ZpZGVySWQsXG5cdFx0XHRcdGxhYmVsOiBlLmFjY291bnROYW1lLFxuXHRcdFx0XHRldmVudDoge1xuXHRcdFx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdFx0XHRjaGFuZ2VkOiBbXSxcblx0XHRcdFx0XHRyZW1vdmVkOiBbXVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlckVudkNvbnRyaWJ1dGVkQXV0aGVudGljYXRpb25Qcm92aWRlcnMoKTtcblx0XHR0aGlzLl9yZWdpc3RlckF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uUG9pbnRIYW5kbGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNsYXJlZFByb3ZpZGVyczogQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uW10gPSBbXTtcblx0Z2V0IGRlY2xhcmVkUHJvdmlkZXJzKCk6IEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjbGFyZWRQcm92aWRlcnM7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckVudkNvbnRyaWJ1dGVkQXV0aGVudGljYXRpb25Qcm92aWRlcnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uYXV0aGVudGljYXRpb25Qcm92aWRlcnM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5vcHRpb25zLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyLmlkLCBwcm92aWRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBdXRoZW50aWNhdGlvbkV4dGVuc2lvblBvaW50SGFuZGxlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRoZW50aWNhdGlvbkV4dFBvaW50LnNldEhhbmRsZXIoKF9leHRlbnNpb25zLCB7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYEZvdW5kIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycy4gYWRkZWQ6ICR7YWRkZWQubGVuZ3RofSwgcmVtb3ZlZDogJHtyZW1vdmVkLmxlbmd0aH1gKTtcblx0XHRcdGFkZGVkLmZvckVhY2gocG9pbnQgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHBvaW50LnZhbHVlKSB7XG5cdFx0XHRcdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UocHJvdmlkZXIuaWQpKSB7XG5cdFx0XHRcdFx0XHRwb2ludC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLm1pc3NpbmdJZCcsICdBbiBhdXRoZW50aWNhdGlvbiBjb250cmlidXRpb24gbXVzdCBzcGVjaWZ5IGFuIGlkLicpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChpc0ZhbHN5T3JXaGl0ZXNwYWNlKHByb3ZpZGVyLmxhYmVsKSkge1xuXHRcdFx0XHRcdFx0cG9pbnQuY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdhdXRoZW50aWNhdGlvbi5taXNzaW5nTGFiZWwnLCAnQW4gYXV0aGVudGljYXRpb24gY29udHJpYnV0aW9uIG11c3Qgc3BlY2lmeSBhIGxhYmVsLicpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghdGhpcy5kZWNsYXJlZFByb3ZpZGVycy5zb21lKHAgPT4gcC5pZCA9PT0gcHJvdmlkZXIuaWQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYERlY2xhcmVkIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyOiAke3Byb3ZpZGVyLmlkfWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwb2ludC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLmlkQ29uZmxpY3QnLCBcIlRoaXMgYXV0aGVudGljYXRpb24gaWQgJ3swfScgaGFzIGFscmVhZHkgYmVlbiByZWdpc3RlcmVkXCIsIHByb3ZpZGVyLmlkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlZEV4dFBvaW50cyA9IHJlbW92ZWQuZmxhdE1hcChyID0+IHIudmFsdWUpO1xuXHRcdFx0cmVtb3ZlZEV4dFBvaW50cy5mb3JFYWNoKHBvaW50ID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmRlY2xhcmVkUHJvdmlkZXJzLmZpbmQocHJvdmlkZXIgPT4gcHJvdmlkZXIuaWQgPT09IHBvaW50LmlkKTtcblx0XHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0dGhpcy51bnJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBVbmRlY2xhcmVkIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyOiAke3Byb3ZpZGVyLmlkfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRyZWdpc3RlckRlY2xhcmVkQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlcjogQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uKTogdm9pZCB7XG5cdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UocHJvdmlkZXIuaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLm1pc3NpbmdJZCcsICdBbiBhdXRoZW50aWNhdGlvbiBjb250cmlidXRpb24gbXVzdCBzcGVjaWZ5IGFuIGlkLicpKTtcblx0XHR9XG5cdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UocHJvdmlkZXIubGFiZWwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLm1pc3NpbmdMYWJlbCcsICdBbiBhdXRoZW50aWNhdGlvbiBjb250cmlidXRpb24gbXVzdCBzcGVjaWZ5IGEgbGFiZWwuJykpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5kZWNsYXJlZFByb3ZpZGVycy5zb21lKHAgPT4gcC5pZCA9PT0gcHJvdmlkZXIuaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLmlkQ29uZmxpY3QnLCBcIlRoaXMgYXV0aGVudGljYXRpb24gaWQgJ3swfScgaGFzIGFscmVhZHkgYmVlbiByZWdpc3RlcmVkXCIsIHByb3ZpZGVyLmlkKSk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlY2xhcmVkUHJvdmlkZXJzLnB1c2gocHJvdmlkZXIpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjbGFyZWRQcm92aWRlcnMuZmlyZSgpO1xuXHR9XG5cblx0dW5yZWdpc3RlckRlY2xhcmVkQXV0aGVudGljYXRpb25Qcm92aWRlcihpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmRlY2xhcmVkUHJvdmlkZXJzLmZpbmRJbmRleChwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gaWQpO1xuXHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHR0aGlzLmRlY2xhcmVkUHJvdmlkZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjbGFyZWRQcm92aWRlcnMuZmlyZSgpO1xuXHR9XG5cblx0aXNBdXRoZW50aWNhdGlvblByb3ZpZGVyUmVnaXN0ZXJlZChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmhhcyhpZCk7XG5cdH1cblxuXHRpc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZHMuaGFzKGlkKTtcblx0fVxuXG5cdHJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihpZDogc3RyaW5nLCBhdXRoZW50aWNhdGlvblByb3ZpZGVyOiBJQXV0aGVudGljYXRpb25Qcm92aWRlcik6IHZvaWQge1xuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLnNldChpZCwgYXV0aGVudGljYXRpb25Qcm92aWRlcik7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoYXV0aGVudGljYXRpb25Qcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHtcblx0XHRcdHByb3ZpZGVySWQ6IGlkLFxuXHRcdFx0bGFiZWw6IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIubGFiZWwsXG5cdFx0XHRldmVudDogZVxuXHRcdH0pKSk7XG5cdFx0aWYgKGlzRGlzcG9zYWJsZShhdXRoZW50aWNhdGlvblByb3ZpZGVyKSkge1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhdXRoZW50aWNhdGlvblByb3ZpZGVyKTtcblx0XHR9XG5cdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlckRpc3Bvc2FibGVzLnNldChpZCwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHR0aGlzLl9vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlci5maXJlKHsgaWQsIGxhYmVsOiBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmxhYmVsIH0pO1xuXHR9XG5cblx0dW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmRlbGV0ZShpZCk7XG5cdFx0XHQvLyBJZiB0aGlzIGlzIGEgZHluYW1pYyBwcm92aWRlciwgcmVtb3ZlIGl0IGZyb20gdGhlIHNldCBvZiBkeW5hbWljIHByb3ZpZGVyc1xuXHRcdFx0dGhpcy5fZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZHMuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMuX29uRGlkVW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuZmlyZSh7IGlkLCBsYWJlbDogcHJvdmlkZXIubGFiZWwgfSk7XG5cdFx0fVxuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0fVxuXG5cdGdldFByb3ZpZGVySWRzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBwcm92aWRlcklkczogc3RyaW5nW10gPSBbXTtcblx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5mb3JFYWNoKHByb3ZpZGVyID0+IHtcblx0XHRcdHByb3ZpZGVySWRzLnB1c2gocHJvdmlkZXIuaWQpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBwcm92aWRlcklkcztcblx0fVxuXG5cdGdldFByb3ZpZGVyKGlkOiBzdHJpbmcpOiBJQXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdFx0aWYgKHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmhhcyhpZCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQoaWQpITtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBObyBhdXRoZW50aWNhdGlvbiBwcm92aWRlciAnJHtpZH0nIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLmApO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWNjb3VudHMoaWQ6IHN0cmluZyk6IFByb21pc2U8UmVhZG9ubHlBcnJheTxBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50Pj4ge1xuXHRcdC8vIFRPRE86IENhY2hlIHRoaXNcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbnMoaWQpO1xuXHRcdGNvbnN0IGFjY291bnRzID0gbmV3IEFycmF5PEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQ+KCk7XG5cdFx0Y29uc3Qgc2VlbkFjY291bnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAoIXNlZW5BY2NvdW50cy5oYXMoc2Vzc2lvbi5hY2NvdW50LmxhYmVsKSkge1xuXHRcdFx0XHRzZWVuQWNjb3VudHMuYWRkKHNlc3Npb24uYWNjb3VudC5sYWJlbCk7XG5cdFx0XHRcdGFjY291bnRzLnB1c2goc2Vzc2lvbi5hY2NvdW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFjY291bnRzO1xuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbnMoaWQ6IHN0cmluZywgc2NvcGVMaXN0T3JSZXF1ZXN0PzogUmVhZG9ubHlBcnJheTxzdHJpbmc+IHwgSUF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgb3B0aW9ucz86IElBdXRoZW50aWNhdGlvbkdldFNlc3Npb25zT3B0aW9ucywgYWN0aXZhdGVJbW1lZGlhdGU6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8UmVhZG9ubHlBcnJheTxBdXRoZW50aWNhdGlvblNlc3Npb24+PiB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0aFByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KGlkKSB8fCBhd2FpdCB0aGlzLnRyeUFjdGl2YXRlUHJvdmlkZXIoaWQsIGFjdGl2YXRlSW1tZWRpYXRlKTtcblx0XHRpZiAoYXV0aFByb3ZpZGVyKSB7XG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgaXMgaW4gdGhlIGxpc3Qgb2Ygc3VwcG9ydGVkIGF1dGhvcml6YXRpb24gc2VydmVyc1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gb3B0aW9ucz8uYXV0aG9yaXphdGlvblNlcnZlcjtcblx0XHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdFx0Ly8gU2tpcCB0aGUgcmVzb3VyY2Ugc2VydmVyIGNoZWNrIHNpbmNlIHRoZSBhdXRoIHByb3ZpZGVyIGlkIGNvbnRhaW5zIGEgc3BlY2lmaWMgcmVzb3VyY2Ugc2VydmVyXG5cdFx0XHRcdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IHRoaXMgY2FuIGNoYW5nZSB3aGVuIHdlIGhhdmUgcHJvdmlkZXJzIHRoYXQgc3VwcG9ydCBtdWx0aXBsZSByZXNvdXJjZSBzZXJ2ZXJzXG5cdFx0XHRcdGlmICghdGhpcy5tYXRjaGVzUHJvdmlkZXIoYXV0aFByb3ZpZGVyLCBzZXJ2ZXIpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJyR7aWR9JyBkb2VzIG5vdCBzdXBwb3J0IHRoZSBhdXRob3JpemF0aW9uIHNlcnZlciAnJHtzZXJ2ZXIudG9TdHJpbmcodHJ1ZSl9Jy5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0KHNjb3BlTGlzdE9yUmVxdWVzdCkpIHtcblx0XHRcdFx0aWYgKCFhdXRoUHJvdmlkZXIuZ2V0U2Vzc2lvbnNGcm9tQ2hhbGxlbmdlcykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVGhlIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyICcke2lkfScgZG9lcyBub3Qgc3VwcG9ydCBnZXR0aW5nIHNlc3Npb25zIGZyb20gY2hhbGxlbmdlcy5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgYXV0aFByb3ZpZGVyLmdldFNlc3Npb25zRnJvbUNoYWxsZW5nZXMoXG5cdFx0XHRcdFx0eyBjaGFsbGVuZ2VzOiBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcihzY29wZUxpc3RPclJlcXVlc3Qud3d3QXV0aGVudGljYXRlKSwgZmFsbGJhY2tTY29wZXM6IHNjb3BlTGlzdE9yUmVxdWVzdC5mYWxsYmFja1Njb3BlcyB9LFxuXHRcdFx0XHRcdHsgLi4ub3B0aW9ucyB9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYXdhaXQgYXV0aFByb3ZpZGVyLmdldFNlc3Npb25zKHNjb3BlTGlzdE9yUmVxdWVzdCA/IFsuLi5zY29wZUxpc3RPclJlcXVlc3RdIDogdW5kZWZpbmVkLCB7IC4uLm9wdGlvbnMgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJyR7aWR9JyBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjcmVhdGVTZXNzaW9uKGlkOiBzdHJpbmcsIHNjb3BlTGlzdE9yUmVxdWVzdDogUmVhZG9ubHlBcnJheTxzdHJpbmc+IHwgSUF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgb3B0aW9ucz86IElBdXRoZW50aWNhdGlvbkNyZWF0ZVNlc3Npb25PcHRpb25zKTogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWRTb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQXV0aGVudGljYXRpb24gc2VydmljZSBpcyBkaXNwb3NlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRoUHJvdmlkZXIgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQoaWQpIHx8IGF3YWl0IHRoaXMudHJ5QWN0aXZhdGVQcm92aWRlcihpZCwgISFvcHRpb25zPy5hY3RpdmF0ZUltbWVkaWF0ZSk7XG5cdFx0aWYgKGF1dGhQcm92aWRlcikge1xuXHRcdFx0aWYgKGlzQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0KHNjb3BlTGlzdE9yUmVxdWVzdCkpIHtcblx0XHRcdFx0aWYgKCFhdXRoUHJvdmlkZXIuY3JlYXRlU2Vzc2lvbkZyb21DaGFsbGVuZ2VzKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJyR7aWR9JyBkb2VzIG5vdCBzdXBwb3J0IGNyZWF0aW5nIHNlc3Npb25zIGZyb20gY2hhbGxlbmdlcy5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgYXV0aFByb3ZpZGVyLmNyZWF0ZVNlc3Npb25Gcm9tQ2hhbGxlbmdlcyhcblx0XHRcdFx0XHR7IGNoYWxsZW5nZXM6IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyKHNjb3BlTGlzdE9yUmVxdWVzdC53d3dBdXRoZW50aWNhdGUpLCBmYWxsYmFja1Njb3Blczogc2NvcGVMaXN0T3JSZXF1ZXN0LmZhbGxiYWNrU2NvcGVzIH0sXG5cdFx0XHRcdFx0eyAuLi5vcHRpb25zIH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhd2FpdCBhdXRoUHJvdmlkZXIuY3JlYXRlU2Vzc2lvbihbLi4uc2NvcGVMaXN0T3JSZXF1ZXN0XSwgeyAuLi5vcHRpb25zIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyICcke2lkfScgaXMgY3VycmVudGx5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVtb3ZlU2Vzc2lvbihpZDogc3RyaW5nLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZFNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBzZXJ2aWNlIGlzIGRpc3Bvc2VkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dGhQcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmdldChpZCk7XG5cdFx0aWYgKGF1dGhQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIGF1dGhQcm92aWRlci5yZW1vdmVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJyR7aWR9JyBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcihhdXRob3JpemF0aW9uU2VydmVyOiBVUkksIHJlc291cmNlU2VydmVyPzogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAodGhpcy5tYXRjaGVzUHJvdmlkZXIocHJvdmlkZXIsIGF1dGhvcml6YXRpb25TZXJ2ZXIsIHJlc291cmNlU2VydmVyKSkge1xuXHRcdFx0XHRyZXR1cm4gcHJvdmlkZXIuaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0aFNlcnZlclN0ciA9IGF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5fZGVjbGFyZWRQcm92aWRlcnNcblx0XHRcdC8vIE9ubHkgY29uc2lkZXIgcHJvdmlkZXJzIHRoYXQgYXJlIG5vdCBhbHJlYWR5IHJlZ2lzdGVyZWQgc2luY2Ugd2UgYWxyZWFkeSBjaGVja2VkIHRoZW1cblx0XHRcdC5maWx0ZXIocCA9PiAhdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuaGFzKHAuaWQpKVxuXHRcdFx0LmZpbHRlcihwID0+ICEhcC5hdXRob3JpemF0aW9uU2VydmVyR2xvYnM/LnNvbWUoaSA9PiBtYXRjaChpLCBhdXRoU2VydmVyU3RyLCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpKTtcblxuXHRcdC8vIFRPRE86QFR5bGVyTGVvbmhhcmR0IGZhbiBvdXQ/XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBwcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVByb3ZpZGVyID0gYXdhaXQgdGhpcy50cnlBY3RpdmF0ZVByb3ZpZGVyKHByb3ZpZGVyLmlkLCB0cnVlKTtcblx0XHRcdC8vIENoZWNrIHRoZSByZXNvbHZlZCBhdXRob3JpemF0aW9uIHNlcnZlcnNcblx0XHRcdGlmICh0aGlzLm1hdGNoZXNQcm92aWRlcihhY3RpdmVQcm92aWRlciwgYXV0aG9yaXphdGlvblNlcnZlciwgcmVzb3VyY2VTZXJ2ZXIpKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVQcm92aWRlci5pZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKGF1dGhvcml6YXRpb25TZXJ2ZXI6IFVSSSwgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsIHJlc291cmNlOiBJQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfCB1bmRlZmluZWQsIGNsaWVudElkPzogc3RyaW5nLCBjbGllbnRTZWNyZXQ/OiBzdHJpbmcpOiBQcm9taXNlPElBdXRoZW50aWNhdGlvblByb3ZpZGVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSB0aGlzLl9kZWxlZ2F0ZXNbMF07XG5cdFx0aWYgKCFkZWxlZ2F0ZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgaG9zdCBkZWxlZ2F0ZSBmb3VuZCcpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IGF3YWl0IGRlbGVnYXRlLmNyZWF0ZShhdXRob3JpemF0aW9uU2VydmVyLCBzZXJ2ZXJNZXRhZGF0YSwgcmVzb3VyY2UsIGNsaWVudElkLCBjbGllbnRTZWNyZXQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgQ3JlYXRlZCBkeW5hbWljIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyOiAke3Byb3ZpZGVySWR9YCk7XG5cdFx0XHR0aGlzLl9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkcy5hZGQocHJvdmlkZXJJZCk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBjcmVhdGUgZHluYW1pYyBhdXRoZW50aWNhdGlvbiBwcm92aWRlcjogJHtwcm92aWRlcklkfWApO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVPckdldFhhYVByb3ZpZGVyKGlzc3VlcjogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gYHhhYToke2lzc3Vlci50b1N0cmluZyh0cnVlKX1gO1xuXHRcdGlmICh0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5oYXMocHJvdmlkZXJJZCkpIHtcblx0XHRcdHJldHVybiBwcm92aWRlcklkO1xuXHRcdH1cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2RlbGVnYXRlcy5maW5kKGQgPT4gISFkLmNyZWF0ZVhhYSk7XG5cdFx0aWYgKCFkZWxlZ2F0ZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgaG9zdCBkZWxlZ2F0ZSBzdXBwb3J0cyBYQUEnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBkZWxlZ2F0ZS5jcmVhdGVYYWEhKGlzc3Vlcik7XG5cdFx0aWYgKHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmhhcyhjcmVhdGVkKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgQ3JlYXRlZCBYQUEgYXV0aGVudGljYXRpb24gcHJvdmlkZXI6ICR7Y3JlYXRlZH1gKTtcblx0XHRcdHJldHVybiBjcmVhdGVkO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIFhBQSBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBmb3IgaXNzdWVyOiAke2lzc3Vlci50b1N0cmluZyh0cnVlKX1gKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVySG9zdERlbGVnYXRlKGRlbGVnYXRlOiBJQXV0aGVudGljYXRpb25Qcm92aWRlckhvc3REZWxlZ2F0ZSk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9kZWxlZ2F0ZXMucHVzaChkZWxlZ2F0ZSk7XG5cdFx0dGhpcy5fZGVsZWdhdGVzLnNvcnQoKGEsIGIpID0+IGIucHJpb3JpdHkgLSBhLnByaW9yaXR5KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZGVsZWdhdGVzLmluZGV4T2YoZGVsZWdhdGUpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVsZWdhdGVzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzUHJvdmlkZXIocHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBhdXRob3JpemF0aW9uU2VydmVyOiBVUkksIHJlc291cmNlU2VydmVyPzogVVJJKTogYm9vbGVhbiB7XG5cdFx0Ly8gSWYgYSByZXNvdXJjZVNlcnZlciBpcyBwcm92aWRlZCBhbmQgdGhlIHByb3ZpZGVyIGhhcyBhIHJlc291cmNlU2VydmVyIGRlZmluZWQsIHRoZXkgbXVzdCBtYXRjaFxuXHRcdGlmIChyZXNvdXJjZVNlcnZlciAmJiBwcm92aWRlci5yZXNvdXJjZVNlcnZlcikge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VTZXJ2ZXJTdHIgPSByZXNvdXJjZVNlcnZlci50b1N0cmluZyh0cnVlKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyUmVzb3VyY2VTZXJ2ZXJTdHIgPSBwcm92aWRlci5yZXNvdXJjZVNlcnZlci50b1N0cmluZyh0cnVlKTtcblx0XHRcdGlmICghZXF1YWxzSWdub3JlQ2FzZShwcm92aWRlclJlc291cmNlU2VydmVyU3RyLCByZXNvdXJjZVNlcnZlclN0cikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwcm92aWRlci5hdXRob3JpemF0aW9uU2VydmVycykge1xuXHRcdFx0Y29uc3QgYXV0aFNlcnZlclN0ciA9IGF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBwcm92aWRlci5hdXRob3JpemF0aW9uU2VydmVycykge1xuXHRcdFx0XHRjb25zdCBzdHIgPSBzZXJ2ZXIudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdGlmIChlcXVhbHNJZ25vcmVDYXNlKHN0ciwgYXV0aFNlcnZlclN0cikgfHwgbWF0Y2goc3RyLCBhdXRoU2VydmVyU3RyLCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyeUFjdGl2YXRlUHJvdmlkZXIocHJvdmlkZXJJZDogc3RyaW5nLCBhY3RpdmF0ZUltbWVkaWF0ZTogYm9vbGVhbik6IFByb21pc2U8SUF1dGhlbnRpY2F0aW9uUHJvdmlkZXI+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gRG9uJ3QgYXdhaXQgYWN0aXZhdGVCeUV2ZW50IGV4Y2x1c2l2ZWx5IFx1MjAxNCBvbmUgb3IgbW9yZSBleHRlbnNpb25cblx0XHRcdC8vIGhvc3RzIG1heSBiZSBibG9ja2VkIChlLmcuIHdlYndvcmtlciB3YWl0aW5nIG9uIHJlbW90ZSBhdXRob3JpdHkpLFxuXHRcdFx0Ly8gY2F1c2luZyBhIGRlYWRsb2NrLiBJbnN0ZWFkLCByYWNlIHdpdGggdGhlIHByb3ZpZGVyIGJlaW5nXG5cdFx0XHQvLyByZWdpc3RlcmVkIHNvIHdlIGNhbiBwcm9jZWVkIGFzIHNvb24gYXMgYW55IGhvc3QgZGVsaXZlcnMgaXQuICgjMzE1ODQxKVxuXHRcdFx0Y29uc3QgYWN0aXZhdGlvblByb21pc2UgPSB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChcblx0XHRcdFx0Z2V0QXV0aGVudGljYXRpb25Qcm92aWRlckFjdGl2YXRpb25FdmVudChwcm92aWRlcklkKSxcblx0XHRcdFx0YWN0aXZhdGVJbW1lZGlhdGUgPyBBY3RpdmF0aW9uS2luZC5JbW1lZGlhdGUgOiBBY3RpdmF0aW9uS2luZC5Ob3JtYWxcblx0XHRcdCk7XG5cblx0XHRcdGxldCBwcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmdldChwcm92aWRlcklkKTtcblx0XHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWRTb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBzZXJ2aWNlIGlzIGRpc3Bvc2VkLicpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm92aWRlclJlZ2lzdGVyZWQgPSByYWNlQ2FuY2VsbGF0aW9uKFxuXHRcdFx0XHRFdmVudC50b1Byb21pc2UoXG5cdFx0XHRcdFx0RXZlbnQuZmlsdGVyKFxuXHRcdFx0XHRcdFx0dGhpcy5vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcixcblx0XHRcdFx0XHRcdGUgPT4gZS5pZCA9PT0gcHJvdmlkZXJJZCxcblx0XHRcdFx0XHRcdHN0b3JlXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRzdG9yZVxuXHRcdFx0XHQpLFxuXHRcdFx0XHR0aGlzLl9kaXNwb3NlZFNvdXJjZS50b2tlblxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgZWl0aGVyIGFjdGl2YXRpb24gdG8gY29tcGxldGUgb3IgdGhlIHByb3ZpZGVyIHRvIHJlZ2lzdGVyLlxuXHRcdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFthY3RpdmF0aW9uUHJvbWlzZSwgcHJvdmlkZXJSZWdpc3RlcmVkXSk7XG5cblx0XHRcdHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBwcm92aWRlcjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVE9ETzogUmVtb3ZlIHRoaXMgdGltZW91dCBhbmQgZmlndXJlIG91dCBhIGJldHRlciB3YXkgdG8gZW5zdXJlIGF1dGggcHJvdmlkZXJzXG5cdFx0XHQvLyBhcmUgcmVnaXN0ZXJlZCBfZHVyaW5nXyBleHRlbnNpb24gYWN0aXZhdGlvbi5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KHByb3ZpZGVyUmVnaXN0ZXJlZCwgNTAwMCk7XG5cdFx0XHRwcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmdldChwcm92aWRlcklkKTtcblx0XHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRpbWVkIG91dCB3YWl0aW5nIGZvciBhdXRoZW50aWNhdGlvbiBwcm92aWRlciAnJHtwcm92aWRlcklkfScgdG8gcmVnaXN0ZXIuYCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyICcke3Byb3ZpZGVySWR9JyBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBBdXRoZW50aWNhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksZUFBZSxpQkFBOEIsY0FBYyxvQkFBb0I7QUFDcEcsU0FBUyxrQkFBa0IsMkJBQTJCO0FBQ3RELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUdyRCxTQUFTLG9DQUFvQztBQUM3QyxTQUEwUSx3QkFBK0QsOENBQThDO0FBQ3ZYLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGFBQWE7QUFFdEIsU0FBZ0Ysa0NBQWtDO0FBQ2xILFNBQVMsa0JBQWtCLG1CQUFtQjtBQUM5QyxT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
