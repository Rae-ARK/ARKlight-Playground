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
import * as nls from "../../../nls.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { MainContext } from "./extHost.protocol.js";
import { Disposable, ProgressLocation } from "./extHostTypes.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { INTERNAL_AUTH_PROVIDER_PREFIX, isAuthenticationWwwAuthenticateRequest } from "../../services/authentication/common/authentication.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { URI } from "../../../base/common/uri.js";
import { AuthorizationErrorType, fetchDynamicRegistration, getClaimsFromJWT, isAuthorizationErrorResponse, isAuthorizationTokenResponse } from "../../../base/common/oauth.js";
import { IExtHostWindow } from "./extHostWindow.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { ILoggerService, ILogService } from "../../../platform/log/common/log.js";
import { autorun, derivedOpts, observableValue } from "../../../base/common/observable.js";
import { stringHash } from "../../../base/common/hash.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { IExtHostUrlsService } from "./extHostUrls.js";
import { encodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { equals as arraysEqual } from "../../../base/common/arrays.js";
import { IExtHostProgress } from "./extHostProgress.js";
import { CancellationError, isCancellationError } from "../../../base/common/errors.js";
import { raceCancellationError, SequencerByKey } from "../../../base/common/async.js";
import { XaaifyAuthProvider } from "./extHostXaaAuthProvider.js";
const IExtHostAuthentication = createDecorator("IExtHostAuthentication");
let ExtHostAuthentication = class {
  constructor(extHostRpc, _initData, _extHostWindow, _extHostUrls, _extHostProgress, _extHostLoggerService, _logService) {
    this._initData = _initData;
    this._extHostWindow = _extHostWindow;
    this._extHostUrls = _extHostUrls;
    this._extHostProgress = _extHostProgress;
    this._extHostLoggerService = _extHostLoggerService;
    this._logService = _logService;
    this._dynamicAuthProviderCtor = DynamicAuthProvider;
    this._xaaAuthProviderCtor = XaaifyAuthProvider(DynamicAuthProvider);
    this._authenticationProviders = /* @__PURE__ */ new Map();
    this._providerOperations = new SequencerByKey();
    this._onDidChangeSessions = new Emitter();
    this._getSessionTaskSingler = new TaskSingler();
    this._onDidDynamicAuthProviderTokensChange = new Emitter();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadAuthentication);
  }
  /**
   * This sets up an event that will fire when the auth sessions change with a built-in filter for the extensionId
   * if a session change only affects a specific extension.
   * @param extensionId The extension that is interested in the event.
   * @returns An event with a built-in filter for the extensionId
   */
  getExtensionScopedSessionsEvent(extensionId) {
    const normalizedExtensionId = extensionId.toLowerCase();
    return Event.chain(
      this._onDidChangeSessions.event,
      ($) => $.filter((e) => !e.extensionIdFilter || e.extensionIdFilter.includes(normalizedExtensionId)).map((e) => ({ provider: e.provider }))
    );
  }
  async getSession(requestingExtension, providerId, scopesOrRequest, options = {}) {
    const extensionId = ExtensionIdentifier.toKey(requestingExtension.identifier);
    const keys = Object.keys(options);
    const optionsStr = keys.map((key) => {
      switch (key) {
        case "account":
          return `${key}:${options.account?.id}`;
        case "createIfNone":
        case "forceNewSession": {
          const value = typeof options[key] === "boolean" ? `${options[key]}` : `'${options[key]?.detail}/${options[key]?.learnMore?.toString()}'`;
          return `${key}:${value}`;
        }
        case "authorizationServer":
          return `${key}:${options.authorizationServer?.toString(true)}`;
        default:
          return `${key}:${!!options[key]}`;
      }
    }).sort().join(", ");
    let singlerKey;
    if (isAuthenticationWwwAuthenticateRequest(scopesOrRequest)) {
      const challenge = scopesOrRequest;
      const challengeStr = challenge.wwwAuthenticate;
      const scopesStr = challenge.fallbackScopes ? [...challenge.fallbackScopes].sort().join(" ") : "";
      singlerKey = `${extensionId} ${providerId} challenge:${challengeStr} ${scopesStr} ${optionsStr}`;
    } else {
      const sortedScopes = [...scopesOrRequest].sort().join(" ");
      singlerKey = `${extensionId} ${providerId} ${sortedScopes} ${optionsStr}`;
    }
    return await this._getSessionTaskSingler.getOrCreate(singlerKey, async () => {
      await this._proxy.$ensureProvider(providerId);
      const extensionName = requestingExtension.displayName || requestingExtension.name;
      return this._proxy.$getSession(providerId, scopesOrRequest, extensionId, extensionName, options);
    });
  }
  async getAccounts(providerId) {
    await this._proxy.$ensureProvider(providerId);
    return await this._proxy.$getAccounts(providerId);
  }
  registerAuthenticationProvider(id, label, provider, options) {
    void this._providerOperations.queue(id, async () => {
      if (this._authenticationProviders.get(id)) {
        this._logService.error(`An authentication provider with id '${id}' is already registered. The existing provider will not be replaced.`);
        return;
      }
      const listener = provider.onDidChangeSessions((e) => this._proxy.$sendDidChangeSessions(id, e));
      this._authenticationProviders.set(id, { label, provider, disposable: listener, options: options ?? { supportsMultipleAccounts: false } });
      await this._proxy.$registerAuthenticationProvider({
        id,
        label,
        supportsMultipleAccounts: options?.supportsMultipleAccounts ?? false,
        supportedAuthorizationServers: options?.supportedAuthorizationServers,
        supportsChallenges: options?.supportsChallenges
      });
    });
    return new Disposable(() => {
      void this._providerOperations.queue(id, async () => {
        const providerData = this._authenticationProviders.get(id);
        if (providerData) {
          providerData.disposable?.dispose();
          this._authenticationProviders.delete(id);
          await this._proxy.$unregisterAuthenticationProvider(id);
        }
      });
    });
  }
  $createSession(providerId, scopes, options) {
    return this._providerOperations.queue(providerId, async () => {
      const providerData = this._authenticationProviders.get(providerId);
      if (providerData) {
        options.authorizationServer = URI.revive(options.authorizationServer);
        return await providerData.provider.createSession(scopes, options);
      }
      throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    });
  }
  $removeSession(providerId, sessionId) {
    return this._providerOperations.queue(providerId, async () => {
      const providerData = this._authenticationProviders.get(providerId);
      if (providerData) {
        return await providerData.provider.removeSession(sessionId);
      }
      throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    });
  }
  $getSessions(providerId, scopes, options) {
    return this._providerOperations.queue(providerId, async () => {
      const providerData = this._authenticationProviders.get(providerId);
      if (providerData) {
        options.authorizationServer = URI.revive(options.authorizationServer);
        return await providerData.provider.getSessions(scopes, options);
      }
      throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    });
  }
  $getSessionsFromChallenges(providerId, constraint, options) {
    return this._providerOperations.queue(providerId, async () => {
      const providerData = this._authenticationProviders.get(providerId);
      if (providerData) {
        const provider = providerData.provider;
        if (typeof provider.getSessionsFromChallenges === "function") {
          options.authorizationServer = URI.revive(options.authorizationServer);
          return await provider.getSessionsFromChallenges(constraint, options);
        }
        throw new Error(`Authentication provider with handle: ${providerId} does not support getSessionsFromChallenges`);
      }
      throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    });
  }
  $createSessionFromChallenges(providerId, constraint, options) {
    return this._providerOperations.queue(providerId, async () => {
      const providerData = this._authenticationProviders.get(providerId);
      if (providerData) {
        const provider = providerData.provider;
        if (typeof provider.createSessionFromChallenges === "function") {
          options.authorizationServer = URI.revive(options.authorizationServer);
          return await provider.createSessionFromChallenges(constraint, options);
        }
        throw new Error(`Authentication provider with handle: ${providerId} does not support createSessionFromChallenges`);
      }
      throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
    });
  }
  $onDidChangeAuthenticationSessions(id, label, extensionIdFilter) {
    if (!id.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
      this._onDidChangeSessions.fire({ provider: { id, label }, extensionIdFilter });
    }
    return Promise.resolve();
  }
  $onDidUnregisterAuthenticationProvider(id) {
    return this._providerOperations.queue(id, async () => {
      const providerData = this._authenticationProviders.get(id);
      if (providerData) {
        providerData.disposable?.dispose();
        this._authenticationProviders.delete(id);
      }
    });
  }
  async $registerDynamicAuthProvider(authorizationServerComponents, serverMetadata, resourceMetadata, clientId, clientSecret, initialTokens) {
    if (!clientId) {
      const authorizationServer = URI.revive(authorizationServerComponents);
      if (serverMetadata.registration_endpoint) {
        try {
          const registration = await fetchDynamicRegistration(serverMetadata, this._initData.environment.appName, resourceMetadata?.scopes_supported);
          clientId = registration.client_id;
          clientSecret = registration.client_secret;
        } catch (err) {
          this._logService.warn(`Dynamic registration failed for ${authorizationServer.toString()}: ${err.message}. Prompting user for client ID and client secret...`);
        }
      }
      if (!clientId) {
        this._logService.info(`Prompting user for client registration details for ${authorizationServer.toString()}`);
        const clientDetails = await this._proxy.$promptForClientRegistration(authorizationServer.toString());
        if (!clientDetails) {
          throw new Error("User did not provide client details");
        }
        clientId = clientDetails.clientId;
        clientSecret = clientDetails.clientSecret;
        this._logService.info(`User provided client registration for ${authorizationServer.toString()}`);
        if (clientSecret) {
          this._logService.trace(`User provided client secret for ${authorizationServer.toString()}`);
        } else {
          this._logService.trace(`User did not provide client secret for ${authorizationServer.toString()}`);
        }
      }
    }
    const provider = new this._dynamicAuthProviderCtor(
      this._extHostWindow,
      this._extHostUrls,
      this._initData,
      this._extHostProgress,
      this._extHostLoggerService,
      this._proxy,
      URI.revive(authorizationServerComponents),
      serverMetadata,
      resourceMetadata,
      clientId,
      clientSecret,
      this._onDidDynamicAuthProviderTokensChange,
      initialTokens || []
    );
    await this._providerOperations.queue(provider.id, async () => {
      this._authenticationProviders.set(
        provider.id,
        {
          label: provider.label,
          provider,
          disposable: Disposable.from(
            provider,
            provider.onDidChangeSessions((e) => this._proxy.$sendDidChangeSessions(provider.id, e)),
            provider.onDidChangeClientId(() => this._proxy.$sendDidChangeDynamicProviderInfo({
              providerId: provider.id,
              clientId: provider.clientId,
              clientSecret: provider.clientSecret
            }))
          ),
          options: { supportsMultipleAccounts: true }
        }
      );
      await this._proxy.$registerDynamicAuthenticationProvider({
        id: provider.id,
        label: provider.label,
        supportsMultipleAccounts: true,
        authorizationServer: authorizationServerComponents,
        resourceServer: resourceMetadata ? URI.parse(resourceMetadata.resource) : void 0,
        clientId: provider.clientId,
        clientSecret: provider.clientSecret
      });
    });
    return provider.id;
  }
  async $registerXaaAuthProvider(issuerComponents, serverMetadata, clientId, clientSecret, initialTokens) {
    const issuer = URI.revive(issuerComponents);
    if (!clientId) {
      this._logService.info(`Prompting user for client registration details for XAA issuer ${issuer.toString()}`);
      const clientDetails = await this._proxy.$promptForClientRegistration(issuer.toString());
      if (!clientDetails) {
        throw new Error("User did not provide client details");
      }
      clientId = clientDetails.clientId;
      clientSecret = clientDetails.clientSecret;
    }
    const provider = new this._xaaAuthProviderCtor(
      this._extHostWindow,
      this._extHostUrls,
      this._initData,
      this._extHostProgress,
      this._extHostLoggerService,
      this._proxy,
      issuer,
      serverMetadata,
      /* resourceMetadata */
      void 0,
      clientId,
      clientSecret,
      this._onDidDynamicAuthProviderTokensChange,
      initialTokens || []
    );
    await this._providerOperations.queue(provider.id, async () => {
      this._authenticationProviders.set(
        provider.id,
        {
          label: provider.label,
          provider,
          disposable: Disposable.from(
            provider,
            provider.onDidChangeSessions((e) => this._proxy.$sendDidChangeSessions(provider.id, e)),
            provider.onDidChangeClientId(() => this._proxy.$sendDidChangeDynamicProviderInfo({
              providerId: provider.id,
              clientId: provider.clientId,
              clientSecret: provider.clientSecret
            }))
          ),
          options: { supportsMultipleAccounts: true }
        }
      );
      await this._proxy.$registerDynamicAuthenticationProvider({
        id: provider.id,
        label: provider.label,
        supportsMultipleAccounts: true,
        authorizationServer: issuerComponents,
        resourceServer: void 0,
        clientId: provider.clientId,
        clientSecret: provider.clientSecret
      });
    });
    return provider.id;
  }
  async $onDidChangeDynamicAuthProviderTokens(authProviderId, clientId, tokens) {
    this._onDidDynamicAuthProviderTokensChange.fire({ authProviderId, clientId, tokens });
  }
};
ExtHostAuthentication = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, IExtHostWindow),
  __decorateParam(3, IExtHostUrlsService),
  __decorateParam(4, IExtHostProgress),
  __decorateParam(5, ILoggerService),
  __decorateParam(6, ILogService)
], ExtHostAuthentication);
class TaskSingler {
  constructor() {
    this._inFlightPromises = /* @__PURE__ */ new Map();
  }
  getOrCreate(key, promiseFactory) {
    const inFlight = this._inFlightPromises.get(key);
    if (inFlight) {
      return inFlight;
    }
    const promise = promiseFactory().finally(() => this._inFlightPromises.delete(key));
    this._inFlightPromises.set(key, promise);
    return promise;
  }
}
let DynamicAuthProvider = class {
  constructor(_extHostWindow, _extHostUrls, _initData, _extHostProgress, loggerService, _proxy, authorizationServer, _serverMetadata, _resourceMetadata, _clientId, _clientSecret, onDidDynamicAuthProviderTokensChange, initialTokens, _fetch = fetch) {
    this._extHostWindow = _extHostWindow;
    this._extHostUrls = _extHostUrls;
    this._initData = _initData;
    this._extHostProgress = _extHostProgress;
    this._proxy = _proxy;
    this.authorizationServer = authorizationServer;
    this._serverMetadata = _serverMetadata;
    this._resourceMetadata = _resourceMetadata;
    this._clientId = _clientId;
    this._clientSecret = _clientSecret;
    this._fetch = _fetch;
    this._onDidChangeSessions = new Emitter();
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidChangeClientId = new Emitter();
    this.onDidChangeClientId = this._onDidChangeClientId.event;
    const stringifiedServer = authorizationServer.toString(true);
    this.id = _resourceMetadata?.resource ? stringifiedServer + " " + _resourceMetadata?.resource : stringifiedServer;
    this.label = _resourceMetadata?.resource_name ?? this.authorizationServer.authority;
    this._logger = loggerService.createLogger(this.id, { name: `Auth: ${this.label}` });
    this._disposable = new DisposableStore();
    this._disposable.add(this._onDidChangeSessions);
    this._disposable.add(this._onDidChangeClientId);
    const scopedEvent = Event.chain(
      onDidDynamicAuthProviderTokensChange.event,
      ($) => $.filter((e) => e.authProviderId === this.id && e.clientId === _clientId).map((e) => e.tokens)
    );
    this._tokenStore = this._disposable.add(new TokenStore(
      {
        onDidChange: scopedEvent,
        set: (tokens) => _proxy.$setSessionsForDynamicAuthProvider(this.id, this.clientId, tokens)
      },
      initialTokens,
      this._logger
    ));
    this._disposable.add(this._tokenStore.onDidChangeSessions((e) => this._onDidChangeSessions.fire(e)));
    this._createFlows = [];
    if (_serverMetadata.authorization_endpoint) {
      this._createFlows.push({
        label: nls.localize("url handler", "URL Handler"),
        handler: (scopes, progress, token) => this._createWithUrlHandler(scopes, progress, token)
      });
    }
  }
  get clientId() {
    return this._clientId;
  }
  get clientSecret() {
    return this._clientSecret;
  }
  async getSessions(scopes, options) {
    this._logger.info(`Getting sessions for scopes: ${scopes?.join(" ") ?? "all"}`);
    if (!scopes) {
      return this._tokenStore.sessions;
    }
    const sortedScopes = [...scopes].sort();
    const scopeStr = scopes.join(" ");
    let sessions = this._tokenStore.sessions.filter((session) => arraysEqual([...session.scopes].sort(), sortedScopes));
    this._logger.info(`Found ${sessions.length} sessions for scopes: ${scopeStr}`);
    if (sessions.length) {
      const newTokens = [];
      const removedTokens = [];
      const tokenMap = new Map(this._tokenStore.tokens.map((token) => [token.access_token, token]));
      for (const session of sessions) {
        const token = tokenMap.get(session.accessToken);
        if (token && token.expires_in) {
          const now = Date.now();
          const expiresInMS = token.expires_in * 1e3;
          if (now > token.created_at + expiresInMS - 5 * 60 * 1e3) {
            this._logger.info(`Token for session ${session.id} is about to expire, refreshing...`);
            removedTokens.push(token);
            if (!token.refresh_token) {
              this._logger.warn(`No refresh token available for scopes ${session.scopes.join(" ")}. Throwing away token.`);
              continue;
            }
            try {
              const newToken = await this.exchangeRefreshTokenForToken(token.refresh_token, options.silent !== true);
              if (newToken.scope !== scopeStr) {
                this._logger.warn(`Token scopes '${newToken.scope}' do not match requested scopes '${scopeStr}'. Overwriting token with what was requested...`);
                newToken.scope = scopeStr;
              }
              this._logger.info(`Successfully created a new token for scopes ${session.scopes.join(" ")}.`);
              newTokens.push(newToken);
            } catch (err) {
              this._logger.error(`Failed to refresh token: ${err}`);
            }
          }
        }
      }
      if (newTokens.length || removedTokens.length) {
        this._tokenStore.update({ added: newTokens, removed: removedTokens });
        sessions = this._tokenStore.sessions.filter((session) => arraysEqual([...session.scopes].sort(), sortedScopes));
      }
      this._logger.info(`Found ${sessions.length} sessions for scopes: ${scopeStr}`);
      return sessions;
    }
    return [];
  }
  async createSession(scopes, _options) {
    this._logger.info(`Creating session for scopes: ${scopes.join(" ")}`);
    let token;
    for (let i = 0; i < this._createFlows.length; i++) {
      const { handler } = this._createFlows[i];
      try {
        token = await this._extHostProgress.withProgressFromSource(
          { label: this.label, id: this.id },
          {
            location: ProgressLocation.Notification,
            title: nls.localize("authenticatingTo", "Authenticating to '{0}'", this.label),
            cancellable: true
          },
          (progress, token2) => handler(scopes, progress, token2)
        );
        if (token) {
          break;
        }
      } catch (err) {
        const nextMode = this._createFlows[i + 1]?.label;
        if (!nextMode) {
          break;
        }
        const message = isCancellationError(err) ? nls.localize("userCanceledContinue", "Having trouble authenticating to '{0}'? Would you like to try a different way? ({1})", this.label, nextMode) : nls.localize("continueWith", "You have not yet finished authenticating to '{0}'. Would you like to try a different way? ({1})", this.label, nextMode);
        const result = await this._proxy.$showContinueNotification(message);
        if (!result) {
          throw new CancellationError();
        }
        this._logger.error(`Failed to create token via flow '${nextMode}': ${err}`);
      }
    }
    if (!token) {
      throw new Error("Failed to create authentication token");
    }
    if (token.scope !== scopes.join(" ")) {
      this._logger.warn(`Token scopes '${token.scope}' do not match requested scopes '${scopes.join(" ")}'. Overwriting token with what was requested...`);
      token.scope = scopes.join(" ");
    }
    this._tokenStore.update({ added: [{ ...token, created_at: Date.now() }], removed: [] });
    const session = this._tokenStore.sessions.find((t) => t.accessToken === token.access_token);
    this._logger.info(`Created ${token.refresh_token ? "refreshable" : "non-refreshable"} session for scopes: ${token.scope}${token.expires_in ? ` that expires in ${token.expires_in} seconds` : ""}`);
    return session;
  }
  async removeSession(sessionId) {
    this._logger.info(`Removing session with id: ${sessionId}`);
    const session = this._tokenStore.sessions.find((session2) => session2.id === sessionId);
    if (!session) {
      this._logger.error(`Session with id ${sessionId} not found`);
      return;
    }
    const token = this._tokenStore.tokens.find((token2) => token2.access_token === session.accessToken);
    if (!token) {
      this._logger.error(`Failed to retrieve token for removed session: ${session.id}`);
      return;
    }
    this._tokenStore.update({ added: [], removed: [token] });
    this._logger.info(`Removed token for session: ${session.id} with scopes: ${session.scopes.join(" ")}`);
  }
  dispose() {
    this._disposable.dispose();
  }
  async _createWithUrlHandler(scopes, progress, token) {
    if (!this._serverMetadata.authorization_endpoint) {
      throw new Error("Authorization Endpoint required");
    }
    if (!this._serverMetadata.token_endpoint) {
      throw new Error("Token endpoint not available in server metadata");
    }
    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const nonce = this.generateRandomString(32);
    const callbackUri = URI.parse(`${this._initData.environment.appUriScheme}://dynamicauthprovider/${this.authorizationServer.authority}/authorize?nonce=${nonce}`);
    let state;
    try {
      state = await this._extHostUrls.createAppUri(callbackUri);
    } catch (error) {
      throw new Error(`Failed to create external URI: ${error}`);
    }
    const authorizationUrl = new URL(this._serverMetadata.authorization_endpoint);
    authorizationUrl.searchParams.append("client_id", this._clientId);
    authorizationUrl.searchParams.append("response_type", "code");
    authorizationUrl.searchParams.append("state", state.toString());
    authorizationUrl.searchParams.append("code_challenge", codeChallenge);
    authorizationUrl.searchParams.append("code_challenge_method", "S256");
    const scopeString = scopes.join(" ");
    if (scopeString) {
      authorizationUrl.searchParams.append("scope", scopeString);
    }
    if (this._resourceMetadata?.resource) {
      authorizationUrl.searchParams.append("resource", this._resourceMetadata.resource);
    }
    const redirectUri = "https://vscode.dev/redirect";
    authorizationUrl.searchParams.append("redirect_uri", redirectUri);
    const promise = this.waitForAuthorizationCode(callbackUri);
    this._logger.info(`Opening authorization URL for scopes: ${scopeString}`);
    this._logger.trace(`Authorization URL: ${authorizationUrl.toString()}`);
    const opened = await this._extHostWindow.openUri(authorizationUrl.toString(), {});
    if (!opened) {
      throw new CancellationError();
    }
    progress.report({
      message: nls.localize("completeAuth", "Complete the authentication in the browser window that has opened.")
    });
    let code;
    try {
      const response = await raceCancellationError(promise, token);
      code = response.code;
    } catch (err) {
      if (isCancellationError(err)) {
        this._logger.info("Authorization code request was cancelled by the user.");
        throw err;
      }
      this._logger.error(`Failed to receive authorization code: ${err}`);
      throw new Error(`Failed to receive authorization code: ${err}`);
    }
    this._logger.info(`Authorization code received for scopes: ${scopeString}`);
    const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier, redirectUri);
    return tokenResponse;
  }
  generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, length);
  }
  async generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return encodeBase64(VSBuffer.wrap(new Uint8Array(digest)), false, false).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async waitForAuthorizationCode(expectedState) {
    const result = await this._proxy.$waitForUriHandler(expectedState);
    const codeMatch = /[?&]code=([^&]+)/.exec(result.query || "");
    if (!codeMatch || codeMatch.length < 2) {
      throw new Error("Authentication failed: No authorization code received");
    }
    return { code: codeMatch[1] };
  }
  async exchangeCodeForToken(code, codeVerifier, redirectUri) {
    if (!this._serverMetadata.token_endpoint) {
      throw new Error("Token endpoint not available in server metadata");
    }
    const tokenRequest = new URLSearchParams();
    tokenRequest.append("client_id", this._clientId);
    tokenRequest.append("grant_type", "authorization_code");
    tokenRequest.append("code", code);
    tokenRequest.append("redirect_uri", redirectUri);
    tokenRequest.append("code_verifier", codeVerifier);
    if (this._resourceMetadata?.resource) {
      tokenRequest.append("resource", this._resourceMetadata.resource);
    }
    if (this._clientSecret) {
      tokenRequest.append("client_secret", this._clientSecret);
    }
    this._logger.info("Exchanging authorization code for token...");
    this._logger.trace(`Url: ${this._serverMetadata.token_endpoint}`);
    this._logger.trace(`Token request body: ${tokenRequest.toString()}`);
    let response;
    try {
      response = await this._fetch(this._serverMetadata.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: tokenRequest.toString()
      });
    } catch (err) {
      this._logger.error(`Failed to exchange authorization code for token: ${err}`);
      throw new Error(`Failed to exchange authorization code for token: ${err}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${text}`);
    }
    const result = await response.json();
    if (isAuthorizationTokenResponse(result)) {
      this._logger.info(`Successfully exchanged authorization code for token.`);
      return result;
    } else if (isAuthorizationErrorResponse(result) && result.error === AuthorizationErrorType.InvalidClient) {
      this._logger.warn(`Client ID (${this._clientId}) was invalid, generated a new one.`);
      await this._generateNewClientId();
      throw new Error(`Client ID was invalid, generated a new one. Please try again.`);
    }
    throw new Error(`Invalid authorization token response: ${JSON.stringify(result)}`);
  }
  async exchangeRefreshTokenForToken(refreshToken, allowClientRegistration) {
    if (!this._serverMetadata.token_endpoint) {
      throw new Error("Token endpoint not available in server metadata");
    }
    const tokenRequest = new URLSearchParams();
    tokenRequest.append("client_id", this._clientId);
    tokenRequest.append("grant_type", "refresh_token");
    tokenRequest.append("refresh_token", refreshToken);
    if (this._resourceMetadata?.resource) {
      tokenRequest.append("resource", this._resourceMetadata.resource);
    }
    if (this._clientSecret) {
      tokenRequest.append("client_secret", this._clientSecret);
    }
    const response = await this._fetch(this._serverMetadata.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: tokenRequest.toString()
    });
    const result = await response.json();
    if (isAuthorizationTokenResponse(result)) {
      return {
        ...result,
        created_at: Date.now()
      };
    } else if (isAuthorizationErrorResponse(result) && result.error === AuthorizationErrorType.InvalidClient) {
      if (!allowClientRegistration) {
        this._logger.warn(`Client ID (${this._clientId}) was invalid while silently refreshing the token.`);
        throw new Error(`Client ID was invalid while silently refreshing the token.`);
      }
      this._logger.warn(`Client ID (${this._clientId}) was invalid, generated a new one.`);
      await this._generateNewClientId();
      throw new Error(`Client ID was invalid, generated a new one. Please try again.`);
    }
    throw new Error(`Invalid authorization token response: ${JSON.stringify(result)}`);
  }
  async _generateNewClientId() {
    try {
      const registration = await fetchDynamicRegistration(this._serverMetadata, this._initData.environment.appName, this._resourceMetadata?.scopes_supported);
      this._clientId = registration.client_id;
      this._clientSecret = registration.client_secret;
      this._onDidChangeClientId.fire();
    } catch (err) {
      this._logger.info(`Dynamic registration failed for ${this.authorizationServer.toString()}: ${err}. Prompting user for client ID and client secret.`);
      try {
        const clientDetails = await this._proxy.$promptForClientRegistration(this.authorizationServer.toString());
        if (!clientDetails) {
          throw new Error("User did not provide client details");
        }
        this._clientId = clientDetails.clientId;
        this._clientSecret = clientDetails.clientSecret;
        this._logger.info(`User provided client ID for ${this.authorizationServer.toString()}`);
        if (clientDetails.clientSecret) {
          this._logger.info(`User provided client secret for ${this.authorizationServer.toString()}`);
        } else {
          this._logger.info(`User did not provide client secret for ${this.authorizationServer.toString()} (optional)`);
        }
        this._onDidChangeClientId.fire();
      } catch (promptErr) {
        this._logger.error(`Failed to fetch new client ID and user did not provide one: ${err}`);
        throw new Error(`Failed to fetch new client ID and user did not provide one: ${err}`);
      }
    }
  }
};
DynamicAuthProvider = __decorateClass([
  __decorateParam(0, IExtHostWindow),
  __decorateParam(1, IExtHostUrlsService),
  __decorateParam(2, IExtHostInitDataService),
  __decorateParam(3, IExtHostProgress),
  __decorateParam(4, ILoggerService)
], DynamicAuthProvider);
class TokenStore {
  constructor(_persistence, initialTokens, _logger) {
    this._persistence = _persistence;
    this._logger = _logger;
    this._onDidChangeSessions = new Emitter();
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._disposable = new DisposableStore();
    this._tokensObservable = observableValue("tokens", initialTokens);
    this._sessionsObservable = derivedOpts(
      { equalsFn: (a, b) => arraysEqual(a, b, (a2, b2) => a2.accessToken === b2.accessToken) },
      (reader) => this._tokensObservable.read(reader).map((t) => this._getSessionFromToken(t))
    );
    this._disposable.add(this._registerChangeEventAutorun());
    this._disposable.add(this._persistence.onDidChange((tokens) => this._tokensObservable.set(tokens, void 0)));
  }
  get tokens() {
    return this._tokensObservable.get();
  }
  get sessions() {
    return this._sessionsObservable.get();
  }
  dispose() {
    this._disposable.dispose();
  }
  update({ added, removed }) {
    this._logger.trace(`Updating tokens: added ${added.length}, removed ${removed.length}`);
    const currentTokens = [...this._tokensObservable.get()];
    for (const token of removed) {
      const index = currentTokens.findIndex((t) => t.access_token === token.access_token);
      if (index !== -1) {
        currentTokens.splice(index, 1);
      }
    }
    for (const token of added) {
      const index = currentTokens.findIndex((t) => t.access_token === token.access_token);
      if (index === -1) {
        currentTokens.push(token);
      } else {
        currentTokens[index] = token;
      }
    }
    if (added.length || removed.length) {
      this._tokensObservable.set(currentTokens, void 0);
      void this._persistence.set(currentTokens);
    }
    this._logger.trace(`Tokens updated: ${currentTokens.length} tokens stored.`);
  }
  _registerChangeEventAutorun() {
    let previousSessions = [];
    return autorun((reader) => {
      this._logger.trace("Checking for session changes...");
      const currentSessions = this._sessionsObservable.read(reader);
      if (previousSessions === currentSessions) {
        this._logger.trace("No session changes detected.");
        return;
      }
      if (!currentSessions || currentSessions.length === 0) {
        this._logger.trace("All sessions removed.");
        if (previousSessions.length > 0) {
          this._onDidChangeSessions.fire({
            added: [],
            removed: previousSessions,
            changed: []
          });
          previousSessions = [];
        }
        return;
      }
      const added = [];
      const removed = [];
      for (const current of currentSessions) {
        const exists = previousSessions.some((prev) => prev.accessToken === current.accessToken);
        if (!exists) {
          added.push(current);
        }
      }
      for (const prev of previousSessions) {
        const exists = currentSessions.some((current) => current.accessToken === prev.accessToken);
        if (!exists) {
          removed.push(prev);
        }
      }
      if (added.length > 0 || removed.length > 0) {
        this._logger.trace(`Sessions changed: added ${added.length}, removed ${removed.length}`);
        this._onDidChangeSessions.fire({ added, removed, changed: [] });
      }
      previousSessions = currentSessions;
    });
  }
  _getSessionFromToken(token) {
    let claims;
    if (token.id_token) {
      try {
        claims = getClaimsFromJWT(token.id_token);
      } catch (e) {
      }
    }
    if (!claims) {
      try {
        claims = getClaimsFromJWT(token.access_token);
      } catch (e) {
      }
    }
    const scopes = token.scope !== void 0 ? token.scope ? token.scope.split(" ") : [] : claims?.scope ? claims.scope.split(" ") : [];
    return {
      id: stringHash(token.access_token, 0).toString(),
      accessToken: token.access_token,
      account: {
        id: claims?.sub || "unknown",
        // TODO: Don't say MCP...
        label: claims?.preferred_username || claims?.name || claims?.email || "MCP"
      },
      scopes,
      idToken: token.id_token
    };
  }
}
export {
  DynamicAuthProvider,
  ExtHostAuthentication,
  IExtHostAuthentication,
  TokenStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RBdXRoZW50aWNhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblNoYXBlLCBFeHRIb3N0QXV0aGVudGljYXRpb25TaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25HZXRTZXNzaW9uc09wdGlvbnMsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMsIElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYLCBpc0F1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEF1dGhvcml6YXRpb25FcnJvclR5cGUsIGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiwgZ2V0Q2xhaW1zRnJvbUpXVCwgSUF1dGhvcml6YXRpb25KV1RDbGFpbXMsIElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgSUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlLCBpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlLCBpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXaW5kb3cgfSBmcm9tICcuL2V4dEhvc3RXaW5kb3cuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RJbml0RGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UsIElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IHN0cmluZ0hhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RVcmxzU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFVybHMuanMnO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgYXJyYXlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RQcm9ncmVzcyB9IGZyb20gJy4vZXh0SG9zdFByb2dyZXNzLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1N0ZXAgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yLCBTZXF1ZW5jZXJCeUtleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFhhYWlmeUF1dGhQcm92aWRlciB9IGZyb20gJy4vZXh0SG9zdFhhYUF1dGhQcm92aWRlci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RBdXRoZW50aWNhdGlvbiBleHRlbmRzIEV4dEhvc3RBdXRoZW50aWNhdGlvbiB7IH1cbmV4cG9ydCBjb25zdCBJRXh0SG9zdEF1dGhlbnRpY2F0aW9uID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0QXV0aGVudGljYXRpb24+KCdJRXh0SG9zdEF1dGhlbnRpY2F0aW9uJyk7XG5cbmludGVyZmFjZSBQcm92aWRlcldpdGhNZXRhZGF0YSB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHByb3ZpZGVyOiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlcjtcblx0ZGlzcG9zYWJsZT86IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRvcHRpb25zOiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbnM7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0QXV0aGVudGljYXRpb24gaW1wbGVtZW50cyBFeHRIb3N0QXV0aGVudGljYXRpb25TaGFwZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9keW5hbWljQXV0aFByb3ZpZGVyQ3RvciA9IER5bmFtaWNBdXRoUHJvdmlkZXI7XG5cdHByb3RlY3RlZCByZWFkb25seSBfeGFhQXV0aFByb3ZpZGVyQ3RvciA9IFhhYWlmeUF1dGhQcm92aWRlcihEeW5hbWljQXV0aFByb3ZpZGVyKTtcblxuXHRwcml2YXRlIF9wcm94eTogTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uU2hhcGU7XG5cdHByaXZhdGUgX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzOiBNYXA8c3RyaW5nLCBQcm92aWRlcldpdGhNZXRhZGF0YT4gPSBuZXcgTWFwPHN0cmluZywgUHJvdmlkZXJXaXRoTWV0YWRhdGE+KCk7XG5cdHByaXZhdGUgX3Byb3ZpZGVyT3BlcmF0aW9ucyA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IG5ldyBFbWl0dGVyPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQgJiB7IGV4dGVuc2lvbklkRmlsdGVyPzogc3RyaW5nW10gfT4oKTtcblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvblRhc2tTaW5nbGVyID0gbmV3IFRhc2tTaW5nbGVyPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ+KCk7XG5cblx0cHJpdmF0ZSBfb25EaWREeW5hbWljQXV0aFByb3ZpZGVyVG9rZW5zQ2hhbmdlID0gbmV3IEVtaXR0ZXI8eyBhdXRoUHJvdmlkZXJJZDogc3RyaW5nOyBjbGllbnRJZDogc3RyaW5nOyB0b2tlbnM6IElBdXRob3JpemF0aW9uVG9rZW5bXSB9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UsXG5cdFx0QElFeHRIb3N0V2luZG93IHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RXaW5kb3c6IElFeHRIb3N0V2luZG93LFxuXHRcdEBJRXh0SG9zdFVybHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RVcmxzOiBJRXh0SG9zdFVybHNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFByb2dyZXNzIHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RQcm9ncmVzczogSUV4dEhvc3RQcm9ncmVzcyxcblx0XHRASUxvZ2dlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdExvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRBdXRoZW50aWNhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogVGhpcyBzZXRzIHVwIGFuIGV2ZW50IHRoYXQgd2lsbCBmaXJlIHdoZW4gdGhlIGF1dGggc2Vzc2lvbnMgY2hhbmdlIHdpdGggYSBidWlsdC1pbiBmaWx0ZXIgZm9yIHRoZSBleHRlbnNpb25JZFxuXHQgKiBpZiBhIHNlc3Npb24gY2hhbmdlIG9ubHkgYWZmZWN0cyBhIHNwZWNpZmljIGV4dGVuc2lvbi5cblx0ICogQHBhcmFtIGV4dGVuc2lvbklkIFRoZSBleHRlbnNpb24gdGhhdCBpcyBpbnRlcmVzdGVkIGluIHRoZSBldmVudC5cblx0ICogQHJldHVybnMgQW4gZXZlbnQgd2l0aCBhIGJ1aWx0LWluIGZpbHRlciBmb3IgdGhlIGV4dGVuc2lvbklkXG5cdCAqL1xuXHRnZXRFeHRlbnNpb25TY29wZWRTZXNzaW9uc0V2ZW50KGV4dGVuc2lvbklkOiBzdHJpbmcpOiBFdmVudDx2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50PiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZEV4dGVuc2lvbklkID0gZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKTtcblx0XHRyZXR1cm4gRXZlbnQuY2hhaW4odGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudCwgKCQpID0+ICRcblx0XHRcdC5maWx0ZXIoZSA9PiAhZS5leHRlbnNpb25JZEZpbHRlciB8fCBlLmV4dGVuc2lvbklkRmlsdGVyLmluY2x1ZGVzKG5vcm1hbGl6ZWRFeHRlbnNpb25JZCkpXG5cdFx0XHQubWFwKGUgPT4gKHsgcHJvdmlkZXI6IGUucHJvdmlkZXIgfSkpXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb24ocmVxdWVzdGluZ0V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwcm92aWRlcklkOiBzdHJpbmcsIHNjb3Blc09yUmVxdWVzdDogcmVhZG9ubHkgc3RyaW5nW10gfCB2c2NvZGUuQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBvcHRpb25zOiB2c2NvZGUuQXV0aGVudGljYXRpb25HZXRTZXNzaW9uT3B0aW9ucyAmICh7IGNyZWF0ZUlmTm9uZTogdHJ1ZSB9IHwgeyBmb3JjZU5ld1Nlc3Npb246IHRydWUgfSB8IHsgZm9yY2VOZXdTZXNzaW9uOiB2c2NvZGUuQXV0aGVudGljYXRpb25Gb3JjZU5ld1Nlc3Npb25PcHRpb25zIH0pKTogUHJvbWlzZTx2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uPjtcblx0YXN5bmMgZ2V0U2Vzc2lvbihyZXF1ZXN0aW5nRXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzT3JSZXF1ZXN0OiByZWFkb25seSBzdHJpbmdbXSB8IHZzY29kZS5BdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QsIG9wdGlvbnM6IHZzY29kZS5BdXRoZW50aWNhdGlvbkdldFNlc3Npb25PcHRpb25zICYgeyBmb3JjZU5ld1Nlc3Npb246IHRydWUgfSk6IFByb21pc2U8dnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbj47XG5cdGFzeW5jIGdldFNlc3Npb24ocmVxdWVzdGluZ0V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwcm92aWRlcklkOiBzdHJpbmcsIHNjb3Blc09yUmVxdWVzdDogcmVhZG9ubHkgc3RyaW5nW10gfCB2c2NvZGUuQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBvcHRpb25zOiB2c2NvZGUuQXV0aGVudGljYXRpb25HZXRTZXNzaW9uT3B0aW9ucyAmIHsgZm9yY2VOZXdTZXNzaW9uOiB2c2NvZGUuQXV0aGVudGljYXRpb25Gb3JjZU5ld1Nlc3Npb25PcHRpb25zIH0pOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24+O1xuXHRhc3luYyBnZXRTZXNzaW9uKHJlcXVlc3RpbmdFeHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZXNPclJlcXVlc3Q6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdnNjb2RlLkF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgb3B0aW9uczogdnNjb2RlLkF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBnZXRTZXNzaW9uKHJlcXVlc3RpbmdFeHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZXNPclJlcXVlc3Q6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdnNjb2RlLkF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgb3B0aW9uczogdnNjb2RlLkF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbk9wdGlvbnMgPSB7fSk6IFByb21pc2U8dnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShyZXF1ZXN0aW5nRXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IGtleXM6IChrZXlvZiB2c2NvZGUuQXV0aGVudGljYXRpb25HZXRTZXNzaW9uT3B0aW9ucylbXSA9IE9iamVjdC5rZXlzKG9wdGlvbnMpIGFzIChrZXlvZiB2c2NvZGUuQXV0aGVudGljYXRpb25HZXRTZXNzaW9uT3B0aW9ucylbXTtcblx0XHQvLyBUT0RPOiBwdWxsIHRoaXMgb3V0IGludG8gYSB1dGlsaXR5IGZ1bmN0aW9uIHNvbWV3aGVyZVxuXHRcdGNvbnN0IG9wdGlvbnNTdHIgPSBrZXlzXG5cdFx0XHQubWFwKGtleSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cdFx0XHRcdFx0Y2FzZSAnYWNjb3VudCc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gYCR7a2V5fToke29wdGlvbnMuYWNjb3VudD8uaWR9YDtcblx0XHRcdFx0XHRjYXNlICdjcmVhdGVJZk5vbmUnOlxuXHRcdFx0XHRcdGNhc2UgJ2ZvcmNlTmV3U2Vzc2lvbic6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gdHlwZW9mIG9wdGlvbnNba2V5XSA9PT0gJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHRcdD8gYCR7b3B0aW9uc1trZXldfWBcblx0XHRcdFx0XHRcdFx0OiBgJyR7b3B0aW9uc1trZXldPy5kZXRhaWx9LyR7b3B0aW9uc1trZXldPy5sZWFybk1vcmU/LnRvU3RyaW5nKCl9J2A7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYCR7a2V5fToke3ZhbHVlfWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ2F1dGhvcml6YXRpb25TZXJ2ZXInOlxuXHRcdFx0XHRcdFx0cmV0dXJuIGAke2tleX06JHtvcHRpb25zLmF1dGhvcml6YXRpb25TZXJ2ZXI/LnRvU3RyaW5nKHRydWUpfWA7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiBgJHtrZXl9OiR7ISFvcHRpb25zW2tleV19YDtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHRcdC5zb3J0KClcblx0XHRcdC5qb2luKCcsICcpO1xuXG5cdFx0bGV0IHNpbmdsZXJLZXk6IHN0cmluZztcblx0XHRpZiAoaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3Qoc2NvcGVzT3JSZXF1ZXN0KSkge1xuXHRcdFx0Y29uc3QgY2hhbGxlbmdlID0gc2NvcGVzT3JSZXF1ZXN0IGFzIHZzY29kZS5BdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3Q7XG5cdFx0XHRjb25zdCBjaGFsbGVuZ2VTdHIgPSBjaGFsbGVuZ2Uud3d3QXV0aGVudGljYXRlO1xuXHRcdFx0Y29uc3Qgc2NvcGVzU3RyID0gY2hhbGxlbmdlLmZhbGxiYWNrU2NvcGVzID8gWy4uLmNoYWxsZW5nZS5mYWxsYmFja1Njb3Blc10uc29ydCgpLmpvaW4oJyAnKSA6ICcnO1xuXHRcdFx0c2luZ2xlcktleSA9IGAke2V4dGVuc2lvbklkfSAke3Byb3ZpZGVySWR9IGNoYWxsZW5nZToke2NoYWxsZW5nZVN0cn0gJHtzY29wZXNTdHJ9ICR7b3B0aW9uc1N0cn1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzb3J0ZWRTY29wZXMgPSBbLi4uc2NvcGVzT3JSZXF1ZXN0XS5zb3J0KCkuam9pbignICcpO1xuXHRcdFx0c2luZ2xlcktleSA9IGAke2V4dGVuc2lvbklkfSAke3Byb3ZpZGVySWR9ICR7c29ydGVkU2NvcGVzfSAke29wdGlvbnNTdHJ9YDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZ2V0U2Vzc2lvblRhc2tTaW5nbGVyLmdldE9yQ3JlYXRlKHNpbmdsZXJLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRlbnN1cmVQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbk5hbWUgPSByZXF1ZXN0aW5nRXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IHJlcXVlc3RpbmdFeHRlbnNpb24ubmFtZTtcblx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kZ2V0U2Vzc2lvbihwcm92aWRlcklkLCBzY29wZXNPclJlcXVlc3QsIGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lLCBvcHRpb25zKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldEFjY291bnRzKHByb3ZpZGVySWQ6IHN0cmluZykge1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRlbnN1cmVQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcHJveHkuJGdldEFjY291bnRzKHByb3ZpZGVySWQpO1xuXHR9XG5cblx0cmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlciwgb3B0aW9ucz86IHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyT3B0aW9ucyk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHQvLyByZWdpc3RlclxuXHRcdHZvaWQgdGhpcy5fcHJvdmlkZXJPcGVyYXRpb25zLnF1ZXVlKGlkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHVzZSB0byBiZSBzeW5jaHJvbm91cywgYnV0IHRoYXQgd2Fzbid0IGFuIGFjY3VyYXRlIHJlcHJlc2VudGF0aW9uIGJlY2F1c2UgdGhlIG1haW4gdGhyZWFkXG5cdFx0XHQvLyBtYXkgaGF2ZSB1bnJlZ2lzdGVyZWQgdGhlIHByb3ZpZGVyIGluIHRoZSBtZWFudGltZS4gSSBkb24ndCBzZWUgaG93IHRoaXMgY291bGQgcmVhbGx5IGJlIGRvbmVcblx0XHRcdC8vIHN5bmNocm9ub3VzbHksIHNvIHdlIGp1c3Qgc2F5IGZpcnN0IG9uZSB3aW5zLlxuXHRcdFx0aWYgKHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmdldChpZCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgQW4gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgd2l0aCBpZCAnJHtpZH0nIGlzIGFscmVhZHkgcmVnaXN0ZXJlZC4gVGhlIGV4aXN0aW5nIHByb3ZpZGVyIHdpbGwgbm90IGJlIHJlcGxhY2VkLmApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9wcm94eS4kc2VuZERpZENoYW5nZVNlc3Npb25zKGlkLCBlKSk7XG5cdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5zZXQoaWQsIHsgbGFiZWwsIHByb3ZpZGVyLCBkaXNwb3NhYmxlOiBsaXN0ZW5lciwgb3B0aW9uczogb3B0aW9ucyA/PyB7IHN1cHBvcnRzTXVsdGlwbGVBY2NvdW50czogZmFsc2UgfSB9KTtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRyZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVBY2NvdW50czogb3B0aW9ucz8uc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzID8/IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0ZWRBdXRob3JpemF0aW9uU2VydmVyczogb3B0aW9ucz8uc3VwcG9ydGVkQXV0aG9yaXphdGlvblNlcnZlcnMsXG5cdFx0XHRcdHN1cHBvcnRzQ2hhbGxlbmdlczogb3B0aW9ucz8uc3VwcG9ydHNDaGFsbGVuZ2VzXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHVucmVnaXN0ZXJcblx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLl9wcm92aWRlck9wZXJhdGlvbnMucXVldWUoaWQsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRcdFx0aWYgKHByb3ZpZGVyRGF0YSkge1xuXHRcdFx0XHRcdHByb3ZpZGVyRGF0YS5kaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZGVsZXRlKGlkKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kdW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdCRjcmVhdGVTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSwgb3B0aW9uczogdnNjb2RlLkF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8dnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlck9wZXJhdGlvbnMucXVldWUocHJvdmlkZXJJZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdFx0aWYgKHByb3ZpZGVyRGF0YSkge1xuXHRcdFx0XHRvcHRpb25zLmF1dGhvcml6YXRpb25TZXJ2ZXIgPSBVUkkucmV2aXZlKG9wdGlvbnMuYXV0aG9yaXphdGlvblNlcnZlcik7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBwcm92aWRlckRhdGEucHJvdmlkZXIuY3JlYXRlU2Vzc2lvbihzY29wZXMsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBmaW5kIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIHdpdGggaGFuZGxlOiAke3Byb3ZpZGVySWR9YCk7XG5cdFx0fSk7XG5cdH1cblxuXHQkcmVtb3ZlU2Vzc2lvbihwcm92aWRlcklkOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyT3BlcmF0aW9ucy5xdWV1ZShwcm92aWRlcklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlckRhdGEgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAocHJvdmlkZXJEYXRhKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBwcm92aWRlckRhdGEucHJvdmlkZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBmaW5kIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIHdpdGggaGFuZGxlOiAke3Byb3ZpZGVySWR9YCk7XG5cdFx0fSk7XG5cdH1cblxuXHQkZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB8IHVuZGVmaW5lZCwgb3B0aW9uczogSUF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbnNPcHRpb25zKTogUHJvbWlzZTxSZWFkb25seUFycmF5PHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyT3BlcmF0aW9ucy5xdWV1ZShwcm92aWRlcklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlckRhdGEgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAocHJvdmlkZXJEYXRhKSB7XG5cdFx0XHRcdG9wdGlvbnMuYXV0aG9yaXphdGlvblNlcnZlciA9IFVSSS5yZXZpdmUob3B0aW9ucy5hdXRob3JpemF0aW9uU2VydmVyKTtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHByb3ZpZGVyRGF0YS5wcm92aWRlci5nZXRTZXNzaW9ucyhzY29wZXMsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBmaW5kIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIHdpdGggaGFuZGxlOiAke3Byb3ZpZGVySWR9YCk7XG5cdFx0fSk7XG5cdH1cblxuXHQkZ2V0U2Vzc2lvbnNGcm9tQ2hhbGxlbmdlcyhwcm92aWRlcklkOiBzdHJpbmcsIGNvbnN0cmFpbnQ6IHZzY29kZS5BdXRoZW50aWNhdGlvbkNvbnN0cmFpbnQsIG9wdGlvbnM6IHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPFJlYWRvbmx5QXJyYXk8dnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXJPcGVyYXRpb25zLnF1ZXVlKHByb3ZpZGVySWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyRGF0YSA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmdldChwcm92aWRlcklkKTtcblx0XHRcdGlmIChwcm92aWRlckRhdGEpIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlckRhdGEucHJvdmlkZXI7XG5cdFx0XHRcdC8vIENoZWNrIGlmIHByb3ZpZGVyIHN1cHBvcnRzIGNoYWxsZW5nZXNcblx0XHRcdFx0aWYgKHR5cGVvZiBwcm92aWRlci5nZXRTZXNzaW9uc0Zyb21DaGFsbGVuZ2VzID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5hdXRob3JpemF0aW9uU2VydmVyID0gVVJJLnJldml2ZShvcHRpb25zLmF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBwcm92aWRlci5nZXRTZXNzaW9uc0Zyb21DaGFsbGVuZ2VzKGNvbnN0cmFpbnQsIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQXV0aGVudGljYXRpb24gcHJvdmlkZXIgd2l0aCBoYW5kbGU6ICR7cHJvdmlkZXJJZH0gZG9lcyBub3Qgc3VwcG9ydCBnZXRTZXNzaW9uc0Zyb21DaGFsbGVuZ2VzYCk7XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGZpbmQgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgd2l0aCBoYW5kbGU6ICR7cHJvdmlkZXJJZH1gKTtcblx0XHR9KTtcblx0fVxuXG5cdCRjcmVhdGVTZXNzaW9uRnJvbUNoYWxsZW5nZXMocHJvdmlkZXJJZDogc3RyaW5nLCBjb25zdHJhaW50OiB2c2NvZGUuQXV0aGVudGljYXRpb25Db25zdHJhaW50LCBvcHRpb25zOiB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlclNlc3Npb25PcHRpb25zKTogUHJvbWlzZTx2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyT3BlcmF0aW9ucy5xdWV1ZShwcm92aWRlcklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlckRhdGEgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAocHJvdmlkZXJEYXRhKSB7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJEYXRhLnByb3ZpZGVyO1xuXHRcdFx0XHQvLyBDaGVjayBpZiBwcm92aWRlciBzdXBwb3J0cyBjaGFsbGVuZ2VzXG5cdFx0XHRcdGlmICh0eXBlb2YgcHJvdmlkZXIuY3JlYXRlU2Vzc2lvbkZyb21DaGFsbGVuZ2VzID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5hdXRob3JpemF0aW9uU2VydmVyID0gVVJJLnJldml2ZShvcHRpb25zLmF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBwcm92aWRlci5jcmVhdGVTZXNzaW9uRnJvbUNoYWxsZW5nZXMoY29uc3RyYWludCwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBdXRoZW50aWNhdGlvbiBwcm92aWRlciB3aXRoIGhhbmRsZTogJHtwcm92aWRlcklkfSBkb2VzIG5vdCBzdXBwb3J0IGNyZWF0ZVNlc3Npb25Gcm9tQ2hhbGxlbmdlc2ApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBmaW5kIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIHdpdGggaGFuZGxlOiAke3Byb3ZpZGVySWR9YCk7XG5cdFx0fSk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VBdXRoZW50aWNhdGlvblNlc3Npb25zKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGV4dGVuc2lvbklkRmlsdGVyPzogc3RyaW5nW10pIHtcblx0XHQvLyBEb24ndCBmaXJlIGV2ZW50cyBmb3IgdGhlIGludGVybmFsIGF1dGggcHJvdmlkZXJzXG5cdFx0aWYgKCFpZC5zdGFydHNXaXRoKElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgcHJvdmlkZXI6IHsgaWQsIGxhYmVsIH0sIGV4dGVuc2lvbklkRmlsdGVyIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHQkb25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyT3BlcmF0aW9ucy5xdWV1ZShpZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRcdGlmIChwcm92aWRlckRhdGEpIHtcblx0XHRcdFx0cHJvdmlkZXJEYXRhLmRpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlckR5bmFtaWNBdXRoUHJvdmlkZXIoXG5cdFx0YXV0aG9yaXphdGlvblNlcnZlckNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsXG5cdFx0c2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsXG5cdFx0cmVzb3VyY2VNZXRhZGF0YTogSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIHwgdW5kZWZpbmVkLFxuXHRcdGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0Y2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0aW5pdGlhbFRva2VuczogSUF1dGhvcml6YXRpb25Ub2tlbltdIHwgdW5kZWZpbmVkXG5cdCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKCFjbGllbnRJZCkge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9IFVSSS5yZXZpdmUoYXV0aG9yaXphdGlvblNlcnZlckNvbXBvbmVudHMpO1xuXHRcdFx0aWYgKHNlcnZlck1ldGFkYXRhLnJlZ2lzdHJhdGlvbl9lbmRwb2ludCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgdGhpcy5faW5pdERhdGEuZW52aXJvbm1lbnQuYXBwTmFtZSwgcmVzb3VyY2VNZXRhZGF0YT8uc2NvcGVzX3N1cHBvcnRlZCk7XG5cdFx0XHRcdFx0Y2xpZW50SWQgPSByZWdpc3RyYXRpb24uY2xpZW50X2lkO1xuXHRcdFx0XHRcdGNsaWVudFNlY3JldCA9IHJlZ2lzdHJhdGlvbi5jbGllbnRfc2VjcmV0O1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYER5bmFtaWMgcmVnaXN0cmF0aW9uIGZhaWxlZCBmb3IgJHthdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCl9OiAke2Vyci5tZXNzYWdlfS4gUHJvbXB0aW5nIHVzZXIgZm9yIGNsaWVudCBJRCBhbmQgY2xpZW50IHNlY3JldC4uLmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBTdGlsbCBubyBjbGllbnQgaWQgc28gZHluYW1pYyBjbGllbnQgcmVnaXN0cmF0aW9uIHdhcyBlaXRoZXIgbm90IHN1cHBvcnRlZCBvciBmYWlsZWRcblx0XHRcdGlmICghY2xpZW50SWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBQcm9tcHRpbmcgdXNlciBmb3IgY2xpZW50IHJlZ2lzdHJhdGlvbiBkZXRhaWxzIGZvciAke2F1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0Y29uc3QgY2xpZW50RGV0YWlscyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm9tcHRGb3JDbGllbnRSZWdpc3RyYXRpb24oYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKCFjbGllbnREZXRhaWxzKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVc2VyIGRpZCBub3QgcHJvdmlkZSBjbGllbnQgZGV0YWlscycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNsaWVudElkID0gY2xpZW50RGV0YWlscy5jbGllbnRJZDtcblx0XHRcdFx0Y2xpZW50U2VjcmV0ID0gY2xpZW50RGV0YWlscy5jbGllbnRTZWNyZXQ7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgVXNlciBwcm92aWRlZCBjbGllbnQgcmVnaXN0cmF0aW9uIGZvciAke2F1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0aWYgKGNsaWVudFNlY3JldCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFVzZXIgcHJvdmlkZWQgY2xpZW50IHNlY3JldCBmb3IgJHthdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVXNlciBkaWQgbm90IHByb3ZpZGUgY2xpZW50IHNlY3JldCBmb3IgJHthdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgdGhpcy5fZHluYW1pY0F1dGhQcm92aWRlckN0b3IoXG5cdFx0XHR0aGlzLl9leHRIb3N0V2luZG93LFxuXHRcdFx0dGhpcy5fZXh0SG9zdFVybHMsXG5cdFx0XHR0aGlzLl9pbml0RGF0YSxcblx0XHRcdHRoaXMuX2V4dEhvc3RQcm9ncmVzcyxcblx0XHRcdHRoaXMuX2V4dEhvc3RMb2dnZXJTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fcHJveHksXG5cdFx0XHRVUkkucmV2aXZlKGF1dGhvcml6YXRpb25TZXJ2ZXJDb21wb25lbnRzKSxcblx0XHRcdHNlcnZlck1ldGFkYXRhLFxuXHRcdFx0cmVzb3VyY2VNZXRhZGF0YSxcblx0XHRcdGNsaWVudElkLFxuXHRcdFx0Y2xpZW50U2VjcmV0LFxuXHRcdFx0dGhpcy5fb25EaWREeW5hbWljQXV0aFByb3ZpZGVyVG9rZW5zQ2hhbmdlLFxuXHRcdFx0aW5pdGlhbFRva2VucyB8fCBbXVxuXHRcdCk7XG5cblx0XHQvLyBVc2UgdGhlIHNlcXVlbmNlciB0byBlbnN1cmUgZHluYW1pYyBwcm92aWRlciByZWdpc3RyYXRpb24gaXMgc2VyaWFsaXplZFxuXHRcdGF3YWl0IHRoaXMuX3Byb3ZpZGVyT3BlcmF0aW9ucy5xdWV1ZShwcm92aWRlci5pZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuc2V0KFxuXHRcdFx0XHRwcm92aWRlci5pZCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0XHRkaXNwb3NhYmxlOiBEaXNwb3NhYmxlLmZyb20oXG5cdFx0XHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0XHRcdHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9wcm94eS4kc2VuZERpZENoYW5nZVNlc3Npb25zKHByb3ZpZGVyLmlkLCBlKSksXG5cdFx0XHRcdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZUNsaWVudElkKCgpID0+IHRoaXMuX3Byb3h5LiRzZW5kRGlkQ2hhbmdlRHluYW1pY1Byb3ZpZGVySW5mbyh7XG5cdFx0XHRcdFx0XHRcdHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLFxuXHRcdFx0XHRcdFx0XHRjbGllbnRJZDogcHJvdmlkZXIuY2xpZW50SWQsXG5cdFx0XHRcdFx0XHRcdGNsaWVudFNlY3JldDogcHJvdmlkZXIuY2xpZW50U2VjcmV0XG5cdFx0XHRcdFx0XHR9KSlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiB0cnVlIH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJHJlZ2lzdGVyRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIoe1xuXHRcdFx0XHRpZDogcHJvdmlkZXIuaWQsXG5cdFx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiB0cnVlLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyOiBhdXRob3JpemF0aW9uU2VydmVyQ29tcG9uZW50cyxcblx0XHRcdFx0cmVzb3VyY2VTZXJ2ZXI6IHJlc291cmNlTWV0YWRhdGEgPyBVUkkucGFyc2UocmVzb3VyY2VNZXRhZGF0YS5yZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNsaWVudElkOiBwcm92aWRlci5jbGllbnRJZCxcblx0XHRcdFx0Y2xpZW50U2VjcmV0OiBwcm92aWRlci5jbGllbnRTZWNyZXRcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cblxuXG5cdFx0cmV0dXJuIHByb3ZpZGVyLmlkO1xuXHR9XG5cblx0YXN5bmMgJHJlZ2lzdGVyWGFhQXV0aFByb3ZpZGVyKFxuXHRcdGlzc3VlckNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsXG5cdFx0c2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsXG5cdFx0Y2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRjbGllbnRTZWNyZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRpbml0aWFsVG9rZW5zOiBJQXV0aG9yaXphdGlvblRva2VuW10gfCB1bmRlZmluZWRcblx0KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBpc3N1ZXIgPSBVUkkucmV2aXZlKGlzc3VlckNvbXBvbmVudHMpO1xuXHRcdC8vIFhBQSBkb2VzIG5vdCB1c2UgRHluYW1pYyBDbGllbnQgUmVnaXN0cmF0aW9uIFx1MjAxNCB0aGUgSWRQIG11c3QgYWxyZWFkeSB0cnVzdCB0aGUgcmVxdWVzdGluZ1xuXHRcdC8vIGFwcCBmb3IgdGhlIHRhcmdldCBhdWRpZW5jZShzKS4gQWx3YXlzIHJlcXVpcmUgYW4gYWRtaW4tcHJvdmlzaW9uZWQgY2xpZW50X2lkIChhbmRcblx0XHQvLyB0eXBpY2FsbHkgY2xpZW50X3NlY3JldCkuXG5cdFx0aWYgKCFjbGllbnRJZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBQcm9tcHRpbmcgdXNlciBmb3IgY2xpZW50IHJlZ2lzdHJhdGlvbiBkZXRhaWxzIGZvciBYQUEgaXNzdWVyICR7aXNzdWVyLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRjb25zdCBjbGllbnREZXRhaWxzID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb21wdEZvckNsaWVudFJlZ2lzdHJhdGlvbihpc3N1ZXIudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoIWNsaWVudERldGFpbHMpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVc2VyIGRpZCBub3QgcHJvdmlkZSBjbGllbnQgZGV0YWlscycpO1xuXHRcdFx0fVxuXHRcdFx0Y2xpZW50SWQgPSBjbGllbnREZXRhaWxzLmNsaWVudElkO1xuXHRcdFx0Y2xpZW50U2VjcmV0ID0gY2xpZW50RGV0YWlscy5jbGllbnRTZWNyZXQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IHRoaXMuX3hhYUF1dGhQcm92aWRlckN0b3IoXG5cdFx0XHR0aGlzLl9leHRIb3N0V2luZG93LFxuXHRcdFx0dGhpcy5fZXh0SG9zdFVybHMsXG5cdFx0XHR0aGlzLl9pbml0RGF0YSxcblx0XHRcdHRoaXMuX2V4dEhvc3RQcm9ncmVzcyxcblx0XHRcdHRoaXMuX2V4dEhvc3RMb2dnZXJTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fcHJveHksXG5cdFx0XHRpc3N1ZXIsXG5cdFx0XHRzZXJ2ZXJNZXRhZGF0YSxcblx0XHRcdC8qIHJlc291cmNlTWV0YWRhdGEgKi8gdW5kZWZpbmVkLFxuXHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRjbGllbnRTZWNyZXQsXG5cdFx0XHR0aGlzLl9vbkRpZER5bmFtaWNBdXRoUHJvdmlkZXJUb2tlbnNDaGFuZ2UsXG5cdFx0XHRpbml0aWFsVG9rZW5zIHx8IFtdXG5cdFx0KTtcblxuXHRcdGF3YWl0IHRoaXMuX3Byb3ZpZGVyT3BlcmF0aW9ucy5xdWV1ZShwcm92aWRlci5pZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuc2V0KFxuXHRcdFx0XHRwcm92aWRlci5pZCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0XHRkaXNwb3NhYmxlOiBEaXNwb3NhYmxlLmZyb20oXG5cdFx0XHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0XHRcdHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9wcm94eS4kc2VuZERpZENoYW5nZVNlc3Npb25zKHByb3ZpZGVyLmlkLCBlKSksXG5cdFx0XHRcdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZUNsaWVudElkKCgpID0+IHRoaXMuX3Byb3h5LiRzZW5kRGlkQ2hhbmdlRHluYW1pY1Byb3ZpZGVySW5mbyh7XG5cdFx0XHRcdFx0XHRcdHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLFxuXHRcdFx0XHRcdFx0XHRjbGllbnRJZDogcHJvdmlkZXIuY2xpZW50SWQsXG5cdFx0XHRcdFx0XHRcdGNsaWVudFNlY3JldDogcHJvdmlkZXIuY2xpZW50U2VjcmV0XG5cdFx0XHRcdFx0XHR9KSlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiB0cnVlIH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJHJlZ2lzdGVyRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIoe1xuXHRcdFx0XHRpZDogcHJvdmlkZXIuaWQsXG5cdFx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiB0cnVlLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyOiBpc3N1ZXJDb21wb25lbnRzLFxuXHRcdFx0XHRyZXNvdXJjZVNlcnZlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRjbGllbnRJZDogcHJvdmlkZXIuY2xpZW50SWQsXG5cdFx0XHRcdGNsaWVudFNlY3JldDogcHJvdmlkZXIuY2xpZW50U2VjcmV0XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwcm92aWRlci5pZDtcblx0fVxuXG5cdGFzeW5jICRvbkRpZENoYW5nZUR5bmFtaWNBdXRoUHJvdmlkZXJUb2tlbnMoYXV0aFByb3ZpZGVySWQ6IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZywgdG9rZW5zOiBJQXV0aG9yaXphdGlvblRva2VuW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9vbkRpZER5bmFtaWNBdXRoUHJvdmlkZXJUb2tlbnNDaGFuZ2UuZmlyZSh7IGF1dGhQcm92aWRlcklkLCBjbGllbnRJZCwgdG9rZW5zIH0pO1xuXHR9XG59XG5cbmNsYXNzIFRhc2tTaW5nbGVyPFQ+IHtcblx0cHJpdmF0ZSBfaW5GbGlnaHRQcm9taXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPFQ+PigpO1xuXHRnZXRPckNyZWF0ZShrZXk6IHN0cmluZywgcHJvbWlzZUZhY3Rvcnk6ICgpID0+IFByb21pc2U8VD4pIHtcblx0XHRjb25zdCBpbkZsaWdodCA9IHRoaXMuX2luRmxpZ2h0UHJvbWlzZXMuZ2V0KGtleSk7XG5cdFx0aWYgKGluRmxpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gaW5GbGlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHByb21pc2VGYWN0b3J5KCkuZmluYWxseSgoKSA9PiB0aGlzLl9pbkZsaWdodFByb21pc2VzLmRlbGV0ZShrZXkpKTtcblx0XHR0aGlzLl9pbkZsaWdodFByb21pc2VzLnNldChrZXksIHByb21pc2UpO1xuXG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIER5bmFtaWNBdXRoUHJvdmlkZXIgaW1wbGVtZW50cyB2c2NvZGUuQXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IG5ldyBFbWl0dGVyPHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50PigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNsaWVudElkID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDbGllbnRJZCA9IHRoaXMuX29uRGlkQ2hhbmdlQ2xpZW50SWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5TdG9yZTogVG9rZW5TdG9yZTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NyZWF0ZUZsb3dzOiBBcnJheTx7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHRoYW5kbGVyOiAoc2NvcGVzOiBzdHJpbmdbXSwgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx7IG1lc3NhZ2U6IHN0cmluZyB9PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2U+O1xuXHR9PjtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ2dlcjogSUxvZ2dlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFdpbmRvdyBwcm90ZWN0ZWQgcmVhZG9ubHkgX2V4dEhvc3RXaW5kb3c6IElFeHRIb3N0V2luZG93LFxuXHRcdEBJRXh0SG9zdFVybHNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZXh0SG9zdFVybHM6IElFeHRIb3N0VXJsc1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFByb2dyZXNzIHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RQcm9ncmVzczogSUV4dEhvc3RQcm9ncmVzcyxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uU2hhcGUsXG5cdFx0cmVhZG9ubHkgYXV0aG9yaXphdGlvblNlcnZlcjogVVJJLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9yZXNvdXJjZU1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfCB1bmRlZmluZWQsXG5cdFx0cHJvdGVjdGVkIF9jbGllbnRJZDogc3RyaW5nLFxuXHRcdHByb3RlY3RlZCBfY2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0b25EaWREeW5hbWljQXV0aFByb3ZpZGVyVG9rZW5zQ2hhbmdlOiBFbWl0dGVyPHsgYXV0aFByb3ZpZGVySWQ6IHN0cmluZzsgY2xpZW50SWQ6IHN0cmluZzsgdG9rZW5zOiBJQXV0aG9yaXphdGlvblRva2VuW10gfT4sXG5cdFx0aW5pdGlhbFRva2VuczogSUF1dGhvcml6YXRpb25Ub2tlbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZldGNoOiB0eXBlb2YgZmV0Y2ggPSBmZXRjaCxcblx0KSB7XG5cdFx0Y29uc3Qgc3RyaW5naWZpZWRTZXJ2ZXIgPSBhdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKHRydWUpO1xuXHRcdC8vIEF1dGggUHJvdmlkZXIgSWQgaXMgYSBjb21iaW5hdGlvbiBvZiB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgYW5kIHRoZSByZXNvdXJjZSwgaWYgcHJvdmlkZWQuXG5cdFx0dGhpcy5pZCA9IF9yZXNvdXJjZU1ldGFkYXRhPy5yZXNvdXJjZVxuXHRcdFx0PyBzdHJpbmdpZmllZFNlcnZlciArICcgJyArIF9yZXNvdXJjZU1ldGFkYXRhPy5yZXNvdXJjZVxuXHRcdFx0OiBzdHJpbmdpZmllZFNlcnZlcjtcblx0XHQvLyBBdXRoIFByb3ZpZGVyIGxhYmVsIGlzIGp1c3QgdGhlIHJlc291cmNlIG5hbWUgaWYgcHJvdmlkZWQsIG90aGVyd2lzZSB0aGUgYXV0aG9yaXR5IG9mIHRoZSBhdXRob3JpemF0aW9uIHNlcnZlci5cblx0XHR0aGlzLmxhYmVsID0gX3Jlc291cmNlTWV0YWRhdGE/LnJlc291cmNlX25hbWUgPz8gdGhpcy5hdXRob3JpemF0aW9uU2VydmVyLmF1dGhvcml0eTtcblxuXHRcdHRoaXMuX2xvZ2dlciA9IGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKHRoaXMuaWQsIHsgbmFtZTogYEF1dGg6ICR7dGhpcy5sYWJlbH1gIH0pO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZS5hZGQodGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZS5hZGQodGhpcy5fb25EaWRDaGFuZ2VDbGllbnRJZCk7XG5cdFx0Y29uc3Qgc2NvcGVkRXZlbnQgPSBFdmVudC5jaGFpbihvbkRpZER5bmFtaWNBdXRoUHJvdmlkZXJUb2tlbnNDaGFuZ2UuZXZlbnQsICQgPT4gJFxuXHRcdFx0LmZpbHRlcihlID0+IGUuYXV0aFByb3ZpZGVySWQgPT09IHRoaXMuaWQgJiYgZS5jbGllbnRJZCA9PT0gX2NsaWVudElkKVxuXHRcdFx0Lm1hcChlID0+IGUudG9rZW5zKVxuXHRcdCk7XG5cdFx0dGhpcy5fdG9rZW5TdG9yZSA9IHRoaXMuX2Rpc3Bvc2FibGUuYWRkKG5ldyBUb2tlblN0b3JlKFxuXHRcdFx0e1xuXHRcdFx0XHRvbkRpZENoYW5nZTogc2NvcGVkRXZlbnQsXG5cdFx0XHRcdHNldDogKHRva2VucykgPT4gX3Byb3h5LiRzZXRTZXNzaW9uc0ZvckR5bmFtaWNBdXRoUHJvdmlkZXIodGhpcy5pZCwgdGhpcy5jbGllbnRJZCwgdG9rZW5zKSxcblx0XHRcdH0sXG5cdFx0XHRpbml0aWFsVG9rZW5zLFxuXHRcdFx0dGhpcy5fbG9nZ2VyXG5cdFx0KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZS5hZGQodGhpcy5fdG9rZW5TdG9yZS5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKGUpKSk7XG5cdFx0Ly8gV2lsbCBiZSBleHRlbmRlZCBsYXRlciB0byBzdXBwb3J0IG90aGVyIGZsb3dzXG5cdFx0dGhpcy5fY3JlYXRlRmxvd3MgPSBbXTtcblx0XHRpZiAoX3NlcnZlck1ldGFkYXRhLmF1dGhvcml6YXRpb25fZW5kcG9pbnQpIHtcblx0XHRcdHRoaXMuX2NyZWF0ZUZsb3dzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCd1cmwgaGFuZGxlcicsIFwiVVJMIEhhbmRsZXJcIiksXG5cdFx0XHRcdGhhbmRsZXI6IChzY29wZXMsIHByb2dyZXNzLCB0b2tlbikgPT4gdGhpcy5fY3JlYXRlV2l0aFVybEhhbmRsZXIoc2NvcGVzLCBwcm9ncmVzcywgdG9rZW4pXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRnZXQgY2xpZW50SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY2xpZW50SWQ7XG5cdH1cblxuXHRnZXQgY2xpZW50U2VjcmV0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NsaWVudFNlY3JldDtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25zKHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQsIG9wdGlvbnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb25bXT4ge1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBHZXR0aW5nIHNlc3Npb25zIGZvciBzY29wZXM6ICR7c2NvcGVzPy5qb2luKCcgJykgPz8gJ2FsbCd9YCk7XG5cdFx0aWYgKCFzY29wZXMpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b2tlblN0b3JlLnNlc3Npb25zO1xuXHRcdH1cblx0XHQvLyBUaGUgb2F1dGggc3BlYyBzYXlzIHR0aGF0IG9yZGVyIGRvZXNuJ3QgbWF0dGVyIHNvIHdlIHNvcnQgdGhlIHNjb3BlcyBmb3IgZWFzeSBjb21wYXJpc29uXG5cdFx0Ly8gaHR0cHM6Ly9kYXRhdHJhY2tlci5pZXRmLm9yZy9kb2MvaHRtbC9yZmM2NzQ5I3NlY3Rpb24tMy4zXG5cdFx0Ly8gVE9ET0BUeWxlckxlb25oYXJkdDogRG8gdGhpcyBmb3IgYWxsIHNjb3BlIGhhbmRsaW5nIGluIHRoZSBhdXRoIEFQSXNcblx0XHRjb25zdCBzb3J0ZWRTY29wZXMgPSBbLi4uc2NvcGVzXS5zb3J0KCk7XG5cdFx0Y29uc3Qgc2NvcGVTdHIgPSBzY29wZXMuam9pbignICcpO1xuXHRcdGxldCBzZXNzaW9ucyA9IHRoaXMuX3Rva2VuU3RvcmUuc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gYXJyYXlzRXF1YWwoWy4uLnNlc3Npb24uc2NvcGVzXS5zb3J0KCksIHNvcnRlZFNjb3BlcykpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBGb3VuZCAke3Nlc3Npb25zLmxlbmd0aH0gc2Vzc2lvbnMgZm9yIHNjb3BlczogJHtzY29wZVN0cn1gKTtcblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBuZXdUb2tlbnM6IElBdXRob3JpemF0aW9uVG9rZW5bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVtb3ZlZFRva2VuczogSUF1dGhvcml6YXRpb25Ub2tlbltdID0gW107XG5cdFx0XHRjb25zdCB0b2tlbk1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJQXV0aG9yaXphdGlvblRva2VuPih0aGlzLl90b2tlblN0b3JlLnRva2Vucy5tYXAodG9rZW4gPT4gW3Rva2VuLmFjY2Vzc190b2tlbiwgdG9rZW5dKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSB0b2tlbk1hcC5nZXQoc2Vzc2lvbi5hY2Nlc3NUb2tlbik7XG5cdFx0XHRcdGlmICh0b2tlbiAmJiB0b2tlbi5leHBpcmVzX2luKSB7XG5cdFx0XHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0XHRjb25zdCBleHBpcmVzSW5NUyA9IHRva2VuLmV4cGlyZXNfaW4gKiAxMDAwO1xuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoZSB0b2tlbiBpcyBhYm91dCB0byBleHBpcmUgaW4gNSBtaW51dGVzIG9yIGlmIGl0IGlzIGV4cGlyZWRcblx0XHRcdFx0XHRpZiAobm93ID4gdG9rZW4uY3JlYXRlZF9hdCArIGV4cGlyZXNJbk1TIC0gKDUgKiA2MCAqIDEwMDApKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgVG9rZW4gZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfSBpcyBhYm91dCB0byBleHBpcmUsIHJlZnJlc2hpbmcuLi5gKTtcblx0XHRcdFx0XHRcdHJlbW92ZWRUb2tlbnMucHVzaCh0b2tlbik7XG5cdFx0XHRcdFx0XHRpZiAoIXRva2VuLnJlZnJlc2hfdG9rZW4pIHtcblx0XHRcdFx0XHRcdFx0Ly8gTm8gcmVmcmVzaCB0b2tlbiBhdmFpbGFibGUsIGNhbm5vdCByZWZyZXNoXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBObyByZWZyZXNoIHRva2VuIGF2YWlsYWJsZSBmb3Igc2NvcGVzICR7c2Vzc2lvbi5zY29wZXMuam9pbignICcpfS4gVGhyb3dpbmcgYXdheSB0b2tlbi5gKTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuZXdUb2tlbiA9IGF3YWl0IHRoaXMuZXhjaGFuZ2VSZWZyZXNoVG9rZW5Gb3JUb2tlbih0b2tlbi5yZWZyZXNoX3Rva2VuLCBvcHRpb25zLnNpbGVudCAhPT0gdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IFdoZW4gdGhlIGNvcmUgc2NvcGUgaGFuZGxpbmcgZG9lc24ndCBjYXJlIGFib3V0IG9yZGVyLCB0aGlzIGNoZWNrIHNob3VsZCBiZVxuXHRcdFx0XHRcdFx0XHQvLyB1cGRhdGVkIHRvIG5vdCBjYXJlIGFib3V0IG9yZGVyXG5cdFx0XHRcdFx0XHRcdGlmIChuZXdUb2tlbi5zY29wZSAhPT0gc2NvcGVTdHIpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dnZXIud2FybihgVG9rZW4gc2NvcGVzICcke25ld1Rva2VuLnNjb3BlfScgZG8gbm90IG1hdGNoIHJlcXVlc3RlZCBzY29wZXMgJyR7c2NvcGVTdHJ9Jy4gT3ZlcndyaXRpbmcgdG9rZW4gd2l0aCB3aGF0IHdhcyByZXF1ZXN0ZWQuLi5gKTtcblx0XHRcdFx0XHRcdFx0XHRuZXdUb2tlbi5zY29wZSA9IHNjb3BlU3RyO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBTdWNjZXNzZnVsbHkgY3JlYXRlZCBhIG5ldyB0b2tlbiBmb3Igc2NvcGVzICR7c2Vzc2lvbi5zY29wZXMuam9pbignICcpfS5gKTtcblx0XHRcdFx0XHRcdFx0bmV3VG9rZW5zLnB1c2gobmV3VG9rZW4pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJlZnJlc2ggdG9rZW46ICR7ZXJyfWApO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV3VG9rZW5zLmxlbmd0aCB8fCByZW1vdmVkVG9rZW5zLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl90b2tlblN0b3JlLnVwZGF0ZSh7IGFkZGVkOiBuZXdUb2tlbnMsIHJlbW92ZWQ6IHJlbW92ZWRUb2tlbnMgfSk7XG5cdFx0XHRcdC8vIFNpbmNlIHdlIHVwZGF0ZWQgdGhlIHRva2Vucywgd2UgbmVlZCB0byByZS1maWx0ZXIgdGhlIHNlc3Npb25zXG5cdFx0XHRcdC8vIHRvIGdldCB0aGUgbGF0ZXN0IHN0YXRlXG5cdFx0XHRcdHNlc3Npb25zID0gdGhpcy5fdG9rZW5TdG9yZS5zZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiBhcnJheXNFcXVhbChbLi4uc2Vzc2lvbi5zY29wZXNdLnNvcnQoKSwgc29ydGVkU2NvcGVzKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgRm91bmQgJHtzZXNzaW9ucy5sZW5ndGh9IHNlc3Npb25zIGZvciBzY29wZXM6ICR7c2NvcGVTdHJ9YCk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbnM7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oc2NvcGVzOiBzdHJpbmdbXSwgX29wdGlvbnM6IHZzY29kZS5BdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgQ3JlYXRpbmcgc2Vzc2lvbiBmb3Igc2NvcGVzOiAke3Njb3Blcy5qb2luKCcgJyl9YCk7XG5cdFx0bGV0IHRva2VuOiBJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9jcmVhdGVGbG93cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyIH0gPSB0aGlzLl9jcmVhdGVGbG93c1tpXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRva2VuID0gYXdhaXQgdGhpcy5fZXh0SG9zdFByb2dyZXNzLndpdGhQcm9ncmVzc0Zyb21Tb3VyY2UoXG5cdFx0XHRcdFx0eyBsYWJlbDogdGhpcy5sYWJlbCwgaWQ6IHRoaXMuaWQgfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdhdXRoZW50aWNhdGluZ1RvJywgXCJBdXRoZW50aWNhdGluZyB0byAnezB9J1wiLCB0aGlzLmxhYmVsKSxcblx0XHRcdFx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQocHJvZ3Jlc3MsIHRva2VuKSA9PiBoYW5kbGVyKHNjb3BlcywgcHJvZ3Jlc3MsIHRva2VuKSk7XG5cdFx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc3QgbmV4dE1vZGUgPSB0aGlzLl9jcmVhdGVGbG93c1tpICsgMV0/LmxhYmVsO1xuXHRcdFx0XHRpZiAoIW5leHRNb2RlKSB7XG5cdFx0XHRcdFx0YnJlYWs7IC8vIE5vIG1vcmUgZmxvd3MgdG8gdHJ5XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKVxuXHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCd1c2VyQ2FuY2VsZWRDb250aW51ZScsIFwiSGF2aW5nIHRyb3VibGUgYXV0aGVudGljYXRpbmcgdG8gJ3swfSc/IFdvdWxkIHlvdSBsaWtlIHRvIHRyeSBhIGRpZmZlcmVudCB3YXk/ICh7MX0pXCIsIHRoaXMubGFiZWwsIG5leHRNb2RlKVxuXHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdjb250aW51ZVdpdGgnLCBcIllvdSBoYXZlIG5vdCB5ZXQgZmluaXNoZWQgYXV0aGVudGljYXRpbmcgdG8gJ3swfScuIFdvdWxkIHlvdSBsaWtlIHRvIHRyeSBhIGRpZmZlcmVudCB3YXk/ICh7MX0pXCIsIHRoaXMubGFiZWwsIG5leHRNb2RlKTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kc2hvd0NvbnRpbnVlTm90aWZpY2F0aW9uKG1lc3NhZ2UpO1xuXHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSB0b2tlbiB2aWEgZmxvdyAnJHtuZXh0TW9kZX0nOiAke2Vycn1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIGF1dGhlbnRpY2F0aW9uIHRva2VuJyk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5zY29wZSAhPT0gc2NvcGVzLmpvaW4oJyAnKSkge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLndhcm4oYFRva2VuIHNjb3BlcyAnJHt0b2tlbi5zY29wZX0nIGRvIG5vdCBtYXRjaCByZXF1ZXN0ZWQgc2NvcGVzICcke3Njb3Blcy5qb2luKCcgJyl9Jy4gT3ZlcndyaXRpbmcgdG9rZW4gd2l0aCB3aGF0IHdhcyByZXF1ZXN0ZWQuLi5gKTtcblx0XHRcdHRva2VuLnNjb3BlID0gc2NvcGVzLmpvaW4oJyAnKTtcblx0XHR9XG5cblx0XHQvLyBTdG9yZSBzZXNzaW9uIGZvciBsYXRlciByZXRyaWV2YWxcblx0XHR0aGlzLl90b2tlblN0b3JlLnVwZGF0ZSh7IGFkZGVkOiBbeyAuLi50b2tlbiwgY3JlYXRlZF9hdDogRGF0ZS5ub3coKSB9XSwgcmVtb3ZlZDogW10gfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Rva2VuU3RvcmUuc2Vzc2lvbnMuZmluZCh0ID0+IHQuYWNjZXNzVG9rZW4gPT09IHRva2VuLmFjY2Vzc190b2tlbikhO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBDcmVhdGVkICR7dG9rZW4ucmVmcmVzaF90b2tlbiA/ICdyZWZyZXNoYWJsZScgOiAnbm9uLXJlZnJlc2hhYmxlJ30gc2Vzc2lvbiBmb3Igc2NvcGVzOiAke3Rva2VuLnNjb3BlfSR7dG9rZW4uZXhwaXJlc19pbiA/IGAgdGhhdCBleHBpcmVzIGluICR7dG9rZW4uZXhwaXJlc19pbn0gc2Vjb25kc2AgOiAnJ31gKTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgUmVtb3Zpbmcgc2Vzc2lvbiB3aXRoIGlkOiAke3Nlc3Npb25JZH1gKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fdG9rZW5TdG9yZS5zZXNzaW9ucy5maW5kKHNlc3Npb24gPT4gc2Vzc2lvbi5pZCA9PT0gc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihgU2Vzc2lvbiB3aXRoIGlkICR7c2Vzc2lvbklkfSBub3QgZm91bmRgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl90b2tlblN0b3JlLnRva2Vucy5maW5kKHRva2VuID0+IHRva2VuLmFjY2Vzc190b2tlbiA9PT0gc2Vzc2lvbi5hY2Nlc3NUb2tlbik7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcmV0cmlldmUgdG9rZW4gZm9yIHJlbW92ZWQgc2Vzc2lvbjogJHtzZXNzaW9uLmlkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90b2tlblN0b3JlLnVwZGF0ZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Rva2VuXSB9KTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgUmVtb3ZlZCB0b2tlbiBmb3Igc2Vzc2lvbjogJHtzZXNzaW9uLmlkfSB3aXRoIHNjb3BlczogJHtzZXNzaW9uLnNjb3Blcy5qb2luKCcgJyl9YCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlV2l0aFVybEhhbmRsZXIoc2NvcGVzOiBzdHJpbmdbXSwgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlPiB7XG5cdFx0aWYgKCF0aGlzLl9zZXJ2ZXJNZXRhZGF0YS5hdXRob3JpemF0aW9uX2VuZHBvaW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F1dGhvcml6YXRpb24gRW5kcG9pbnQgcmVxdWlyZWQnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9zZXJ2ZXJNZXRhZGF0YS50b2tlbl9lbmRwb2ludCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUb2tlbiBlbmRwb2ludCBub3QgYXZhaWxhYmxlIGluIHNlcnZlciBtZXRhZGF0YScpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIFBLQ0UgY29kZSB2ZXJpZmllciAocmFuZG9tIHN0cmluZykgYW5kIGNvZGUgY2hhbGxlbmdlIChTSEEtMjU2IGhhc2ggb2YgdmVyaWZpZXIpXG5cdFx0Y29uc3QgY29kZVZlcmlmaWVyID0gdGhpcy5nZW5lcmF0ZVJhbmRvbVN0cmluZyg2NCk7XG5cdFx0Y29uc3QgY29kZUNoYWxsZW5nZSA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVDb2RlQ2hhbGxlbmdlKGNvZGVWZXJpZmllcik7XG5cblx0XHQvLyBHZW5lcmF0ZSBhIHJhbmRvbSBzdGF0ZSB2YWx1ZSB0byBwcmV2ZW50IENTUkZcblx0XHRjb25zdCBub25jZSA9IHRoaXMuZ2VuZXJhdGVSYW5kb21TdHJpbmcoMzIpO1xuXHRcdGNvbnN0IGNhbGxiYWNrVXJpID0gVVJJLnBhcnNlKGAke3RoaXMuX2luaXREYXRhLmVudmlyb25tZW50LmFwcFVyaVNjaGVtZX06Ly9keW5hbWljYXV0aHByb3ZpZGVyLyR7dGhpcy5hdXRob3JpemF0aW9uU2VydmVyLmF1dGhvcml0eX0vYXV0aG9yaXplP25vbmNlPSR7bm9uY2V9YCk7XG5cdFx0bGV0IHN0YXRlOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXRlID0gYXdhaXQgdGhpcy5fZXh0SG9zdFVybHMuY3JlYXRlQXBwVXJpKGNhbGxiYWNrVXJpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIGV4dGVybmFsIFVSSTogJHtlcnJvcn1gKTtcblx0XHR9XG5cblx0XHQvLyBQcmVwYXJlIHRoZSBhdXRob3JpemF0aW9uIHJlcXVlc3QgVVJMXG5cdFx0Y29uc3QgYXV0aG9yaXphdGlvblVybCA9IG5ldyBVUkwodGhpcy5fc2VydmVyTWV0YWRhdGEuYXV0aG9yaXphdGlvbl9lbmRwb2ludCk7XG5cdFx0YXV0aG9yaXphdGlvblVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKCdjbGllbnRfaWQnLCB0aGlzLl9jbGllbnRJZCk7XG5cdFx0YXV0aG9yaXphdGlvblVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKCdyZXNwb25zZV90eXBlJywgJ2NvZGUnKTtcblx0XHRhdXRob3JpemF0aW9uVXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoJ3N0YXRlJywgc3RhdGUudG9TdHJpbmcoKSk7XG5cdFx0YXV0aG9yaXphdGlvblVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKCdjb2RlX2NoYWxsZW5nZScsIGNvZGVDaGFsbGVuZ2UpO1xuXHRcdGF1dGhvcml6YXRpb25Vcmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgnY29kZV9jaGFsbGVuZ2VfbWV0aG9kJywgJ1MyNTYnKTtcblx0XHRjb25zdCBzY29wZVN0cmluZyA9IHNjb3Blcy5qb2luKCcgJyk7XG5cdFx0aWYgKHNjb3BlU3RyaW5nKSB7XG5cdFx0XHQvLyBJZiBub24tZW1wdHkgc2NvcGVzIGFyZSBwcm92aWRlZCwgaW5jbHVkZSBzY29wZSBwYXJhbWV0ZXIgaW4gdGhlIHJlcXVlc3Rcblx0XHRcdGF1dGhvcml6YXRpb25Vcmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgnc2NvcGUnLCBzY29wZVN0cmluZyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZXNvdXJjZU1ldGFkYXRhPy5yZXNvdXJjZSkge1xuXHRcdFx0Ly8gSWYgYSByZXNvdXJjZSBpcyBzcGVjaWZpZWQsIGluY2x1ZGUgaXQgaW4gdGhlIHJlcXVlc3Rcblx0XHRcdGF1dGhvcml6YXRpb25Vcmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgncmVzb3VyY2UnLCB0aGlzLl9yZXNvdXJjZU1ldGFkYXRhLnJlc291cmNlKTtcblx0XHR9XG5cblx0XHQvLyBVc2UgYSByZWRpcmVjdCBVUkkgdGhhdCBtYXRjaGVzIHdoYXQgd2FzIHJlZ2lzdGVyZWQgZHVyaW5nIGR5bmFtaWMgcmVnaXN0cmF0aW9uXG5cdFx0Y29uc3QgcmVkaXJlY3RVcmkgPSAnaHR0cHM6Ly92c2NvZGUuZGV2L3JlZGlyZWN0Jztcblx0XHRhdXRob3JpemF0aW9uVXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoJ3JlZGlyZWN0X3VyaScsIHJlZGlyZWN0VXJpKTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLndhaXRGb3JBdXRob3JpemF0aW9uQ29kZShjYWxsYmFja1VyaSk7XG5cblx0XHQvLyBPcGVuIHRoZSBicm93c2VyIGZvciB1c2VyIGF1dGhvcml6YXRpb25cblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgT3BlbmluZyBhdXRob3JpemF0aW9uIFVSTCBmb3Igc2NvcGVzOiAke3Njb3BlU3RyaW5nfWApO1xuXHRcdHRoaXMuX2xvZ2dlci50cmFjZShgQXV0aG9yaXphdGlvbiBVUkw6ICR7YXV0aG9yaXphdGlvblVybC50b1N0cmluZygpfWApO1xuXHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IHRoaXMuX2V4dEhvc3RXaW5kb3cub3BlblVyaShhdXRob3JpemF0aW9uVXJsLnRvU3RyaW5nKCksIHt9KTtcblx0XHRpZiAoIW9wZW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbXBsZXRlQXV0aCcsIFwiQ29tcGxldGUgdGhlIGF1dGhlbnRpY2F0aW9uIGluIHRoZSBicm93c2VyIHdpbmRvdyB0aGF0IGhhcyBvcGVuZWQuXCIpLFxuXHRcdH0pO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGF1dGhvcml6YXRpb24gY29kZSB2aWEgYSByZWRpcmVjdFxuXHRcdGxldCBjb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHByb21pc2UsIHRva2VuKTtcblx0XHRcdGNvZGUgPSByZXNwb25zZS5jb2RlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbygnQXV0aG9yaXphdGlvbiBjb2RlIHJlcXVlc3Qgd2FzIGNhbmNlbGxlZCBieSB0aGUgdXNlci4nKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcmVjZWl2ZSBhdXRob3JpemF0aW9uIGNvZGU6ICR7ZXJyfWApO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmVjZWl2ZSBhdXRob3JpemF0aW9uIGNvZGU6ICR7ZXJyfWApO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgQXV0aG9yaXphdGlvbiBjb2RlIHJlY2VpdmVkIGZvciBzY29wZXM6ICR7c2NvcGVTdHJpbmd9YCk7XG5cblx0XHQvLyBFeGNoYW5nZSB0aGUgYXV0aG9yaXphdGlvbiBjb2RlIGZvciB0b2tlbnNcblx0XHRjb25zdCB0b2tlblJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGNoYW5nZUNvZGVGb3JUb2tlbihjb2RlLCBjb2RlVmVyaWZpZXIsIHJlZGlyZWN0VXJpKTtcblx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZW5lcmF0ZVJhbmRvbVN0cmluZyhsZW5ndGg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgYXJyYXkgPSBuZXcgVWludDhBcnJheShsZW5ndGgpO1xuXHRcdGNyeXB0by5nZXRSYW5kb21WYWx1ZXMoYXJyYXkpO1xuXHRcdHJldHVybiBBcnJheS5mcm9tKGFycmF5KVxuXHRcdFx0Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpXG5cdFx0XHQuam9pbignJylcblx0XHRcdC5zdWJzdHJpbmcoMCwgbGVuZ3RoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZW5lcmF0ZUNvZGVDaGFsbGVuZ2UoY29kZVZlcmlmaWVyOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcblx0XHRjb25zdCBkYXRhID0gZW5jb2Rlci5lbmNvZGUoY29kZVZlcmlmaWVyKTtcblx0XHRjb25zdCBkaWdlc3QgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdCgnU0hBLTI1NicsIGRhdGEpO1xuXG5cdFx0Ly8gQmFzZTY0dXJsIGVuY29kZSB0aGUgZGlnZXN0XG5cdFx0cmV0dXJuIGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGRpZ2VzdCkpLCBmYWxzZSwgZmFsc2UpXG5cdFx0XHQucmVwbGFjZSgvXFwrL2csICctJylcblx0XHRcdC5yZXBsYWNlKC9cXC8vZywgJ18nKVxuXHRcdFx0LnJlcGxhY2UoLz0rJC8sICcnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2FpdEZvckF1dGhvcml6YXRpb25Db2RlKGV4cGVjdGVkU3RhdGU6IFVSSSk6IFByb21pc2U8eyBjb2RlOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiR3YWl0Rm9yVXJpSGFuZGxlcihleHBlY3RlZFN0YXRlKTtcblx0XHQvLyBFeHRyYWN0IHRoZSBjb2RlIHBhcmFtZXRlciBkaXJlY3RseSBmcm9tIHRoZSBxdWVyeSBzdHJpbmcuIE5PVEUsIFVSTFNlYXJjaFBhcmFtcyBkb2VzIG5vdCB3b3JrIGhlcmUgYmVjYXVzZVxuXHRcdC8vIGl0IHdpbGwgZGVjb2RlIHRoZSBxdWVyeSBzdHJpbmcgYW5kIHdlIG5lZWQgdG8ga2VlcCBpdCBlbmNvZGVkLlxuXHRcdGNvbnN0IGNvZGVNYXRjaCA9IC9bPyZdY29kZT0oW14mXSspLy5leGVjKHJlc3VsdC5xdWVyeSB8fCAnJyk7XG5cdFx0aWYgKCFjb2RlTWF0Y2ggfHwgY29kZU1hdGNoLmxlbmd0aCA8IDIpIHtcblx0XHRcdC8vIE5vIGNvZGUgcGFyYW1ldGVyIGZvdW5kIGluIHRoZSBxdWVyeSBzdHJpbmdcblx0XHRcdHRocm93IG5ldyBFcnJvcignQXV0aGVudGljYXRpb24gZmFpbGVkOiBObyBhdXRob3JpemF0aW9uIGNvZGUgcmVjZWl2ZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgY29kZTogY29kZU1hdGNoWzFdIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZXhjaGFuZ2VDb2RlRm9yVG9rZW4oY29kZTogc3RyaW5nLCBjb2RlVmVyaWZpZXI6IHN0cmluZywgcmVkaXJlY3RVcmk6IHN0cmluZyk6IFByb21pc2U8SUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlPiB7XG5cdFx0aWYgKCF0aGlzLl9zZXJ2ZXJNZXRhZGF0YS50b2tlbl9lbmRwb2ludCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUb2tlbiBlbmRwb2ludCBub3QgYXZhaWxhYmxlIGluIHNlcnZlciBtZXRhZGF0YScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuUmVxdWVzdCA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoKTtcblx0XHR0b2tlblJlcXVlc3QuYXBwZW5kKCdjbGllbnRfaWQnLCB0aGlzLl9jbGllbnRJZCk7XG5cdFx0dG9rZW5SZXF1ZXN0LmFwcGVuZCgnZ3JhbnRfdHlwZScsICdhdXRob3JpemF0aW9uX2NvZGUnKTtcblx0XHR0b2tlblJlcXVlc3QuYXBwZW5kKCdjb2RlJywgY29kZSk7XG5cdFx0dG9rZW5SZXF1ZXN0LmFwcGVuZCgncmVkaXJlY3RfdXJpJywgcmVkaXJlY3RVcmkpO1xuXHRcdHRva2VuUmVxdWVzdC5hcHBlbmQoJ2NvZGVfdmVyaWZpZXInLCBjb2RlVmVyaWZpZXIpO1xuXG5cdFx0Ly8gQWRkIHJlc291cmNlIGluZGljYXRvciBpZiBhdmFpbGFibGUgKFJGQyA4NzA3KVxuXHRcdGlmICh0aGlzLl9yZXNvdXJjZU1ldGFkYXRhPy5yZXNvdXJjZSkge1xuXHRcdFx0dG9rZW5SZXF1ZXN0LmFwcGVuZCgncmVzb3VyY2UnLCB0aGlzLl9yZXNvdXJjZU1ldGFkYXRhLnJlc291cmNlKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgY2xpZW50IHNlY3JldCBpZiBhdmFpbGFibGVcblx0XHRpZiAodGhpcy5fY2xpZW50U2VjcmV0KSB7XG5cdFx0XHR0b2tlblJlcXVlc3QuYXBwZW5kKCdjbGllbnRfc2VjcmV0JywgdGhpcy5fY2xpZW50U2VjcmV0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dnZXIuaW5mbygnRXhjaGFuZ2luZyBhdXRob3JpemF0aW9uIGNvZGUgZm9yIHRva2VuLi4uJyk7XG5cdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBVcmw6ICR7dGhpcy5fc2VydmVyTWV0YWRhdGEudG9rZW5fZW5kcG9pbnR9YCk7XG5cdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBUb2tlbiByZXF1ZXN0IGJvZHk6ICR7dG9rZW5SZXF1ZXN0LnRvU3RyaW5nKCl9YCk7XG5cdFx0bGV0IHJlc3BvbnNlOiBSZXNwb25zZTtcblx0XHR0cnkge1xuXHRcdFx0cmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9mZXRjaCh0aGlzLl9zZXJ2ZXJNZXRhZGF0YS50b2tlbl9lbmRwb2ludCwge1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyxcblx0XHRcdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJvZHk6IHRva2VuUmVxdWVzdC50b1N0cmluZygpXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihgRmFpbGVkIHRvIGV4Y2hhbmdlIGF1dGhvcml6YXRpb24gY29kZSBmb3IgdG9rZW46ICR7ZXJyfWApO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZXhjaGFuZ2UgYXV0aG9yaXphdGlvbiBjb2RlIGZvciB0b2tlbjogJHtlcnJ9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVG9rZW4gZXhjaGFuZ2UgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fSAtICR7dGV4dH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0aWYgKGlzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UocmVzdWx0KSkge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFN1Y2Nlc3NmdWxseSBleGNoYW5nZWQgYXV0aG9yaXphdGlvbiBjb2RlIGZvciB0b2tlbi5gKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBlbHNlIGlmIChpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlKHJlc3VsdCkgJiYgcmVzdWx0LmVycm9yID09PSBBdXRob3JpemF0aW9uRXJyb3JUeXBlLkludmFsaWRDbGllbnQpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBDbGllbnQgSUQgKCR7dGhpcy5fY2xpZW50SWR9KSB3YXMgaW52YWxpZCwgZ2VuZXJhdGVkIGEgbmV3IG9uZS5gKTtcblx0XHRcdGF3YWl0IHRoaXMuX2dlbmVyYXRlTmV3Q2xpZW50SWQoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2xpZW50IElEIHdhcyBpbnZhbGlkLCBnZW5lcmF0ZWQgYSBuZXcgb25lLiBQbGVhc2UgdHJ5IGFnYWluLmApO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgYXV0aG9yaXphdGlvbiB0b2tlbiByZXNwb25zZTogJHtKU09OLnN0cmluZ2lmeShyZXN1bHQpfWApO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGV4Y2hhbmdlUmVmcmVzaFRva2VuRm9yVG9rZW4ocmVmcmVzaFRva2VuOiBzdHJpbmcsIGFsbG93Q2xpZW50UmVnaXN0cmF0aW9uOiBib29sZWFuKTogUHJvbWlzZTxJQXV0aG9yaXphdGlvblRva2VuPiB7XG5cdFx0aWYgKCF0aGlzLl9zZXJ2ZXJNZXRhZGF0YS50b2tlbl9lbmRwb2ludCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUb2tlbiBlbmRwb2ludCBub3QgYXZhaWxhYmxlIGluIHNlcnZlciBtZXRhZGF0YScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuUmVxdWVzdCA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoKTtcblx0XHR0b2tlblJlcXVlc3QuYXBwZW5kKCdjbGllbnRfaWQnLCB0aGlzLl9jbGllbnRJZCk7XG5cdFx0dG9rZW5SZXF1ZXN0LmFwcGVuZCgnZ3JhbnRfdHlwZScsICdyZWZyZXNoX3Rva2VuJyk7XG5cdFx0dG9rZW5SZXF1ZXN0LmFwcGVuZCgncmVmcmVzaF90b2tlbicsIHJlZnJlc2hUb2tlbik7XG5cblx0XHQvLyBBZGQgcmVzb3VyY2UgaW5kaWNhdG9yIGlmIGF2YWlsYWJsZSAoUkZDIDg3MDcpXG5cdFx0aWYgKHRoaXMuX3Jlc291cmNlTWV0YWRhdGE/LnJlc291cmNlKSB7XG5cdFx0XHR0b2tlblJlcXVlc3QuYXBwZW5kKCdyZXNvdXJjZScsIHRoaXMuX3Jlc291cmNlTWV0YWRhdGEucmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBjbGllbnQgc2VjcmV0IGlmIGF2YWlsYWJsZVxuXHRcdGlmICh0aGlzLl9jbGllbnRTZWNyZXQpIHtcblx0XHRcdHRva2VuUmVxdWVzdC5hcHBlbmQoJ2NsaWVudF9zZWNyZXQnLCB0aGlzLl9jbGllbnRTZWNyZXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fZmV0Y2godGhpcy5fc2VydmVyTWV0YWRhdGEudG9rZW5fZW5kcG9pbnQsIHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG5cdFx0XHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbidcblx0XHRcdH0sXG5cdFx0XHRib2R5OiB0b2tlblJlcXVlc3QudG9TdHJpbmcoKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXHRcdGlmIChpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKHJlc3VsdCkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0Y3JlYXRlZF9hdDogRGF0ZS5ub3coKSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlKHJlc3VsdCkgJiYgcmVzdWx0LmVycm9yID09PSBBdXRob3JpemF0aW9uRXJyb3JUeXBlLkludmFsaWRDbGllbnQpIHtcblx0XHRcdGlmICghYWxsb3dDbGllbnRSZWdpc3RyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLndhcm4oYENsaWVudCBJRCAoJHt0aGlzLl9jbGllbnRJZH0pIHdhcyBpbnZhbGlkIHdoaWxlIHNpbGVudGx5IHJlZnJlc2hpbmcgdGhlIHRva2VuLmApO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENsaWVudCBJRCB3YXMgaW52YWxpZCB3aGlsZSBzaWxlbnRseSByZWZyZXNoaW5nIHRoZSB0b2tlbi5gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBDbGllbnQgSUQgKCR7dGhpcy5fY2xpZW50SWR9KSB3YXMgaW52YWxpZCwgZ2VuZXJhdGVkIGEgbmV3IG9uZS5gKTtcblx0XHRcdGF3YWl0IHRoaXMuX2dlbmVyYXRlTmV3Q2xpZW50SWQoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2xpZW50IElEIHdhcyBpbnZhbGlkLCBnZW5lcmF0ZWQgYSBuZXcgb25lLiBQbGVhc2UgdHJ5IGFnYWluLmApO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgYXV0aG9yaXphdGlvbiB0b2tlbiByZXNwb25zZTogJHtKU09OLnN0cmluZ2lmeShyZXN1bHQpfWApO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZW5lcmF0ZU5ld0NsaWVudElkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWdpc3RyYXRpb24gPSBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24odGhpcy5fc2VydmVyTWV0YWRhdGEsIHRoaXMuX2luaXREYXRhLmVudmlyb25tZW50LmFwcE5hbWUsIHRoaXMuX3Jlc291cmNlTWV0YWRhdGE/LnNjb3Blc19zdXBwb3J0ZWQpO1xuXHRcdFx0dGhpcy5fY2xpZW50SWQgPSByZWdpc3RyYXRpb24uY2xpZW50X2lkO1xuXHRcdFx0dGhpcy5fY2xpZW50U2VjcmV0ID0gcmVnaXN0cmF0aW9uLmNsaWVudF9zZWNyZXQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNsaWVudElkLmZpcmUoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFdoZW4gRENSIGZhaWxzLCB0cnkgdG8gcHJvbXB0IHRoZSB1c2VyIGZvciBhIGNsaWVudCBJRCBhbmQgY2xpZW50IHNlY3JldFxuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYER5bmFtaWMgcmVnaXN0cmF0aW9uIGZhaWxlZCBmb3IgJHt0aGlzLmF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcoKX06ICR7ZXJyfS4gUHJvbXB0aW5nIHVzZXIgZm9yIGNsaWVudCBJRCBhbmQgY2xpZW50IHNlY3JldC5gKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY2xpZW50RGV0YWlscyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm9tcHRGb3JDbGllbnRSZWdpc3RyYXRpb24odGhpcy5hdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAoIWNsaWVudERldGFpbHMpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZXIgZGlkIG5vdCBwcm92aWRlIGNsaWVudCBkZXRhaWxzJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY2xpZW50SWQgPSBjbGllbnREZXRhaWxzLmNsaWVudElkO1xuXHRcdFx0XHR0aGlzLl9jbGllbnRTZWNyZXQgPSBjbGllbnREZXRhaWxzLmNsaWVudFNlY3JldDtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFVzZXIgcHJvdmlkZWQgY2xpZW50IElEIGZvciAke3RoaXMuYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZygpfWApO1xuXHRcdFx0XHRpZiAoY2xpZW50RGV0YWlscy5jbGllbnRTZWNyZXQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgVXNlciBwcm92aWRlZCBjbGllbnQgc2VjcmV0IGZvciAke3RoaXMuYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZygpfWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBVc2VyIGRpZCBub3QgcHJvdmlkZSBjbGllbnQgc2VjcmV0IGZvciAke3RoaXMuYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZygpfSAob3B0aW9uYWwpYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNsaWVudElkLmZpcmUoKTtcblx0XHRcdH0gY2F0Y2ggKHByb21wdEVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBmZXRjaCBuZXcgY2xpZW50IElEIGFuZCB1c2VyIGRpZCBub3QgcHJvdmlkZSBvbmU6ICR7ZXJyfWApO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBuZXcgY2xpZW50IElEIGFuZCB1c2VyIGRpZCBub3QgcHJvdmlkZSBvbmU6ICR7ZXJyfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgdHlwZSBJQXV0aG9yaXphdGlvblRva2VuID0gSUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlICYge1xuXHQvKipcblx0ICogVGhlIHRpbWUgd2hlbiB0aGUgdG9rZW4gd2FzIGNyZWF0ZWQsIGluIG1pbGxpc2Vjb25kcyBzaW5jZSB0aGUgZXBvY2guXG5cdCAqL1xuXHRjcmVhdGVkX2F0OiBudW1iZXI7XG59O1xuXG5leHBvcnQgY2xhc3MgVG9rZW5TdG9yZSBpbXBsZW1lbnRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbnNPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPElBdXRob3JpemF0aW9uVG9rZW5bXT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zT2JzZXJ2YWJsZTogSU9ic2VydmFibGU8dnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25zID0gbmV3IEVtaXR0ZXI8dnNjb2RlLkF1dGhlbnRpY2F0aW9uUHJvdmlkZXJBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wZXJzaXN0ZW5jZTogeyBvbkRpZENoYW5nZTogRXZlbnQ8SUF1dGhvcml6YXRpb25Ub2tlbltdPjsgc2V0OiAodG9rZW5zOiBJQXV0aG9yaXphdGlvblRva2VuW10pID0+IHZvaWQgfSxcblx0XHRpbml0aWFsVG9rZW5zOiBJQXV0aG9yaXphdGlvblRva2VuW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJTG9nZ2VyXG5cdCkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fdG9rZW5zT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTxJQXV0aG9yaXphdGlvblRva2VuW10+KCd0b2tlbnMnLCBpbml0aWFsVG9rZW5zKTtcblx0XHR0aGlzLl9zZXNzaW9uc09ic2VydmFibGUgPSBkZXJpdmVkT3B0cyhcblx0XHRcdHsgZXF1YWxzRm46IChhLCBiKSA9PiBhcnJheXNFcXVhbChhLCBiLCAoYSwgYikgPT4gYS5hY2Nlc3NUb2tlbiA9PT0gYi5hY2Nlc3NUb2tlbikgfSxcblx0XHRcdChyZWFkZXIpID0+IHRoaXMuX3Rva2Vuc09ic2VydmFibGUucmVhZChyZWFkZXIpLm1hcCh0ID0+IHRoaXMuX2dldFNlc3Npb25Gcm9tVG9rZW4odCkpXG5cdFx0KTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlLmFkZCh0aGlzLl9yZWdpc3RlckNoYW5nZUV2ZW50QXV0b3J1bigpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlLmFkZCh0aGlzLl9wZXJzaXN0ZW5jZS5vbkRpZENoYW5nZSgodG9rZW5zKSA9PiB0aGlzLl90b2tlbnNPYnNlcnZhYmxlLnNldCh0b2tlbnMsIHVuZGVmaW5lZCkpKTtcblx0fVxuXG5cdGdldCB0b2tlbnMoKTogSUF1dGhvcml6YXRpb25Ub2tlbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zT2JzZXJ2YWJsZS5nZXQoKTtcblx0fVxuXG5cdGdldCBzZXNzaW9ucygpOiB2c2NvZGUuQXV0aGVudGljYXRpb25TZXNzaW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uc09ic2VydmFibGUuZ2V0KCk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0dXBkYXRlKHsgYWRkZWQsIHJlbW92ZWQgfTogeyBhZGRlZDogSUF1dGhvcml6YXRpb25Ub2tlbltdOyByZW1vdmVkOiBJQXV0aG9yaXphdGlvblRva2VuW10gfSk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlci50cmFjZShgVXBkYXRpbmcgdG9rZW5zOiBhZGRlZCAke2FkZGVkLmxlbmd0aH0sIHJlbW92ZWQgJHtyZW1vdmVkLmxlbmd0aH1gKTtcblx0XHRjb25zdCBjdXJyZW50VG9rZW5zID0gWy4uLnRoaXMuX3Rva2Vuc09ic2VydmFibGUuZ2V0KCldO1xuXHRcdGZvciAoY29uc3QgdG9rZW4gb2YgcmVtb3ZlZCkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBjdXJyZW50VG9rZW5zLmZpbmRJbmRleCh0ID0+IHQuYWNjZXNzX3Rva2VuID09PSB0b2tlbi5hY2Nlc3NfdG9rZW4pO1xuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRjdXJyZW50VG9rZW5zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdG9rZW4gb2YgYWRkZWQpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gY3VycmVudFRva2Vucy5maW5kSW5kZXgodCA9PiB0LmFjY2Vzc190b2tlbiA9PT0gdG9rZW4uYWNjZXNzX3Rva2VuKTtcblx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0Y3VycmVudFRva2Vucy5wdXNoKHRva2VuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnJlbnRUb2tlbnNbaW5kZXhdID0gdG9rZW47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhZGRlZC5sZW5ndGggfHwgcmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3Rva2Vuc09ic2VydmFibGUuc2V0KGN1cnJlbnRUb2tlbnMsIHVuZGVmaW5lZCk7XG5cdFx0XHR2b2lkIHRoaXMuX3BlcnNpc3RlbmNlLnNldChjdXJyZW50VG9rZW5zKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKGBUb2tlbnMgdXBkYXRlZDogJHtjdXJyZW50VG9rZW5zLmxlbmd0aH0gdG9rZW5zIHN0b3JlZC5gKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQ2hhbmdlRXZlbnRBdXRvcnVuKCk6IElEaXNwb3NhYmxlIHtcblx0XHRsZXQgcHJldmlvdXNTZXNzaW9uczogdnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdID0gW107XG5cdFx0cmV0dXJuIGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLnRyYWNlKCdDaGVja2luZyBmb3Igc2Vzc2lvbiBjaGFuZ2VzLi4uJyk7XG5cdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvbnMgPSB0aGlzLl9zZXNzaW9uc09ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHByZXZpb3VzU2Vzc2lvbnMgPT09IGN1cnJlbnRTZXNzaW9ucykge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIudHJhY2UoJ05vIHNlc3Npb24gY2hhbmdlcyBkZXRlY3RlZC4nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWN1cnJlbnRTZXNzaW9ucyB8fCBjdXJyZW50U2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIElmIGN1cnJlbnRTZXNzaW9ucyBpcyB1bmRlZmluZWQsIGFsbCBwcmV2aW91cyBzZXNzaW9ucyBhcmUgY29uc2lkZXJlZCByZW1vdmVkXG5cdFx0XHRcdHRoaXMuX2xvZ2dlci50cmFjZSgnQWxsIHNlc3Npb25zIHJlbW92ZWQuJyk7XG5cdFx0XHRcdGlmIChwcmV2aW91c1Nlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoe1xuXHRcdFx0XHRcdFx0YWRkZWQ6IFtdLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogcHJldmlvdXNTZXNzaW9ucyxcblx0XHRcdFx0XHRcdGNoYW5nZWQ6IFtdXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cHJldmlvdXNTZXNzaW9ucyA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWRkZWQ6IHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVtb3ZlZDogdnNjb2RlLkF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdID0gW107XG5cblx0XHRcdC8vIEZpbmQgYWRkZWQgc2Vzc2lvbnNcblx0XHRcdGZvciAoY29uc3QgY3VycmVudCBvZiBjdXJyZW50U2Vzc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXhpc3RzID0gcHJldmlvdXNTZXNzaW9ucy5zb21lKHByZXYgPT4gcHJldi5hY2Nlc3NUb2tlbiA9PT0gY3VycmVudC5hY2Nlc3NUb2tlbik7XG5cdFx0XHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRcdFx0YWRkZWQucHVzaChjdXJyZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaW5kIHJlbW92ZWQgc2Vzc2lvbnNcblx0XHRcdGZvciAoY29uc3QgcHJldiBvZiBwcmV2aW91c1Nlc3Npb25zKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0cyA9IGN1cnJlbnRTZXNzaW9ucy5zb21lKGN1cnJlbnQgPT4gY3VycmVudC5hY2Nlc3NUb2tlbiA9PT0gcHJldi5hY2Nlc3NUb2tlbik7XG5cdFx0XHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRcdFx0cmVtb3ZlZC5wdXNoKHByZXYpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpcmUgdGhlIGV2ZW50IGlmIHRoZXJlIGFyZSBhbnkgY2hhbmdlc1xuXHRcdFx0aWYgKGFkZGVkLmxlbmd0aCA+IDAgfHwgcmVtb3ZlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci50cmFjZShgU2Vzc2lvbnMgY2hhbmdlZDogYWRkZWQgJHthZGRlZC5sZW5ndGh9LCByZW1vdmVkICR7cmVtb3ZlZC5sZW5ndGh9YCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkLCByZW1vdmVkLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIHByZXZpb3VzIHNlc3Npb25zIHJlZmVyZW5jZVxuXHRcdFx0cHJldmlvdXNTZXNzaW9ucyA9IGN1cnJlbnRTZXNzaW9ucztcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25Gcm9tVG9rZW4odG9rZW46IElBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSk6IHZzY29kZS5BdXRoZW50aWNhdGlvblNlc3Npb24ge1xuXHRcdGxldCBjbGFpbXM6IElBdXRob3JpemF0aW9uSldUQ2xhaW1zIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0b2tlbi5pZF90b2tlbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2xhaW1zID0gZ2V0Q2xhaW1zRnJvbUpXVCh0b2tlbi5pZF90b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIGxvZ1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWNsYWltcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2xhaW1zID0gZ2V0Q2xhaW1zRnJvbUpXVCh0b2tlbi5hY2Nlc3NfdG9rZW4pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBsb2dcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQW4gZXhwbGljaXQgZW1wdHkgYHRva2VuLnNjb3BlYCBpcyBhdXRob3JpdGF0aXZlIChjcmVhdGVTZXNzaW9uL3JlZnJlc2ggc3RhbXAgdGhlIHJlcXVlc3RlZCBzY29wZXMgb250byB0aGUgdG9rZW4pOyBvbmx5IGZhbGwgYmFjayB0byB0aGUgSldUIGNsYWltcyB3aGVuIHNjb3BlIGlzIGdlbnVpbmVseSBhYnNlbnQuXG5cdFx0Y29uc3Qgc2NvcGVzID0gdG9rZW4uc2NvcGUgIT09IHVuZGVmaW5lZFxuXHRcdFx0PyAodG9rZW4uc2NvcGUgPyB0b2tlbi5zY29wZS5zcGxpdCgnICcpIDogW10pXG5cdFx0XHQ6IChjbGFpbXM/LnNjb3BlID8gY2xhaW1zLnNjb3BlLnNwbGl0KCcgJykgOiBbXSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBzdHJpbmdIYXNoKHRva2VuLmFjY2Vzc190b2tlbiwgMCkudG9TdHJpbmcoKSxcblx0XHRcdGFjY2Vzc1Rva2VuOiB0b2tlbi5hY2Nlc3NfdG9rZW4sXG5cdFx0XHRhY2NvdW50OiB7XG5cdFx0XHRcdGlkOiBjbGFpbXM/LnN1YiB8fCAndW5rbm93bicsXG5cdFx0XHRcdC8vIFRPRE86IERvbid0IHNheSBNQ1AuLi5cblx0XHRcdFx0bGFiZWw6IGNsYWltcz8ucHJlZmVycmVkX3VzZXJuYW1lIHx8IGNsYWltcz8ubmFtZSB8fCBjbGFpbXM/LmVtYWlsIHx8ICdNQ1AnLFxuXHRcdFx0fSxcblx0XHRcdHNjb3Blczogc2NvcGVzLFxuXHRcdFx0aWRUb2tlbjogdG9rZW4uaWRfdG9rZW5cblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFlBQVksU0FBUztBQUNyQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLG1CQUE4RTtBQUN2RixTQUFTLFlBQVksd0JBQXdCO0FBQzdDLFNBQWdDLDJCQUEyQjtBQUMzRCxTQUFtRiwrQkFBK0IsOENBQThDO0FBQ2hLLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyx3QkFBd0IsMEJBQTBCLGtCQUErSSw4QkFBOEIsb0NBQW9DO0FBQzVRLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQWtCLGdCQUFnQixtQkFBbUI7QUFDckQsU0FBUyxTQUFTLGFBQStDLHVCQUF1QjtBQUN4RixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQWMsZ0JBQWdCO0FBQ3ZDLFNBQVMsVUFBVSxtQkFBbUI7QUFDdEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsdUJBQXVCLHNCQUFzQjtBQUN0RCxTQUFTLDBCQUEwQjtBQUc1QixNQUFNLHlCQUF5QixnQkFBd0Msd0JBQXdCO0FBUy9GLElBQU0sd0JBQU4sTUFBa0U7QUFBQSxFQWdCeEUsWUFDcUIsWUFDc0IsV0FDVCxnQkFDSyxjQUNILGtCQUNGLHVCQUNILGFBQzdCO0FBTnlDO0FBQ1Q7QUFDSztBQUNIO0FBQ0Y7QUFDSDtBQW5CL0IsU0FBbUIsMkJBQTJCO0FB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
