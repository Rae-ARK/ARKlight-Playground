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
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import * as nls from "../../../nls.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { getDynamicAuthenticationProviderId, IAuthenticationService, IAuthenticationExtensionsService, isAuthenticationWwwAuthenticateRequest } from "../../services/authentication/common/authentication.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../base/common/severity.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { ActivationKind, IExtensionService } from "../../services/extensions/common/extensions.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { Emitter } from "../../../base/common/event.js";
import { IAuthenticationAccessService } from "../../services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationUsageService } from "../../services/authentication/browser/authenticationUsageService.js";
import { getAuthenticationProviderActivationEvent } from "../../services/authentication/browser/authenticationService.js";
import { URI } from "../../../base/common/uri.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { CancellationError } from "../../../base/common/errors.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtensionHostKind } from "../../services/extensions/common/extensionHostKind.js";
import { IURLService } from "../../../platform/url/common/url.js";
import { DeferredPromise, raceTimeout } from "../../../base/common/async.js";
import { fetchAuthorizationServerMetadata } from "../../../base/common/oauth.js";
import { IDynamicAuthenticationProviderStorageService } from "../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { ISecretStorageService } from "../../../platform/secrets/common/secrets.js";
import { mcpOAuthClientSecretStorageKey } from "../../contrib/mcp/common/mcpTypes.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { mcpEnterpriseManagedAuthIdpSection } from "../../contrib/mcp/common/mcpConfiguration.js";
class MainThreadAuthenticationProvider extends Disposable {
  constructor(_proxy, id, label, supportsMultipleAccounts, authorizationServers, resourceServer, onDidChangeSessionsEmitter) {
    super();
    this._proxy = _proxy;
    this.id = id;
    this.label = label;
    this.supportsMultipleAccounts = supportsMultipleAccounts;
    this.authorizationServers = authorizationServers;
    this.resourceServer = resourceServer;
    this.onDidChangeSessions = onDidChangeSessionsEmitter.event;
  }
  async getSessions(scopes, options) {
    return this._proxy.$getSessions(this.id, scopes, options);
  }
  createSession(scopes, options) {
    return this._proxy.$createSession(this.id, scopes, options);
  }
  async removeSession(sessionId) {
    await this._proxy.$removeSession(this.id, sessionId);
  }
}
class MainThreadAuthenticationProviderWithChallenges extends MainThreadAuthenticationProvider {
  constructor(proxy, id, label, supportsMultipleAccounts, authorizationServers, resourceServer, onDidChangeSessionsEmitter) {
    super(
      proxy,
      id,
      label,
      supportsMultipleAccounts,
      authorizationServers,
      resourceServer,
      onDidChangeSessionsEmitter
    );
  }
  getSessionsFromChallenges(constraint, options) {
    return this._proxy.$getSessionsFromChallenges(this.id, constraint, options);
  }
  createSessionFromChallenges(constraint, options) {
    return this._proxy.$createSessionFromChallenges(this.id, constraint, options);
  }
}
let MainThreadAuthentication = class extends Disposable {
  constructor(extHostContext, productService, authenticationService, authenticationExtensionsService, authenticationAccessService, authenticationUsageService, dialogService, notificationService, extensionService, telemetryService, openerService, logService, urlService, dynamicAuthProviderStorageService, clipboardService, quickInputService, configurationService, secretStorageService) {
    super();
    this.productService = productService;
    this.authenticationService = authenticationService;
    this.authenticationExtensionsService = authenticationExtensionsService;
    this.authenticationAccessService = authenticationAccessService;
    this.authenticationUsageService = authenticationUsageService;
    this.dialogService = dialogService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.telemetryService = telemetryService;
    this.openerService = openerService;
    this.logService = logService;
    this.urlService = urlService;
    this.dynamicAuthProviderStorageService = dynamicAuthProviderStorageService;
    this.clipboardService = clipboardService;
    this.quickInputService = quickInputService;
    this.configurationService = configurationService;
    this.secretStorageService = secretStorageService;
    this._registrations = this._register(new DisposableMap());
    this._sentProviderUsageEvents = /* @__PURE__ */ new Set();
    this._suppressUnregisterEvent = false;
    // TODO@TylerLeonhardt this is a temporary addition to telemetry to understand what extensions are overriding the client id.
    // We can use this telemetry to reach out to these extension authors and let them know that they many need configuration changes
    // due to the adoption of the Microsoft broker.
    // Remove this in a few iterations.
    this._sentClientIdUsageEvents = /* @__PURE__ */ new Set();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
    this._register(this.authenticationService.onDidChangeSessions((e) => this._proxy.$onDidChangeAuthenticationSessions(e.providerId, e.label)));
    this._register(this.authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      if (!this._suppressUnregisterEvent) {
        this._proxy.$onDidUnregisterAuthenticationProvider(e.id);
      }
    }));
    this._register(this.authenticationExtensionsService.onDidChangeAccountPreference((e) => {
      const providerInfo = this.authenticationService.getProvider(e.providerId);
      this._proxy.$onDidChangeAuthenticationSessions(providerInfo.id, providerInfo.label, e.extensionIds);
    }));
    this._register(this.dynamicAuthProviderStorageService.onDidChangeTokens((e) => {
      this._proxy.$onDidChangeDynamicAuthProviderTokens(e.authProviderId, e.clientId, e.tokens);
    }));
    this._register(authenticationService.registerAuthenticationProviderHostDelegate({
      // Prefer Node.js extension hosts when they're available. No CORS issues etc.
      priority: extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker ? 0 : 1,
      create: async (authorizationServer, serverMetadata, resource, overrideClientId, overrideClientSecret) => {
        const authProviderId = getDynamicAuthenticationProviderId(authorizationServer, resource);
        const clientDetails = await this.dynamicAuthProviderStorageService.getClientRegistration(authProviderId);
        let clientId = overrideClientId ?? clientDetails?.clientId;
        const clientSecret = overrideClientId ? overrideClientSecret : overrideClientSecret ?? clientDetails?.clientSecret;
        let initialTokens = void 0;
        if (clientId) {
          initialTokens = await this.dynamicAuthProviderStorageService.getSessionsForDynamicAuthProvider(authProviderId, clientId);
        } else if (serverMetadata.client_id_metadata_document_supported) {
          clientId = this.productService.authClientIdMetadataUrl;
        }
        return await this._proxy.$registerDynamicAuthProvider(
          authorizationServer,
          serverMetadata,
          resource,
          clientId,
          clientSecret,
          initialTokens
        );
      },
      createXaa: async (issuer) => {
        const authProviderId = `xaa:${issuer.toString(true)}`;
        const { metadata: serverMetadata } = await fetchAuthorizationServerMetadata(issuer.toString(true));
        const configuredIdp = this.configurationService.getValue(mcpEnterpriseManagedAuthIdpSection) ?? {};
        const configuredClientId = configuredIdp.clientId?.trim() || void 0;
        const configuredClientSecret = configuredIdp.clientSecret?.trim() || void 0;
        const cached = await this.dynamicAuthProviderStorageService.getClientRegistration(authProviderId);
        const clientId = configuredClientId ?? cached?.clientId;
        const clientSecret = configuredClientSecret ?? cached?.clientSecret;
        let initialTokens = void 0;
        if (clientId) {
          initialTokens = await this.dynamicAuthProviderStorageService.getSessionsForDynamicAuthProvider(authProviderId, clientId);
        }
        return await this._proxy.$registerXaaAuthProvider(
          issuer,
          serverMetadata,
          clientId,
          clientSecret,
          initialTokens
        );
      }
    }));
  }
  async $registerAuthenticationProvider({ id, label, supportsMultipleAccounts, resourceServer, supportedAuthorizationServers, supportsChallenges }) {
    if (!this.authenticationService.declaredProviders.find((p) => p.id === id)) {
      this.logService.warn(`Authentication provider ${id} was not declared in the Extension Manifest.`);
      this.telemetryService.publicLog2("authentication.providerNotDeclared", { id });
    }
    const emitter = new Emitter();
    this._registrations.set(id, emitter);
    const supportedAuthorizationServerUris = (supportedAuthorizationServers ?? []).map((i) => URI.revive(i));
    const provider = supportsChallenges ? new MainThreadAuthenticationProviderWithChallenges(
      this._proxy,
      id,
      label,
      supportsMultipleAccounts,
      supportedAuthorizationServerUris,
      resourceServer ? URI.revive(resourceServer) : void 0,
      emitter
    ) : new MainThreadAuthenticationProvider(
      this._proxy,
      id,
      label,
      supportsMultipleAccounts,
      supportedAuthorizationServerUris,
      resourceServer ? URI.revive(resourceServer) : void 0,
      emitter
    );
    this.authenticationService.registerAuthenticationProvider(id, provider);
  }
  async $unregisterAuthenticationProvider(id) {
    this._registrations.deleteAndDispose(id);
    this._suppressUnregisterEvent = true;
    try {
      this.authenticationService.unregisterAuthenticationProvider(id);
    } finally {
      this._suppressUnregisterEvent = false;
    }
  }
  async $ensureProvider(id) {
    if (!this.authenticationService.isAuthenticationProviderRegistered(id)) {
      return await this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(id), ActivationKind.Immediate);
    }
  }
  async $sendDidChangeSessions(providerId, event) {
    const obj = this._registrations.get(providerId);
    if (obj instanceof Emitter) {
      obj.fire(event);
    }
  }
  $removeSession(providerId, sessionId) {
    return this.authenticationService.removeSession(providerId, sessionId);
  }
  async $waitForUriHandler(expectedUri) {
    const deferredPromise = new DeferredPromise();
    const disposable = this.urlService.registerHandler({
      handleURL: async (uri) => {
        if (uri.scheme !== expectedUri.scheme || uri.authority !== expectedUri.authority || uri.path !== expectedUri.path) {
          return false;
        }
        deferredPromise.complete(uri);
        disposable.dispose();
        return true;
      }
    });
    const result = await raceTimeout(deferredPromise.p, 5 * 60 * 1e3);
    if (!result) {
      throw new Error("Timed out waiting for URI handler");
    }
    return await deferredPromise.p;
  }
  $showContinueNotification(message) {
    const yes = nls.localize("yes", "Yes");
    const no = nls.localize("no", "No");
    const deferredPromise = new DeferredPromise();
    let result = false;
    const handle = this.notificationService.prompt(
      Severity.Warning,
      message,
      [{
        label: yes,
        run: () => result = true
      }, {
        label: no,
        run: () => result = false
      }]
    );
    const disposable = handle.onDidClose(() => {
      deferredPromise.complete(result);
      disposable.dispose();
    });
    return deferredPromise.p;
  }
  async $registerDynamicAuthenticationProvider(details) {
    await this.$registerAuthenticationProvider({
      id: details.id,
      label: details.label,
      supportsMultipleAccounts: true,
      supportedAuthorizationServers: [details.authorizationServer],
      resourceServer: details.resourceServer
    });
    await this.dynamicAuthProviderStorageService.storeClientRegistration(details.id, URI.revive(details.authorizationServer).toString(true), details.clientId, details.clientSecret, details.label);
  }
  async $setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions) {
    await this.dynamicAuthProviderStorageService.setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions);
  }
  async $sendDidChangeDynamicProviderInfo({ providerId, clientId, authorizationServer, label, clientSecret }) {
    this.logService.info(`Client ID for authentication provider ${providerId} changed to ${clientId}`);
    const existing = this.dynamicAuthProviderStorageService.getInteractedProviders().find((p) => p.providerId === providerId);
    if (!existing) {
      throw new Error(`Dynamic authentication provider ${providerId} not found. Has it been registered?`);
    }
    await this.dynamicAuthProviderStorageService.storeClientRegistration(
      providerId || existing.providerId,
      authorizationServer ? URI.revive(authorizationServer).toString(true) : existing.authorizationServer,
      clientId || existing.clientId,
      clientSecret,
      label || existing.label
    );
  }
  async loginPrompt(provider, extensionName, recreatingSession, options) {
    let message;
    const customMessage = provider.confirmation?.(extensionName, recreatingSession);
    if (customMessage) {
      message = customMessage;
    } else {
      message = recreatingSession ? nls.localize("confirmRelogin", "The extension '{0}' wants you to sign in again using {1}.", extensionName, provider.label) : nls.localize("confirmLogin", "The extension '{0}' wants to sign in using {1}.", extensionName, provider.label);
    }
    const buttons = [
      {
        label: nls.localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
        run() {
          return true;
        }
      }
    ];
    if (options?.learnMore) {
      buttons.push({
        label: nls.localize("learnMore", "Learn more"),
        run: async () => {
          const result2 = this.loginPrompt(provider, extensionName, recreatingSession, options);
          await this.openerService.open(URI.revive(options.learnMore), { allowCommands: true });
          return await result2;
        }
      });
    }
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message,
      buttons,
      detail: options?.detail,
      cancelButton: true
    });
    return result ?? false;
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
  async doGetSession(providerId, scopeListOrRequest, extensionId, extensionName, options) {
    const authorizationServer = URI.revive(options.authorizationServer);
    const sessions = await this.authenticationService.getSessions(providerId, scopeListOrRequest, { account: options.account, authorizationServer }, true);
    const provider = this.authenticationService.getProvider(providerId);
    if (options.forceNewSession && options.createIfNone) {
      throw new Error("Invalid combination of options. Please remove one of the following: forceNewSession, createIfNone");
    }
    if (options.forceNewSession && options.silent) {
      throw new Error("Invalid combination of options. Please remove one of the following: forceNewSession, silent");
    }
    if (options.createIfNone && options.silent) {
      throw new Error("Invalid combination of options. Please remove one of the following: createIfNone, silent");
    }
    if (options.clearSessionPreference) {
      this.authenticationExtensionsService.removeAccountPreference(extensionId, providerId);
    }
    const matchingAccountPreferenceSession = (
      // If an account was passed in, that takes precedence over the account preference
      options.account ? sessions[0] : this._getAccountPreference(extensionId, providerId, sessions)
    );
    if (!options.forceNewSession && sessions.length) {
      if (matchingAccountPreferenceSession && this.authenticationAccessService.isAccessAllowed(providerId, matchingAccountPreferenceSession.account.label, extensionId)) {
        return matchingAccountPreferenceSession;
      }
      if (!provider.supportsMultipleAccounts && this.authenticationAccessService.isAccessAllowed(providerId, sessions[0].account.label, extensionId)) {
        return sessions[0];
      }
    }
    if (options.createIfNone || options.forceNewSession) {
      let uiOptions;
      if (typeof options.forceNewSession === "object") {
        uiOptions = options.forceNewSession;
      } else if (typeof options.createIfNone === "object") {
        uiOptions = options.createIfNone;
      }
      const recreatingSession = !!(options.forceNewSession && sessions.length);
      const isAllowed = await this.loginPrompt(provider, extensionName, recreatingSession, uiOptions);
      if (!isAllowed) {
        throw new Error("User did not consent to login.");
      }
      let session;
      if (sessions?.length && !options.forceNewSession) {
        session = provider.supportsMultipleAccounts && !options.account ? await this.authenticationExtensionsService.selectSession(providerId, extensionId, extensionName, scopeListOrRequest, sessions) : sessions[0];
      } else {
        const accountToCreate = options.account ?? matchingAccountPreferenceSession?.account;
        do {
          session = await this.authenticationService.createSession(
            providerId,
            scopeListOrRequest,
            {
              activateImmediate: true,
              account: accountToCreate,
              authorizationServer
            }
          );
        } while (accountToCreate && accountToCreate.label !== session.account.label && !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label));
      }
      this.authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
      this.authenticationExtensionsService.updateNewSessionRequests(providerId, [session]);
      this.authenticationExtensionsService.updateAccountPreference(extensionId, providerId, session.account);
      return session;
    }
    if (!matchingAccountPreferenceSession) {
      const validSessions = sessions.filter((session) => this.authenticationAccessService.isAccessAllowed(providerId, session.account.label, extensionId));
      if (validSessions.length === 1) {
        return validSessions[0];
      }
    }
    if (!options.silent) {
      sessions.length ? this.authenticationExtensionsService.requestSessionAccess(providerId, extensionId, extensionName, scopeListOrRequest, sessions) : await this.authenticationExtensionsService.requestNewSession(providerId, scopeListOrRequest, extensionId, extensionName);
    }
    return void 0;
  }
  async $getSession(providerId, scopeListOrRequest, extensionId, extensionName, options) {
    const scopes = isAuthenticationWwwAuthenticateRequest(scopeListOrRequest) ? scopeListOrRequest.fallbackScopes : scopeListOrRequest;
    if (scopes) {
      this.sendClientIdUsageTelemetry(extensionId, providerId, scopes);
    }
    const session = await this.doGetSession(providerId, scopeListOrRequest, extensionId, extensionName, options);
    if (session) {
      this.sendProviderUsageTelemetry(extensionId, providerId);
      this.authenticationUsageService.addAccountUsage(providerId, session.account.label, session.scopes, extensionId, extensionName);
    }
    return session;
  }
  async $getAccounts(providerId) {
    const accounts = await this.authenticationService.getAccounts(providerId);
    return accounts;
  }
  sendClientIdUsageTelemetry(extensionId, providerId, scopes) {
    const containsVSCodeClientIdScope = scopes.some((scope) => scope.startsWith("VSCODE_CLIENT_ID:"));
    const key = `${extensionId}|${providerId}|${containsVSCodeClientIdScope}`;
    if (this._sentClientIdUsageEvents.has(key)) {
      return;
    }
    this._sentClientIdUsageEvents.add(key);
    if (containsVSCodeClientIdScope) {
      this.telemetryService.publicLog2("authentication.clientIdUsage", { extensionId });
    }
  }
  sendProviderUsageTelemetry(extensionId, providerId) {
    const key = `${extensionId}|${providerId}`;
    if (this._sentProviderUsageEvents.has(key)) {
      return;
    }
    this._sentProviderUsageEvents.add(key);
    this.telemetryService.publicLog2("authentication.providerUsage", { providerId, extensionId });
  }
  //#region Account Preferences
  // TODO@TylerLeonhardt: Update this after a few iterations to no longer fallback to the session preference
  _getAccountPreference(extensionId, providerId, sessions) {
    if (sessions.length === 0) {
      return void 0;
    }
    const accountNamePreference = this.authenticationExtensionsService.getAccountPreference(extensionId, providerId);
    if (accountNamePreference) {
      const session = sessions.find((session2) => session2.account.label === accountNamePreference);
      return session;
    }
    return void 0;
  }
  //#endregion
  async $showDeviceCodeModal(userCode, verificationUri) {
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("deviceCodeTitle", "Device Code Authentication"),
      detail: nls.localize("deviceCodeDetail", "Your code: {0}\n\nTo complete authentication, navigate to {1} and enter the code above.", userCode, verificationUri),
      buttons: [
        {
          label: nls.localize("copyAndContinue", "Copy & Continue"),
          run: () => true
        }
      ],
      cancelButton: true
    });
    if (result) {
      try {
        await this.clipboardService.writeText(userCode);
        return await this.openerService.open(URI.parse(verificationUri));
      } catch (error) {
        this.notificationService.error(nls.localize("failedToOpenUri", "Failed to open {0}", verificationUri));
      }
    }
    return false;
  }
  async $promptForClientRegistration(authorizationServerUrl) {
    const redirectUrls = "http://127.0.0.1:33418\nhttps://vscode.dev/redirect";
    const result = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("dcrNotSupported", "Dynamic Client Registration not supported"),
      detail: nls.localize("dcrNotSupportedDetail", "The authorization server '{0}' does not support automatic client registration. Do you want to proceed by manually providing a client registration (client ID)?\n\nNote: When registering your OAuth application, make sure to include these redirect URIs:\n{1}", authorizationServerUrl, redirectUrls),
      buttons: [
        {
          label: nls.localize("dcrCopyUrlsAndProceed", "Copy URIs & Proceed"),
          run: async () => {
            try {
              await this.clipboardService.writeText(redirectUrls);
            } catch (error) {
              this.notificationService.error(nls.localize("dcrFailedToCopy", "Failed to copy redirect URIs to clipboard."));
            }
            return true;
          }
        }
      ],
      cancelButton: {
        label: nls.localize("cancel", "Cancel"),
        run: () => false
      }
    });
    if (!result) {
      return void 0;
    }
    const sharedTitle = nls.localize("addClientRegistrationDetails", "Add Client Registration Details");
    const clientId = await this.quickInputService.input({
      title: sharedTitle,
      prompt: nls.localize("clientIdPrompt", "Enter an existing client ID that has been registered with the following redirect URIs: http://127.0.0.1:33418, https://vscode.dev/redirect"),
      placeHolder: nls.localize("clientIdPlaceholder", "OAuth client ID (azye39d...)"),
      ignoreFocusLost: true,
      validateInput: async (value) => {
        if (!value || value.trim().length === 0) {
          return nls.localize("clientIdRequired", "Client ID is required");
        }
        return void 0;
      }
    });
    if (!clientId || clientId.trim().length === 0) {
      return void 0;
    }
    const clientSecret = await this.quickInputService.input({
      title: sharedTitle,
      prompt: nls.localize("clientSecretPrompt", "(optional) Enter an existing client secret associated with the client id '{0}' or leave this field blank", clientId),
      placeHolder: nls.localize("clientSecretPlaceholder", "OAuth client secret (wer32o50f...) or leave it blank"),
      password: true,
      ignoreFocusLost: true
    });
    return {
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim() || void 0
    };
  }
  async $promptForResourceClientSecret(resourceClientId, resource) {
    const value = await this.quickInputService.input({
      title: nls.localize("xaaResourceSecretTitle", "Resource Client Secret Required"),
      prompt: nls.localize(
        "xaaResourceSecretPrompt",
        "The resource at '{0}' uses a per-resource client identifier '{1}'. Enter the matching client secret (leave blank if none). The value is saved in OS secret storage; manage it later via the 'Set Client Secret' code lens in mcp.json.",
        resource,
        resourceClientId
      ),
      placeHolder: nls.localize("xaaResourceSecretPlaceholder", "Resource client secret"),
      password: true,
      ignoreFocusLost: true
    });
    if (value === void 0) {
      return void 0;
    }
    const trimmed = value.trim();
    const key = mcpOAuthClientSecretStorageKey(resource, resourceClientId);
    try {
      if (trimmed.length === 0) {
        await this.secretStorageService.delete(key);
      } else {
        await this.secretStorageService.set(key, trimmed);
      }
    } catch (err) {
      this.logService.warn(`[XAA] Failed to persist resource client secret for ${resource} / ${resourceClientId}: ${err.message}`);
    }
    return trimmed;
  }
};
MainThreadAuthentication = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadAuthentication),
  __decorateParam(1, IProductService),
  __decorateParam(2, IAuthenticationService),
  __decorateParam(3, IAuthenticationExtensionsService),
  __decorateParam(4, IAuthenticationAccessService),
  __decorateParam(5, IAuthenticationUsageService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IURLService),
  __decorateParam(13, IDynamicAuthenticationProviderStorageService),
  __decorateParam(14, IClipboardService),
  __decorateParam(15, IQuickInputService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, ISecretStorageService)
], MainThreadAuthentication);
export {
  MainThreadAuthentication
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQXV0aGVudGljYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uLCBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQsIGdldER5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVySWQsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBJQXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZSwgQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCwgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9ucywgaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QsIElBdXRoZW50aWNhdGlvbkNvbnN0cmFpbnQsIElBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdEF1dGhlbnRpY2F0aW9uU2hhcGUsIEV4dEhvc3RDb250ZXh0LCBJUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyRGV0YWlscywgSVJlZ2lzdGVyRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJEZXRhaWxzLCBNYWluQ29udGV4dCwgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aXZhdGlvbktpbmQsIElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlckFjdGl2YXRpb25FdmVudCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEtpbmQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0S2luZC5qcyc7XG5pbXBvcnQgeyBJVVJMU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgSUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXkgfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWNwRW50ZXJwcmlzZU1hbmFnZWRBdXRoSWRwQ29uZmlnLCBtY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBTZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVPcHRpb25zIHtcblx0ZGV0YWlsPzogc3RyaW5nO1xuXHRsZWFybk1vcmU/OiBVcmlDb21wb25lbnRzO1xuXHRzZXNzaW9uVG9SZWNyZWF0ZT86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRoZW50aWNhdGlvbkdldFNlc3Npb25PcHRpb25zIHtcblx0Y2xlYXJTZXNzaW9uUHJlZmVyZW5jZT86IGJvb2xlYW47XG5cdGNyZWF0ZUlmTm9uZT86IGJvb2xlYW4gfCBBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlT3B0aW9ucztcblx0Zm9yY2VOZXdTZXNzaW9uPzogYm9vbGVhbiB8IEF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVPcHRpb25zO1xuXHRzaWxlbnQ/OiBib29sZWFuO1xuXHRhY2NvdW50PzogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudDtcblx0YXV0aG9yaXphdGlvblNlcnZlcj86IFVyaUNvbXBvbmVudHM7XG59XG5cbmNsYXNzIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfcHJveHk6IEV4dEhvc3RBdXRoZW50aWNhdGlvblNoYXBlLFxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdXBwb3J0c011bHRpcGxlQWNjb3VudHM6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBSZWFkb25seUFycmF5PFVSST4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc291cmNlU2VydmVyOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXI6IEVtaXR0ZXI8QXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50Pixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBvbkRpZENoYW5nZVNlc3Npb25zRW1pdHRlci5ldmVudDtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25zKHNjb3Blczogc3RyaW5nW10gfCB1bmRlZmluZWQsIG9wdGlvbnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGdldFNlc3Npb25zKHRoaXMuaWQsIHNjb3Blcywgb3B0aW9ucyk7XG5cdH1cblxuXHRjcmVhdGVTZXNzaW9uKHNjb3Blczogc3RyaW5nW10sIG9wdGlvbnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kY3JlYXRlU2Vzc2lvbih0aGlzLmlkLCBzY29wZXMsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRyZW1vdmVTZXNzaW9uKHRoaXMuaWQsIHNlc3Npb25JZCk7XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJXaXRoQ2hhbGxlbmdlcyBleHRlbmRzIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblByb3ZpZGVyIGltcGxlbWVudHMgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3h5OiBFeHRIb3N0QXV0aGVudGljYXRpb25TaGFwZSxcblx0XHRpZDogc3RyaW5nLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiBib29sZWFuLFxuXHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBSZWFkb25seUFycmF5PFVSST4sXG5cdFx0cmVzb3VyY2VTZXJ2ZXI6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zRW1pdHRlcjogRW1pdHRlcjxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+LFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdHByb3h5LFxuXHRcdFx0aWQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdHN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cyxcblx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzLFxuXHRcdFx0cmVzb3VyY2VTZXJ2ZXIsXG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25zRW1pdHRlclxuXHRcdCk7XG5cdH1cblxuXHRnZXRTZXNzaW9uc0Zyb21DaGFsbGVuZ2VzKGNvbnN0cmFpbnQ6IElBdXRoZW50aWNhdGlvbkNvbnN0cmFpbnQsIG9wdGlvbnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHJlYWRvbmx5IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRnZXRTZXNzaW9uc0Zyb21DaGFsbGVuZ2VzKHRoaXMuaWQsIGNvbnN0cmFpbnQsIG9wdGlvbnMpO1xuXHR9XG5cblx0Y3JlYXRlU2Vzc2lvbkZyb21DaGFsbGVuZ2VzKGNvbnN0cmFpbnQ6IElBdXRoZW50aWNhdGlvbkNvbnN0cmFpbnQsIG9wdGlvbnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kY3JlYXRlU2Vzc2lvbkZyb21DaGFsbGVuZ2VzKHRoaXMuaWQsIGNvbnN0cmFpbnQsIG9wdGlvbnMpO1xuXHR9XG59XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkQXV0aGVudGljYXRpb24pXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblNoYXBlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RBdXRoZW50aWNhdGlvblNoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIF9zZW50UHJvdmlkZXJVc2FnZUV2ZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIF9zdXBwcmVzc1VucmVnaXN0ZXJFdmVudCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZTogSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVUkxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJsU2VydmljZTogSVVSTFNlcnZpY2UsXG5cdFx0QElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlOiBJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RBdXRoZW50aWNhdGlvbik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gdGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlQXV0aGVudGljYXRpb25TZXNzaW9ucyhlLnByb3ZpZGVySWQsIGUubGFiZWwpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihlID0+IHtcblx0XHRcdGlmICghdGhpcy5fc3VwcHJlc3NVbnJlZ2lzdGVyRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkVW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZS5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5vbkRpZENoYW5nZUFjY291bnRQcmVmZXJlbmNlKGUgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJJbmZvID0gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIoZS5wcm92aWRlcklkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZUF1dGhlbnRpY2F0aW9uU2Vzc2lvbnMocHJvdmlkZXJJbmZvLmlkLCBwcm92aWRlckluZm8ubGFiZWwsIGUuZXh0ZW5zaW9uSWRzKTtcblx0XHR9KSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGR5bmFtaWMgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgdG9rZW4gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVG9rZW5zKGUgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlRHluYW1pY0F1dGhQcm92aWRlclRva2VucyhlLmF1dGhQcm92aWRlcklkLCBlLmNsaWVudElkLCBlLnRva2Vucyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlckhvc3REZWxlZ2F0ZSh7XG5cdFx0XHQvLyBQcmVmZXIgTm9kZS5qcyBleHRlbnNpb24gaG9zdHMgd2hlbiB0aGV5J3JlIGF2YWlsYWJsZS4gTm8gQ09SUyBpc3N1ZXMgZXRjLlxuXHRcdFx0cHJpb3JpdHk6IGV4dEhvc3RDb250ZXh0LmV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlciA/IDAgOiAxLFxuXHRcdFx0Y3JlYXRlOiBhc3luYyAoYXV0aG9yaXphdGlvblNlcnZlciwgc2VydmVyTWV0YWRhdGEsIHJlc291cmNlLCBvdmVycmlkZUNsaWVudElkLCBvdmVycmlkZUNsaWVudFNlY3JldCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhdXRoUHJvdmlkZXJJZCA9IGdldER5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVySWQoYXV0aG9yaXphdGlvblNlcnZlciwgcmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBjbGllbnREZXRhaWxzID0gYXdhaXQgdGhpcy5keW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2UuZ2V0Q2xpZW50UmVnaXN0cmF0aW9uKGF1dGhQcm92aWRlcklkKTtcblx0XHRcdFx0bGV0IGNsaWVudElkID0gb3ZlcnJpZGVDbGllbnRJZCA/PyBjbGllbnREZXRhaWxzPy5jbGllbnRJZDtcblx0XHRcdFx0Y29uc3QgY2xpZW50U2VjcmV0ID0gb3ZlcnJpZGVDbGllbnRJZFxuXHRcdFx0XHRcdD8gb3ZlcnJpZGVDbGllbnRTZWNyZXRcblx0XHRcdFx0XHQ6IChvdmVycmlkZUNsaWVudFNlY3JldCA/PyBjbGllbnREZXRhaWxzPy5jbGllbnRTZWNyZXQpO1xuXHRcdFx0XHRsZXQgaW5pdGlhbFRva2VuczogKElBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSAmIHsgY3JlYXRlZF9hdDogbnVtYmVyIH0pW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChjbGllbnRJZCkge1xuXHRcdFx0XHRcdGluaXRpYWxUb2tlbnMgPSBhd2FpdCB0aGlzLmR5bmFtaWNBdXRoUHJvdmlkZXJTdG9yYWdlU2VydmljZS5nZXRTZXNzaW9uc0ZvckR5bmFtaWNBdXRoUHJvdmlkZXIoYXV0aFByb3ZpZGVySWQsIGNsaWVudElkKTtcblx0XHRcdFx0XHQvLyBJZiB3ZSBkb24ndCBhbHJlYWR5IGhhdmUgYSBjbGllbnQgaWQsIGNoZWNrIGlmIHRoZSBzZXJ2ZXIgc3VwcG9ydHMgdGhlIENsaWVudCBJZCBNZXRhZGF0YSBmbG93IChzZWUgZG9jcyBvbiB0aGUgcHJvcGVydHkpXG5cdFx0XHRcdFx0Ly8gYW5kIGFkZCB0aGUgXCJjbGllbnQgaWRcIiBpZiBzby5cblx0XHRcdFx0fSBlbHNlIGlmIChzZXJ2ZXJNZXRhZGF0YS5jbGllbnRfaWRfbWV0YWRhdGFfZG9jdW1lbnRfc3VwcG9ydGVkKSB7XG5cdFx0XHRcdFx0Y2xpZW50SWQgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmF1dGhDbGllbnRJZE1ldGFkYXRhVXJsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9wcm94eS4kcmVnaXN0ZXJEeW5hbWljQXV0aFByb3ZpZGVyKFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXIsXG5cdFx0XHRcdFx0c2VydmVyTWV0YWRhdGEsXG5cdFx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRcdFx0Y2xpZW50U2VjcmV0LFxuXHRcdFx0XHRcdGluaXRpYWxUb2tlbnNcblx0XHRcdFx0KTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVYYWE6IGFzeW5jIChpc3N1ZXIpID0+IHtcblx0XHRcdFx0Ly8gWEFBIHByb3ZpZGVycyBhcmUga2V5ZWQgYnkgaXNzdWVyIGFsb25lIHNvIHRoZXkgY2FuIGJlIHJldXNlZCBhY3Jvc3MgbWFueSBlbnRlcnByaXNlLW1hbmFnZWQgc2VydmVycy5cblx0XHRcdFx0Y29uc3QgYXV0aFByb3ZpZGVySWQgPSBgeGFhOiR7aXNzdWVyLnRvU3RyaW5nKHRydWUpfWA7XG5cdFx0XHRcdGNvbnN0IHsgbWV0YWRhdGE6IHNlcnZlck1ldGFkYXRhIH0gPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShpc3N1ZXIudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRcdC8vIFByZWZlciB0aGUgdXNlci1jb25maWd1cmVkIElkUCBjbGllbnRfaWQgLyBjbGllbnRfc2VjcmV0IG92ZXIgYW55IGNhY2hlZCByZWdpc3RyYXRpb24uXG5cdFx0XHRcdC8vIFhBQSByZXF1aXJlcyBhIHByZS1wcm92aXNpb25lZCAoYWRtaW4tYXBwcm92ZWQpIGNsaWVudF9pZCBhdCB0aGUgSWRQIFx1MjAxNCB0aGVyZSBpcyBubyBEQ1Jcblx0XHRcdFx0Ly8gZmFsbGJhY2sgXHUyMDE0IHNvIGFuIGV4cGxpY2l0IHNldHRpbmcgaXMgdGhlIG1vc3QgcmVsaWFibGUgc291cmNlLiBUeXBpY2FsbHkgZGVsaXZlcmVkIHZpYVxuXHRcdFx0XHQvLyBlbnRlcnByaXNlIHBvbGljeTsgZGV2ZWxvcGVycyBtYXkgaGFuZC1lZGl0IHNldHRpbmdzLmpzb24gZm9yIGxvY2FsIHRlc3RpbmcuXG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRJZHAgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElNY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBDb25maWcgfCB1bmRlZmluZWQ+KG1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcFNlY3Rpb24pID8/IHt9O1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkQ2xpZW50SWQgPSBjb25maWd1cmVkSWRwLmNsaWVudElkPy50cmltKCkgfHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkQ2xpZW50U2VjcmV0ID0gY29uZmlndXJlZElkcC5jbGllbnRTZWNyZXQ/LnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGNhY2hlZCA9IGF3YWl0IHRoaXMuZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmdldENsaWVudFJlZ2lzdHJhdGlvbihhdXRoUHJvdmlkZXJJZCk7XG5cdFx0XHRcdGNvbnN0IGNsaWVudElkID0gY29uZmlndXJlZENsaWVudElkID8/IGNhY2hlZD8uY2xpZW50SWQ7XG5cdFx0XHRcdGNvbnN0IGNsaWVudFNlY3JldCA9IGNvbmZpZ3VyZWRDbGllbnRTZWNyZXQgPz8gY2FjaGVkPy5jbGllbnRTZWNyZXQ7XG5cdFx0XHRcdGxldCBpbml0aWFsVG9rZW5zOiAoSUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlICYgeyBjcmVhdGVkX2F0OiBudW1iZXIgfSlbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGNsaWVudElkKSB7XG5cdFx0XHRcdFx0aW5pdGlhbFRva2VucyA9IGF3YWl0IHRoaXMuZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmdldFNlc3Npb25zRm9yRHluYW1pY0F1dGhQcm92aWRlcihhdXRoUHJvdmlkZXJJZCwgY2xpZW50SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE5vdGU6IFhBQSBkb2VzIE5PVCB1c2UgQ0lNRCBvciBEQ1IgXHUyMDE0IHRoZSByZXF1ZXN0aW5nIGFwcCBtdXN0IGJlIHByZS1yZWdpc3RlcmVkIHdpdGggdGhlXG5cdFx0XHRcdC8vIElkUCB1bmRlciBhbiBhZG1pbi1hcHByb3ZlZCBjcm9zcy1hcHAtYWNjZXNzIHRydXN0IHJlbGF0aW9uc2hpcC4gVGhlIGV4dC1ob3N0IHNpZGVcblx0XHRcdFx0Ly8gKGAkcmVnaXN0ZXJYYWFBdXRoUHJvdmlkZXJgKSBwcm9tcHRzIHRoZSB1c2VyIGZvciBjbGllbnRfaWQgKyBjbGllbnRfc2VjcmV0IHdoZW4gdGhlcmVcblx0XHRcdFx0Ly8gaXMgbm8gY2FjaGVkIHJlZ2lzdHJhdGlvbiBhbmQgbm8gY29uZmlndXJlZCB2YWx1ZS5cblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Byb3h5LiRyZWdpc3RlclhhYUF1dGhQcm92aWRlcihcblx0XHRcdFx0XHRpc3N1ZXIsXG5cdFx0XHRcdFx0c2VydmVyTWV0YWRhdGEsXG5cdFx0XHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRcdFx0Y2xpZW50U2VjcmV0LFxuXHRcdFx0XHRcdGluaXRpYWxUb2tlbnNcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyAkcmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKHsgaWQsIGxhYmVsLCBzdXBwb3J0c011bHRpcGxlQWNjb3VudHMsIHJlc291cmNlU2VydmVyLCBzdXBwb3J0ZWRBdXRob3JpemF0aW9uU2VydmVycywgc3VwcG9ydHNDaGFsbGVuZ2VzIH06IElSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXJEZXRhaWxzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5kZWNsYXJlZFByb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gaWQpKSB7XG5cdFx0XHQvLyBJZiB0ZWxlbWV0cnkgc2hvd3MgdGhhdCB0aGlzIGlzIG5vdCBoYXBwZW5pbmcgbXVjaCwgd2UgY2FuIGluc3RlYWQgdGhyb3cgYW4gZXJyb3IgaGVyZS5cblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBBdXRoZW50aWNhdGlvbiBwcm92aWRlciAke2lkfSB3YXMgbm90IGRlY2xhcmVkIGluIHRoZSBFeHRlbnNpb24gTWFuaWZlc3QuYCk7XG5cdFx0XHR0eXBlIEF1dGhQcm92aWRlck5vdERlY2xhcmVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnVHlsZXJMZW9uaGFyZHQnO1xuXHRcdFx0XHRjb21tZW50OiAnQW4gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgd2FzIG5vdCBkZWNsYXJlZCBpbiB0aGUgRXh0ZW5zaW9uIE1hbmlmZXN0Lic7XG5cdFx0XHRcdGlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByb3ZpZGVyIGlkLicgfTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IGlkOiBzdHJpbmcgfSwgQXV0aFByb3ZpZGVyTm90RGVjbGFyZWRDbGFzc2lmaWNhdGlvbj4oJ2F1dGhlbnRpY2F0aW9uLnByb3ZpZGVyTm90RGVjbGFyZWQnLCB7IGlkIH0pO1xuXHRcdH1cblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8QXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50PigpO1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGlkLCBlbWl0dGVyKTtcblx0XHRjb25zdCBzdXBwb3J0ZWRBdXRob3JpemF0aW9uU2VydmVyVXJpcyA9IChzdXBwb3J0ZWRBdXRob3JpemF0aW9uU2VydmVycyA/PyBbXSkubWFwKGkgPT4gVVJJLnJldml2ZShpKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPVxuXHRcdFx0c3VwcG9ydHNDaGFsbGVuZ2VzXG5cdFx0XHRcdD8gbmV3IE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblByb3ZpZGVyV2l0aENoYWxsZW5nZXMoXG5cdFx0XHRcdFx0dGhpcy5fcHJveHksXG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzLFxuXHRcdFx0XHRcdHN1cHBvcnRlZEF1dGhvcml6YXRpb25TZXJ2ZXJVcmlzLFxuXHRcdFx0XHRcdHJlc291cmNlU2VydmVyID8gVVJJLnJldml2ZShyZXNvdXJjZVNlcnZlcikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZW1pdHRlclxuXHRcdFx0XHQpXG5cdFx0XHRcdDogbmV3IE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKFxuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LFxuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cyxcblx0XHRcdFx0XHRzdXBwb3J0ZWRBdXRob3JpemF0aW9uU2VydmVyVXJpcyxcblx0XHRcdFx0XHRyZXNvdXJjZVNlcnZlciA/IFVSSS5yZXZpdmUocmVzb3VyY2VTZXJ2ZXIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVtaXR0ZXJcblx0XHRcdFx0KTtcblx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoaWQsIHByb3ZpZGVyKTtcblx0fVxuXG5cdGFzeW5jICR1bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHQvLyBUaGUgZXh0IGhvc3Qgc2lkZSBhbHJlYWR5IHVucmVnaXN0ZXJzIHRoZSBwcm92aWRlciwgc28gd2UgY2FuIHN1cHByZXNzIHRoZSBldmVudCBoZXJlLlxuXHRcdHRoaXMuX3N1cHByZXNzVW5yZWdpc3RlckV2ZW50ID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UudW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoaWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zdXBwcmVzc1VucmVnaXN0ZXJFdmVudCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRlbnN1cmVQcm92aWRlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5pc0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJSZWdpc3RlcmVkKGlkKSkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlckFjdGl2YXRpb25FdmVudChpZCksIEFjdGl2YXRpb25LaW5kLkltbWVkaWF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHNlbmREaWRDaGFuZ2VTZXNzaW9ucyhwcm92aWRlcklkOiBzdHJpbmcsIGV2ZW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRW1pdHRlcikge1xuXHRcdFx0b2JqLmZpcmUoZXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdCRyZW1vdmVTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UucmVtb3ZlU2Vzc2lvbihwcm92aWRlcklkLCBzZXNzaW9uSWQpO1xuXHR9XG5cblx0YXN5bmMgJHdhaXRGb3JVcmlIYW5kbGVyKGV4cGVjdGVkVXJpOiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTxVcmlDb21wb25lbnRzPiB7XG5cdFx0Y29uc3QgZGVmZXJyZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTxVcmlDb21wb25lbnRzPigpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLnVybFNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHtcblx0XHRcdGhhbmRsZVVSTDogYXN5bmMgKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRcdGlmICh1cmkuc2NoZW1lICE9PSBleHBlY3RlZFVyaS5zY2hlbWUgfHwgdXJpLmF1dGhvcml0eSAhPT0gZXhwZWN0ZWRVcmkuYXV0aG9yaXR5IHx8IHVyaS5wYXRoICE9PSBleHBlY3RlZFVyaS5wYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRlZmVycmVkUHJvbWlzZS5jb21wbGV0ZSh1cmkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmFjZVRpbWVvdXQoZGVmZXJyZWRQcm9taXNlLnAsIDUgKiA2MCAqIDEwMDApOyAvLyA1IG1pbnV0ZXNcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaW1lZCBvdXQgd2FpdGluZyBmb3IgVVJJIGhhbmRsZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF3YWl0IGRlZmVycmVkUHJvbWlzZS5wO1xuXHR9XG5cblx0JHNob3dDb250aW51ZU5vdGlmaWNhdGlvbihtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB5ZXMgPSBubHMubG9jYWxpemUoJ3llcycsIFwiWWVzXCIpO1xuXHRcdGNvbnN0IG5vID0gbmxzLmxvY2FsaXplKCdubycsIFwiTm9cIik7XG5cdFx0Y29uc3QgZGVmZXJyZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTxib29sZWFuPigpO1xuXHRcdGxldCByZXN1bHQgPSBmYWxzZTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogeWVzLFxuXHRcdFx0XHRydW46ICgpID0+IHJlc3VsdCA9IHRydWVcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6IG5vLFxuXHRcdFx0XHRydW46ICgpID0+IHJlc3VsdCA9IGZhbHNlXG5cdFx0XHR9XSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGhhbmRsZS5vbkRpZENsb3NlKCgpID0+IHtcblx0XHRcdGRlZmVycmVkUHJvbWlzZS5jb21wbGV0ZShyZXN1bHQpO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRlZmVycmVkUHJvbWlzZS5wO1xuXHR9XG5cblx0YXN5bmMgJHJlZ2lzdGVyRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZGV0YWlsczogSVJlZ2lzdGVyRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJEZXRhaWxzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy4kcmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKHtcblx0XHRcdGlkOiBkZXRhaWxzLmlkLFxuXHRcdFx0bGFiZWw6IGRldGFpbHMubGFiZWwsXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQWNjb3VudHM6IHRydWUsXG5cdFx0XHRzdXBwb3J0ZWRBdXRob3JpemF0aW9uU2VydmVyczogW2RldGFpbHMuYXV0aG9yaXphdGlvblNlcnZlcl0sXG5cdFx0XHRyZXNvdXJjZVNlcnZlcjogZGV0YWlscy5yZXNvdXJjZVNlcnZlcixcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLmR5bmFtaWNBdXRoUHJvdmlkZXJTdG9yYWdlU2VydmljZS5zdG9yZUNsaWVudFJlZ2lzdHJhdGlvbihkZXRhaWxzLmlkLCBVUkkucmV2aXZlKGRldGFpbHMuYXV0aG9yaXphdGlvblNlcnZlcikudG9TdHJpbmcodHJ1ZSksIGRldGFpbHMuY2xpZW50SWQsIGRldGFpbHMuY2xpZW50U2VjcmV0LCBkZXRhaWxzLmxhYmVsKTtcblx0fVxuXG5cdGFzeW5jICRzZXRTZXNzaW9uc0ZvckR5bmFtaWNBdXRoUHJvdmlkZXIoYXV0aFByb3ZpZGVySWQ6IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZywgc2Vzc2lvbnM6IChJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UgJiB7IGNyZWF0ZWRfYXQ6IG51bWJlciB9KVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5keW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2Uuc2V0U2Vzc2lvbnNGb3JEeW5hbWljQXV0aFByb3ZpZGVyKGF1dGhQcm92aWRlcklkLCBjbGllbnRJZCwgc2Vzc2lvbnMpO1xuXHR9XG5cblx0YXN5bmMgJHNlbmREaWRDaGFuZ2VEeW5hbWljUHJvdmlkZXJJbmZvKHsgcHJvdmlkZXJJZCwgY2xpZW50SWQsIGF1dGhvcml6YXRpb25TZXJ2ZXIsIGxhYmVsLCBjbGllbnRTZWNyZXQgfTogUGFydGlhbDx7IHByb3ZpZGVySWQ6IHN0cmluZzsgY2xpZW50SWQ6IHN0cmluZzsgYXV0aG9yaXphdGlvblNlcnZlcjogVXJpQ29tcG9uZW50czsgbGFiZWw6IHN0cmluZzsgY2xpZW50U2VjcmV0OiBzdHJpbmcgfT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2xpZW50IElEIGZvciBhdXRoZW50aWNhdGlvbiBwcm92aWRlciAke3Byb3ZpZGVySWR9IGNoYW5nZWQgdG8gJHtjbGllbnRJZH1gKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmdldEludGVyYWN0ZWRQcm92aWRlcnMoKS5maW5kKHAgPT4gcC5wcm92aWRlcklkID09PSBwcm92aWRlcklkKTtcblx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYER5bmFtaWMgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJHtwcm92aWRlcklkfSBub3QgZm91bmQuIEhhcyBpdCBiZWVuIHJlZ2lzdGVyZWQ/YCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcmUgY2xpZW50IGNyZWRlbnRpYWxzIHRvZ2V0aGVyXG5cdFx0YXdhaXQgdGhpcy5keW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2Uuc3RvcmVDbGllbnRSZWdpc3RyYXRpb24oXG5cdFx0XHRwcm92aWRlcklkIHx8IGV4aXN0aW5nLnByb3ZpZGVySWQsXG5cdFx0XHRhdXRob3JpemF0aW9uU2VydmVyID8gVVJJLnJldml2ZShhdXRob3JpemF0aW9uU2VydmVyKS50b1N0cmluZyh0cnVlKSA6IGV4aXN0aW5nLmF1dGhvcml6YXRpb25TZXJ2ZXIsXG5cdFx0XHRjbGllbnRJZCB8fCBleGlzdGluZy5jbGllbnRJZCxcblx0XHRcdGNsaWVudFNlY3JldCxcblx0XHRcdGxhYmVsIHx8IGV4aXN0aW5nLmxhYmVsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9naW5Qcm9tcHQocHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBleHRlbnNpb25OYW1lOiBzdHJpbmcsIHJlY3JlYXRpbmdTZXNzaW9uOiBib29sZWFuLCBvcHRpb25zPzogQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHByb3ZpZGVyIGhhcyBhIGN1c3RvbSBjb25maXJtYXRpb24gbWVzc2FnZVxuXHRcdGNvbnN0IGN1c3RvbU1lc3NhZ2UgPSBwcm92aWRlci5jb25maXJtYXRpb24/LihleHRlbnNpb25OYW1lLCByZWNyZWF0aW5nU2Vzc2lvbik7XG5cdFx0aWYgKGN1c3RvbU1lc3NhZ2UpIHtcblx0XHRcdG1lc3NhZ2UgPSBjdXN0b21NZXNzYWdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlID0gcmVjcmVhdGluZ1Nlc3Npb25cblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2NvbmZpcm1SZWxvZ2luJywgXCJUaGUgZXh0ZW5zaW9uICd7MH0nIHdhbnRzIHlvdSB0byBzaWduIGluIGFnYWluIHVzaW5nIHsxfS5cIiwgZXh0ZW5zaW9uTmFtZSwgcHJvdmlkZXIubGFiZWwpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCdjb25maXJtTG9naW4nLCBcIlRoZSBleHRlbnNpb24gJ3swfScgd2FudHMgdG8gc2lnbiBpbiB1c2luZyB7MX0uXCIsIGV4dGVuc2lvbk5hbWUsIHByb3ZpZGVyLmxhYmVsKTtcblx0XHR9XG5cblx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0QnV0dG9uPGJvb2xlYW4gfCB1bmRlZmluZWQ+W10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdhbGxvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkFsbG93XCIpLFxuXHRcdFx0XHRydW4oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0XTtcblx0XHRpZiAob3B0aW9ucz8ubGVhcm5Nb3JlKSB7XG5cdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdsZWFybk1vcmUnLCBcIkxlYXJuIG1vcmVcIiksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubG9naW5Qcm9tcHQocHJvdmlkZXIsIGV4dGVuc2lvbk5hbWUsIHJlY3JlYXRpbmdTZXNzaW9uLCBvcHRpb25zKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucmV2aXZlKG9wdGlvbnMubGVhcm5Nb3JlISksIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRidXR0b25zLFxuXHRcdFx0ZGV0YWlsOiBvcHRpb25zPy5kZXRhaWwsXG5cdFx0XHRjYW5jZWxCdXR0b246IHRydWUsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0ID8/IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb250aW51ZVdpdGhJbmNvcnJlY3RBY2NvdW50UHJvbXB0KGNob3NlbkFjY291bnRMYWJlbDogc3RyaW5nLCByZXF1ZXN0ZWRBY2NvdW50TGFiZWw6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdpbmNvcnJlY3RBY2NvdW50JywgXCJJbmNvcnJlY3QgYWNjb3VudCBkZXRlY3RlZFwiKSxcblx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdpbmNvcnJlY3RBY2NvdW50RGV0YWlsJywgXCJUaGUgY2hvc2VuIGFjY291bnQsIHswfSwgZG9lcyBub3QgbWF0Y2ggdGhlIHJlcXVlc3RlZCBhY2NvdW50LCB7MX0uXCIsIGNob3NlbkFjY291bnRMYWJlbCwgcmVxdWVzdGVkQWNjb3VudExhYmVsKSxcblx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRjYW5jZWxCdXR0b246IHRydWUsXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdrZWVwJywgJ0tlZXAgezB9JywgY2hvc2VuQWNjb3VudExhYmVsKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGNob3NlbkFjY291bnRMYWJlbFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbG9naW5XaXRoJywgJ0xvZ2luIHdpdGggezB9JywgcmVxdWVzdGVkQWNjb3VudExhYmVsKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHJlcXVlc3RlZEFjY291bnRMYWJlbFxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQucmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LnJlc3VsdCA9PT0gY2hvc2VuQWNjb3VudExhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0dldFNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZUxpc3RPclJlcXVlc3Q6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB8IElBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QsIGV4dGVuc2lvbklkOiBzdHJpbmcsIGV4dGVuc2lvbk5hbWU6IHN0cmluZywgb3B0aW9uczogQXV0aGVudGljYXRpb25HZXRTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9IFVSSS5yZXZpdmUob3B0aW9ucy5hdXRob3JpemF0aW9uU2VydmVyKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQsIHNjb3BlTGlzdE9yUmVxdWVzdCwgeyBhY2NvdW50OiBvcHRpb25zLmFjY291bnQsIGF1dGhvcml6YXRpb25TZXJ2ZXIgfSwgdHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblxuXHRcdC8vIEVycm9yIGNhc2VzXG5cdFx0aWYgKG9wdGlvbnMuZm9yY2VOZXdTZXNzaW9uICYmIG9wdGlvbnMuY3JlYXRlSWZOb25lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29tYmluYXRpb24gb2Ygb3B0aW9ucy4gUGxlYXNlIHJlbW92ZSBvbmUgb2YgdGhlIGZvbGxvd2luZzogZm9yY2VOZXdTZXNzaW9uLCBjcmVhdGVJZk5vbmUnKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuZm9yY2VOZXdTZXNzaW9uICYmIG9wdGlvbnMuc2lsZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29tYmluYXRpb24gb2Ygb3B0aW9ucy4gUGxlYXNlIHJlbW92ZSBvbmUgb2YgdGhlIGZvbGxvd2luZzogZm9yY2VOZXdTZXNzaW9uLCBzaWxlbnQnKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuY3JlYXRlSWZOb25lICYmIG9wdGlvbnMuc2lsZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29tYmluYXRpb24gb2Ygb3B0aW9ucy4gUGxlYXNlIHJlbW92ZSBvbmUgb2YgdGhlIGZvbGxvd2luZzogY3JlYXRlSWZOb25lLCBzaWxlbnQnKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5jbGVhclNlc3Npb25QcmVmZXJlbmNlKSB7XG5cdFx0XHQvLyBDbGVhcmluZyB0aGUgc2Vzc2lvbiBwcmVmZXJlbmNlIGlzIHVzdWFsbHkgcGFpcmVkIHdpdGggY3JlYXRlSWZOb25lLCBzbyBqdXN0IHJlbW92ZSB0aGUgcHJlZmVyZW5jZSBhbmRcblx0XHRcdC8vIGRlZmVyIHRvIHRoZSByZXN0IG9mIHRoZSBsb2dpYyBpbiB0aGlzIGZ1bmN0aW9uIHRvIGNob29zZSB0aGUgc2Vzc2lvbi5cblx0XHRcdHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5yZW1vdmVBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZCwgcHJvdmlkZXJJZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hpbmdBY2NvdW50UHJlZmVyZW5jZVNlc3Npb24gPVxuXHRcdFx0Ly8gSWYgYW4gYWNjb3VudCB3YXMgcGFzc2VkIGluLCB0aGF0IHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGUgYWNjb3VudCBwcmVmZXJlbmNlXG5cdFx0XHRvcHRpb25zLmFjY291bnRcblx0XHRcdFx0Ly8gV2Ugb25seSBzdXBwb3J0IG9uZSBzZXNzaW9uIHBlciBhY2NvdW50IHBlciBzZXQgb2Ygc2NvcGVzIHNvIGdyYWIgdGhlIGZpcnN0IG9uZSBoZXJlXG5cdFx0XHRcdD8gc2Vzc2lvbnNbMF1cblx0XHRcdFx0OiB0aGlzLl9nZXRBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZCwgcHJvdmlkZXJJZCwgc2Vzc2lvbnMpO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHNlc3Npb25zIHdlIGhhdmUgYXJlIHZhbGlkXG5cdFx0aWYgKCFvcHRpb25zLmZvcmNlTmV3U2Vzc2lvbiAmJiBzZXNzaW9ucy5sZW5ndGgpIHtcblx0XHRcdC8vIElmIHdlIGhhdmUgYW4gZXhpc3Rpbmcgc2Vzc2lvbiBwcmVmZXJlbmNlLCB1c2UgdGhhdC4gSWYgbm90LCB3ZSdsbCByZXR1cm4gYW55IHZhbGlkIHNlc3Npb24gYXQgdGhlIGVuZCBvZiB0aGlzIGZ1bmN0aW9uLlxuXHRcdFx0aWYgKG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uICYmIHRoaXMuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZChwcm92aWRlcklkLCBtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBleHRlbnNpb25JZCkpIHtcblx0XHRcdFx0cmV0dXJuIG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgd2Ugb25seSBoYXZlIG9uZSBhY2NvdW50IGZvciBhIHNpbmdsZSBhdXRoIHByb3ZpZGVyLCBsZXRzIGp1c3QgY2hlY2sgaWYgaXQncyBhbGxvd2VkIGFuZCByZXR1cm4gaXQgaWYgaXQgaXMuXG5cdFx0XHRpZiAoIXByb3ZpZGVyLnN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cyAmJiB0aGlzLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQocHJvdmlkZXJJZCwgc2Vzc2lvbnNbMF0uYWNjb3VudC5sYWJlbCwgZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uc1swXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXZSBtYXkgbmVlZCB0byBwcm9tcHQgYmVjYXVzZSB3ZSBkb24ndCBoYXZlIGEgdmFsaWQgc2Vzc2lvblxuXHRcdC8vIG1vZGFsIGZsb3dzXG5cdFx0aWYgKG9wdGlvbnMuY3JlYXRlSWZOb25lIHx8IG9wdGlvbnMuZm9yY2VOZXdTZXNzaW9uKSB7XG5cdFx0XHRsZXQgdWlPcHRpb25zOiBBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5mb3JjZU5ld1Nlc3Npb24gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHVpT3B0aW9ucyA9IG9wdGlvbnMuZm9yY2VOZXdTZXNzaW9uO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucy5jcmVhdGVJZk5vbmUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHVpT3B0aW9ucyA9IG9wdGlvbnMuY3JlYXRlSWZOb25lO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBvbmx5IHdhbnQgdG8gc2hvdyB0aGUgXCJyZWNyZWF0aW5nIHNlc3Npb25cIiBwcm9tcHQgaWYgd2UgYXJlIHVzaW5nIGZvcmNlTmV3U2Vzc2lvbiAmIHRoZXJlIGFyZSBzZXNzaW9uc1xuXHRcdFx0Ly8gdGhhdCB3ZSB3aWxsIGJlIFwiZm9yY2luZyB0aHJvdWdoXCIuXG5cdFx0XHRjb25zdCByZWNyZWF0aW5nU2Vzc2lvbiA9ICEhKG9wdGlvbnMuZm9yY2VOZXdTZXNzaW9uICYmIHNlc3Npb25zLmxlbmd0aCk7XG5cdFx0XHRjb25zdCBpc0FsbG93ZWQgPSBhd2FpdCB0aGlzLmxvZ2luUHJvbXB0KHByb3ZpZGVyLCBleHRlbnNpb25OYW1lLCByZWNyZWF0aW5nU2Vzc2lvbiwgdWlPcHRpb25zKTtcblx0XHRcdGlmICghaXNBbGxvd2VkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVXNlciBkaWQgbm90IGNvbnNlbnQgdG8gbG9naW4uJyk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb247XG5cdFx0XHRpZiAoc2Vzc2lvbnM/Lmxlbmd0aCAmJiAhb3B0aW9ucy5mb3JjZU5ld1Nlc3Npb24pIHtcblx0XHRcdFx0c2Vzc2lvbiA9IHByb3ZpZGVyLnN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cyAmJiAhb3B0aW9ucy5hY2NvdW50XG5cdFx0XHRcdFx0PyBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2Uuc2VsZWN0U2Vzc2lvbihwcm92aWRlcklkLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSwgc2NvcGVMaXN0T3JSZXF1ZXN0LCBzZXNzaW9ucylcblx0XHRcdFx0XHQ6IHNlc3Npb25zWzBdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYWNjb3VudFRvQ3JlYXRlOiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50IHwgdW5kZWZpbmVkID0gb3B0aW9ucy5hY2NvdW50ID8/IG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uPy5hY2NvdW50O1xuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24oXG5cdFx0XHRcdFx0XHRwcm92aWRlcklkLFxuXHRcdFx0XHRcdFx0c2NvcGVMaXN0T3JSZXF1ZXN0LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRhY3RpdmF0ZUltbWVkaWF0ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0YWNjb3VudDogYWNjb3VudFRvQ3JlYXRlLFxuXHRcdFx0XHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSB3aGlsZSAoXG5cdFx0XHRcdFx0YWNjb3VudFRvQ3JlYXRlXG5cdFx0XHRcdFx0JiYgYWNjb3VudFRvQ3JlYXRlLmxhYmVsICE9PSBzZXNzaW9uLmFjY291bnQubGFiZWxcblx0XHRcdFx0XHQmJiAhYXdhaXQgdGhpcy5jb250aW51ZVdpdGhJbmNvcnJlY3RBY2NvdW50UHJvbXB0KHNlc3Npb24uYWNjb3VudC5sYWJlbCwgYWNjb3VudFRvQ3JlYXRlLmxhYmVsKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucyhwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIFt7IGlkOiBleHRlbnNpb25JZCwgbmFtZTogZXh0ZW5zaW9uTmFtZSwgYWxsb3dlZDogdHJ1ZSB9XSk7XG5cdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UudXBkYXRlTmV3U2Vzc2lvblJlcXVlc3RzKHByb3ZpZGVySWQsIFtzZXNzaW9uXSk7XG5cdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UudXBkYXRlQWNjb3VudFByZWZlcmVuY2UoZXh0ZW5zaW9uSWQsIHByb3ZpZGVySWQsIHNlc3Npb24uYWNjb3VudCk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHR9XG5cblx0XHQvLyBGb3IgdGhlIHNpbGVudCBmbG93cywgaWYgd2UgZG9uJ3QgaGF2ZSBhIHNlc3Npb24gdGhhdCBtYXRjaGVzIHRoZSBhY2NvdW50IHByZWZlcmVuY2UsIHdlIGNhbiByZXR1cm4gYW55IHZhbGlkIHNlc3Npb24gaWYgdGhlcmUgaXMgb25seSBvbmUgdG8gY2hvb3NlIGZyb20uXG5cdFx0aWYgKCFtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgdmFsaWRTZXNzaW9ucyA9IHNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+IHRoaXMuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZChwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIGV4dGVuc2lvbklkKSk7XG5cdFx0XHRpZiAodmFsaWRTZXNzaW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHZhbGlkU2Vzc2lvbnNbMF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gcGFzc2l2ZSBmbG93cyAoc2lsZW50IG9yIGRlZmF1bHQpXG5cdFx0aWYgKCFvcHRpb25zLnNpbGVudCkge1xuXHRcdFx0Ly8gSWYgdGhlcmUgaXMgYSBwb3RlbnRpYWwgc2Vzc2lvbiwgYnV0IHRoZSBleHRlbnNpb24gZG9lc24ndCBoYXZlIGFjY2VzcyB0byBpdCwgdXNlIHRoZSBcImdyYW50IGFjY2Vzc1wiIGZsb3csXG5cdFx0XHQvLyBvdGhlcndpc2UgcmVxdWVzdCBhIG5ldyBvbmUuXG5cdFx0XHRzZXNzaW9ucy5sZW5ndGhcblx0XHRcdFx0PyB0aGlzLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UucmVxdWVzdFNlc3Npb25BY2Nlc3MocHJvdmlkZXJJZCwgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWUsIHNjb3BlTGlzdE9yUmVxdWVzdCwgc2Vzc2lvbnMpXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLnJlcXVlc3ROZXdTZXNzaW9uKHByb3ZpZGVySWQsIHNjb3BlTGlzdE9yUmVxdWVzdCwgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgJGdldFNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZUxpc3RPclJlcXVlc3Q6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB8IElBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QsIGV4dGVuc2lvbklkOiBzdHJpbmcsIGV4dGVuc2lvbk5hbWU6IHN0cmluZywgb3B0aW9uczogQXV0aGVudGljYXRpb25HZXRTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2NvcGVzID0gaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3Qoc2NvcGVMaXN0T3JSZXF1ZXN0KSA/IHNjb3BlTGlzdE9yUmVxdWVzdC5mYWxsYmFja1Njb3BlcyA6IHNjb3BlTGlzdE9yUmVxdWVzdDtcblx0XHRpZiAoc2NvcGVzKSB7XG5cdFx0XHR0aGlzLnNlbmRDbGllbnRJZFVzYWdlVGVsZW1ldHJ5KGV4dGVuc2lvbklkLCBwcm92aWRlcklkLCBzY29wZXMpO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5kb0dldFNlc3Npb24ocHJvdmlkZXJJZCwgc2NvcGVMaXN0T3JSZXF1ZXN0LCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSwgb3B0aW9ucyk7XG5cblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5zZW5kUHJvdmlkZXJVc2FnZVRlbGVtZXRyeShleHRlbnNpb25JZCwgcHJvdmlkZXJJZCk7XG5cdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIHNlc3Npb24uc2NvcGVzLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRhc3luYyAkZ2V0QWNjb3VudHMocHJvdmlkZXJJZDogc3RyaW5nKTogUHJvbWlzZTxSZWFkb25seUFycmF5PEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQ+PiB7XG5cdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyhwcm92aWRlcklkKTtcblx0XHRyZXR1cm4gYWNjb3VudHM7XG5cdH1cblxuXHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0IHRoaXMgaXMgYSB0ZW1wb3JhcnkgYWRkaXRpb24gdG8gdGVsZW1ldHJ5IHRvIHVuZGVyc3RhbmQgd2hhdCBleHRlbnNpb25zIGFyZSBvdmVycmlkaW5nIHRoZSBjbGllbnQgaWQuXG5cdC8vIFdlIGNhbiB1c2UgdGhpcyB0ZWxlbWV0cnkgdG8gcmVhY2ggb3V0IHRvIHRoZXNlIGV4dGVuc2lvbiBhdXRob3JzIGFuZCBsZXQgdGhlbSBrbm93IHRoYXQgdGhleSBtYW55IG5lZWQgY29uZmlndXJhdGlvbiBjaGFuZ2VzXG5cdC8vIGR1ZSB0byB0aGUgYWRvcHRpb24gb2YgdGhlIE1pY3Jvc29mdCBicm9rZXIuXG5cdC8vIFJlbW92ZSB0aGlzIGluIGEgZmV3IGl0ZXJhdGlvbnMuXG5cdHByaXZhdGUgX3NlbnRDbGllbnRJZFVzYWdlRXZlbnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgc2VuZENsaWVudElkVXNhZ2VUZWxlbWV0cnkoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbnNWU0NvZGVDbGllbnRJZFNjb3BlID0gc2NvcGVzLnNvbWUoc2NvcGUgPT4gc2NvcGUuc3RhcnRzV2l0aCgnVlNDT0RFX0NMSUVOVF9JRDonKSk7XG5cdFx0Y29uc3Qga2V5ID0gYCR7ZXh0ZW5zaW9uSWR9fCR7cHJvdmlkZXJJZH18JHtjb250YWluc1ZTQ29kZUNsaWVudElkU2NvcGV9YDtcblx0XHRpZiAodGhpcy5fc2VudENsaWVudElkVXNhZ2VFdmVudHMuaGFzKGtleSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2VudENsaWVudElkVXNhZ2VFdmVudHMuYWRkKGtleSk7XG5cdFx0aWYgKGNvbnRhaW5zVlNDb2RlQ2xpZW50SWRTY29wZSkge1xuXHRcdFx0dHlwZSBDbGllbnRJZFVzYWdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnVHlsZXJMZW9uaGFyZHQnO1xuXHRcdFx0XHRjb21tZW50OiAnVXNlZCB0byBzZWUgd2hpY2ggZXh0ZW5zaW9ucyBhcmUgdXNpbmcgdGhlIFZTQ29kZSBjbGllbnQgaWQgb3ZlcnJpZGUnO1xuXHRcdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBleHRlbnNpb24gaWQuJyB9O1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgZXh0ZW5zaW9uSWQ6IHN0cmluZyB9LCBDbGllbnRJZFVzYWdlQ2xhc3NpZmljYXRpb24+KCdhdXRoZW50aWNhdGlvbi5jbGllbnRJZFVzYWdlJywgeyBleHRlbnNpb25JZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNlbmRQcm92aWRlclVzYWdlVGVsZW1ldHJ5KGV4dGVuc2lvbklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGAke2V4dGVuc2lvbklkfXwke3Byb3ZpZGVySWR9YDtcblx0XHRpZiAodGhpcy5fc2VudFByb3ZpZGVyVXNhZ2VFdmVudHMuaGFzKGtleSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2VudFByb3ZpZGVyVXNhZ2VFdmVudHMuYWRkKGtleSk7XG5cdFx0dHlwZSBBdXRoUHJvdmlkZXJVc2FnZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdUeWxlckxlb25oYXJkdCc7XG5cdFx0XHRjb21tZW50OiAnVXNlZCB0byBzZWUgd2hpY2ggZXh0ZW5zaW9ucyBhcmUgdXNpbmcgd2hpY2ggcHJvdmlkZXJzJztcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBpZC4nIH07XG5cdFx0XHRwcm92aWRlcklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByb3ZpZGVyIGlkLicgfTtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgZXh0ZW5zaW9uSWQ6IHN0cmluZzsgcHJvdmlkZXJJZDogc3RyaW5nIH0sIEF1dGhQcm92aWRlclVzYWdlQ2xhc3NpZmljYXRpb24+KCdhdXRoZW50aWNhdGlvbi5wcm92aWRlclVzYWdlJywgeyBwcm92aWRlcklkLCBleHRlbnNpb25JZCB9KTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBBY2NvdW50IFByZWZlcmVuY2VzXG5cdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IFVwZGF0ZSB0aGlzIGFmdGVyIGEgZmV3IGl0ZXJhdGlvbnMgdG8gbm8gbG9uZ2VyIGZhbGxiYWNrIHRvIHRoZSBzZXNzaW9uIHByZWZlcmVuY2VcblxuXHRwcml2YXRlIF9nZXRBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcsIHNlc3Npb25zOiBSZWFkb25seUFycmF5PEF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4pOiBBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFjY291bnROYW1lUHJlZmVyZW5jZSA9IHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZCwgcHJvdmlkZXJJZCk7XG5cdFx0aWYgKGFjY291bnROYW1lUHJlZmVyZW5jZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLmFjY291bnQubGFiZWwgPT09IGFjY291bnROYW1lUHJlZmVyZW5jZSk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHQvLyNlbmRyZWdpb25cblxuXHRhc3luYyAkc2hvd0RldmljZUNvZGVNb2RhbCh1c2VyQ29kZTogc3RyaW5nLCB2ZXJpZmljYXRpb25Vcmk6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2RldmljZUNvZGVUaXRsZScsIFwiRGV2aWNlIENvZGUgQXV0aGVudGljYXRpb25cIiksXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnZGV2aWNlQ29kZURldGFpbCcsIFwiWW91ciBjb2RlOiB7MH1cXG5cXG5UbyBjb21wbGV0ZSBhdXRoZW50aWNhdGlvbiwgbmF2aWdhdGUgdG8gezF9IGFuZCBlbnRlciB0aGUgY29kZSBhYm92ZS5cIiwgdXNlckNvZGUsIHZlcmlmaWNhdGlvblVyaSksXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb3B5QW5kQ29udGludWUnLCBcIkNvcHkgJiBDb250aW51ZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0Ly8gT3BlbiB2ZXJpZmljYXRpb24gVVJJXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHVzZXJDb2RlKTtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh2ZXJpZmljYXRpb25VcmkpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ2ZhaWxlZFRvT3BlblVyaScsIFwiRmFpbGVkIHRvIG9wZW4gezB9XCIsIHZlcmlmaWNhdGlvblVyaSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyAkcHJvbXB0Rm9yQ2xpZW50UmVnaXN0cmF0aW9uKGF1dGhvcml6YXRpb25TZXJ2ZXJVcmw6IHN0cmluZyk6IFByb21pc2U8eyBjbGllbnRJZDogc3RyaW5nOyBjbGllbnRTZWNyZXQ/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZGlyZWN0VXJscyA9ICdodHRwOi8vMTI3LjAuMC4xOjMzNDE4XFxuaHR0cHM6Ly92c2NvZGUuZGV2L3JlZGlyZWN0JztcblxuXHRcdC8vIFNob3cgbW9kYWwgZGlhbG9nIGZpcnN0IHRvIGV4cGxhaW4gdGhlIHNpdHVhdGlvbiBhbmQgZ2V0IHVzZXIgY29uc2VudFxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZGNyTm90U3VwcG9ydGVkJywgXCJEeW5hbWljIENsaWVudCBSZWdpc3RyYXRpb24gbm90IHN1cHBvcnRlZFwiKSxcblx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdkY3JOb3RTdXBwb3J0ZWREZXRhaWwnLCBcIlRoZSBhdXRob3JpemF0aW9uIHNlcnZlciAnezB9JyBkb2VzIG5vdCBzdXBwb3J0IGF1dG9tYXRpYyBjbGllbnQgcmVnaXN0cmF0aW9uLiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkIGJ5IG1hbnVhbGx5IHByb3ZpZGluZyBhIGNsaWVudCByZWdpc3RyYXRpb24gKGNsaWVudCBJRCk/XFxuXFxuTm90ZTogV2hlbiByZWdpc3RlcmluZyB5b3VyIE9BdXRoIGFwcGxpY2F0aW9uLCBtYWtlIHN1cmUgdG8gaW5jbHVkZSB0aGVzZSByZWRpcmVjdCBVUklzOlxcbnsxfVwiLCBhdXRob3JpemF0aW9uU2VydmVyVXJsLCByZWRpcmVjdFVybHMpLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZGNyQ29weVVybHNBbmRQcm9jZWVkJywgXCJDb3B5IFVSSXMgJiBQcm9jZWVkXCIpLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChyZWRpcmVjdFVybHMpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnZGNyRmFpbGVkVG9Db3B5JywgXCJGYWlsZWQgdG8gY29weSByZWRpcmVjdCBVUklzIHRvIGNsaXBib2FyZC5cIikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hhcmVkVGl0bGUgPSBubHMubG9jYWxpemUoJ2FkZENsaWVudFJlZ2lzdHJhdGlvbkRldGFpbHMnLCBcIkFkZCBDbGllbnQgUmVnaXN0cmF0aW9uIERldGFpbHNcIik7XG5cblx0XHRjb25zdCBjbGllbnRJZCA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IHNoYXJlZFRpdGxlLFxuXHRcdFx0cHJvbXB0OiBubHMubG9jYWxpemUoJ2NsaWVudElkUHJvbXB0JywgXCJFbnRlciBhbiBleGlzdGluZyBjbGllbnQgSUQgdGhhdCBoYXMgYmVlbiByZWdpc3RlcmVkIHdpdGggdGhlIGZvbGxvd2luZyByZWRpcmVjdCBVUklzOiBodHRwOi8vMTI3LjAuMC4xOjMzNDE4LCBodHRwczovL3ZzY29kZS5kZXYvcmVkaXJlY3RcIiksXG5cdFx0XHRwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdjbGllbnRJZFBsYWNlaG9sZGVyJywgXCJPQXV0aCBjbGllbnQgSUQgKGF6eWUzOWQuLi4pXCIpLFxuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdFx0dmFsaWRhdGVJbnB1dDogYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKCF2YWx1ZSB8fCB2YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY2xpZW50SWRSZXF1aXJlZCcsIFwiQ2xpZW50IElEIGlzIHJlcXVpcmVkXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIWNsaWVudElkIHx8IGNsaWVudElkLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xpZW50U2VjcmV0ID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR0aXRsZTogc2hhcmVkVGl0bGUsXG5cdFx0XHRwcm9tcHQ6IG5scy5sb2NhbGl6ZSgnY2xpZW50U2VjcmV0UHJvbXB0JywgXCIob3B0aW9uYWwpIEVudGVyIGFuIGV4aXN0aW5nIGNsaWVudCBzZWNyZXQgYXNzb2NpYXRlZCB3aXRoIHRoZSBjbGllbnQgaWQgJ3swfScgb3IgbGVhdmUgdGhpcyBmaWVsZCBibGFua1wiLCBjbGllbnRJZCksXG5cdFx0XHRwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdjbGllbnRTZWNyZXRQbGFjZWhvbGRlcicsIFwiT0F1dGggY2xpZW50IHNlY3JldCAod2VyMzJvNTBmLi4uKSBvciBsZWF2ZSBpdCBibGFua1wiKSxcblx0XHRcdHBhc3N3b3JkOiB0cnVlLFxuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xpZW50SWQ6IGNsaWVudElkLnRyaW0oKSxcblx0XHRcdGNsaWVudFNlY3JldDogY2xpZW50U2VjcmV0Py50cmltKCkgfHwgdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jICRwcm9tcHRGb3JSZXNvdXJjZUNsaWVudFNlY3JldChyZXNvdXJjZUNsaWVudElkOiBzdHJpbmcsIHJlc291cmNlOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFN1cmZhY2UgdG8gdGhlIHVzZXIgdGhhdCB3aGF0ZXZlciB0aGV5IGVudGVyIChpbmNsdWRpbmcgYmxhbmsgPT0gbm9uZSkgd2lsbCBiZSByZW1lbWJlcmVkXG5cdFx0Ly8gaW4gT1Mgc2VjcmV0IHN0b3JhZ2UsIHNjb3BlZCB0byB0aGUgTUNQIHNlcnZlciBVUkwgKyB0aGUgcmVzb3VyY2UgY2xpZW50X2lkLiBUaGlzIG1lYW5zOlxuXHRcdC8vICAgLSB0aGUgY29kZWxlbnMgYWJvdmUgYG9hdXRoLmNsaWVudElkYCBpbiBtY3AuanNvbiB3aWxsIGZsaXAgdG8gXCJSZXBsYWNlIENsaWVudCBTZWNyZXRcIlxuXHRcdC8vICAgLSBzdWJzZXF1ZW50IHJ1bnMgcmVhZCB0aGUgc2VjcmV0IGRpcmVjdGx5IGZyb20gc3RvcmFnZSBhbmQgbmV2ZXIgcmUtcHJvbXB0LlxuXHRcdC8vXG5cdFx0Ly8gUmV0dXJuIGNvbnRyYWN0OlxuXHRcdC8vICAgLSBgdW5kZWZpbmVkYCBcdTIwMTQgdXNlciBwcmVzc2VkIEVzY2FwZSAoY2FuY2VsbGVkKS4gQ2FsbGVyIHNob3VsZCBOT1QgY2FjaGU7IHJlLXByb21wdCBhbGxvd2VkLlxuXHRcdC8vICAgLSBgJydgIChlbXB0eSBzdHJpbmcpIFx1MjAxNCB1c2VyIHByZXNzZWQgRW50ZXIgd2l0aCBibGFuayBpbnB1dCAoXCJubyBzZWNyZXRcIikuIENhbGxlciBTSE9VTERcblx0XHQvLyAgICAgY2FjaGUgdGhpcyBhcyBhbiBleHBsaWNpdCBhbnN3ZXIgKHB1YmxpYyBjbGllbnQgLyB0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZD1ub25lKS5cblx0XHQvLyAgIC0gYCd2YWx1ZSdgIFx1MjAxNCB1c2VyIHN1cHBsaWVkIGEgc2VjcmV0LlxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd4YWFSZXNvdXJjZVNlY3JldFRpdGxlJywgXCJSZXNvdXJjZSBDbGllbnQgU2VjcmV0IFJlcXVpcmVkXCIpLFxuXHRcdFx0cHJvbXB0OiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCd4YWFSZXNvdXJjZVNlY3JldFByb21wdCcsXG5cdFx0XHRcdFwiVGhlIHJlc291cmNlIGF0ICd7MH0nIHVzZXMgYSBwZXItcmVzb3VyY2UgY2xpZW50IGlkZW50aWZpZXIgJ3sxfScuIEVudGVyIHRoZSBtYXRjaGluZyBjbGllbnQgc2VjcmV0IChsZWF2ZSBibGFuayBpZiBub25lKS4gVGhlIHZhbHVlIGlzIHNhdmVkIGluIE9TIHNlY3JldCBzdG9yYWdlOyBtYW5hZ2UgaXQgbGF0ZXIgdmlhIHRoZSAnU2V0IENsaWVudCBTZWNyZXQnIGNvZGUgbGVucyBpbiBtY3AuanNvbi5cIixcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHJlc291cmNlQ2xpZW50SWQsXG5cdFx0XHQpLFxuXHRcdFx0cGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgneGFhUmVzb3VyY2VTZWNyZXRQbGFjZWhvbGRlcicsIFwiUmVzb3VyY2UgY2xpZW50IHNlY3JldFwiKSxcblx0XHRcdHBhc3N3b3JkOiB0cnVlLFxuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdH0pO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBVc2VyIGNhbmNlbGxlZCAoRXNjYXBlKS4gRG9uJ3QgcGVyc2lzdCBhbnl0aGluZy5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG5cdFx0Y29uc3Qga2V5ID0gbWNwT0F1dGhDbGllbnRTZWNyZXRTdG9yYWdlS2V5KHJlc291cmNlLCByZXNvdXJjZUNsaWVudElkKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRyaW1tZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIEJsYW5rLW9uLWNvbmZpcm0gbWVhbnMgXCJubyBjbGllbnQgc2VjcmV0XCIgKGUuZy4gdG9rZW5fZW5kcG9pbnRfYXV0aF9tZXRob2Q9bm9uZSkuXG5cdFx0XHRcdC8vIENsZWFyIGFueSBzdGFsZSB2YWx1ZSBzbyBzdWJzZXF1ZW50IHByb21wdHMgY2FuIHN0aWxsIGNhcHR1cmUgYSBmcmVzaCBzZWNyZXQgaWYgbmVlZGVkLlxuXHRcdFx0XHRhd2FpdCB0aGlzLnNlY3JldFN0b3JhZ2VTZXJ2aWNlLmRlbGV0ZShrZXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZWNyZXRTdG9yYWdlU2VydmljZS5zZXQoa2V5LCB0cmltbWVkKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbWEFBXSBGYWlsZWQgdG8gcGVyc2lzdCByZXNvdXJjZSBjbGllbnQgc2VjcmV0IGZvciAke3Jlc291cmNlfSAvICR7cmVzb3VyY2VDbGllbnRJZH06ICR7KGVyciBhcyBFcnJvcikubWVzc2FnZX1gKTtcblx0XHR9XG5cdFx0Ly8gRGlzdGluY3QgZnJvbSBjYW5jZWw6IHJldHVybiAnJyAobm90IHVuZGVmaW5lZCkgZm9yIGJsYW5rLW9uLWNvbmZpcm0gc28gY2FsbGVycyBjYW5cblx0XHQvLyBwcm9jZWVkIHdpdGhvdXQgYSBjbGllbnQgc2VjcmV0IGluc3RlYWQgb2YgdHJlYXRpbmcgaXQgYXMgYSBjYW5jZWwuXG5cdFx0cmV0dXJuIHRyaW1tZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHFCQUFxQjtBQUMxQyxZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBNkM7QUFDdEQsU0FBbUUsb0NBQTZELHdCQUF3QixrQ0FBdUcsOENBQWdIO0FBQy9XLFNBQXFDLGdCQUF1RyxtQkFBa0Q7QUFDOUwsU0FBUyxzQkFBcUM7QUFDOUMsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsZ0RBQWdEO0FBQ3pELFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0Is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
