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
import { distinct } from "../../../../base/common/arrays.js";
import { Barrier, RunOnceScheduler, ThrottledDelayer, timeout } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { equals } from "../../../../base/common/objects.js";
import { isWeb } from "../../../../base/common/platform.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { localize2 } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asJson, IRequestService, isClientError, isSuccess, readHeader, retryAfterFromHeaders } from "../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { IAuthenticationExtensionsService, IAuthenticationService } from "../../authentication/common/authentication.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IHostService } from "../../host/browser/host.js";
import { adaptManagedSettings } from "./managedSettings.js";
const DEFAULT_ACCOUNT_SIGN_IN_COMMAND = "workbench.actions.accounts.signIn";
var DefaultAccountStatus = /* @__PURE__ */ ((DefaultAccountStatus2) => {
  DefaultAccountStatus2["Uninitialized"] = "uninitialized";
  DefaultAccountStatus2["Unavailable"] = "unavailable";
  DefaultAccountStatus2["Available"] = "available";
  return DefaultAccountStatus2;
})(DefaultAccountStatus || {});
const CONTEXT_DEFAULT_ACCOUNT_STATE = new RawContextKey("defaultAccountStatus", "uninitialized" /* Uninitialized */);
const CACHED_POLICY_DATA_KEY = "defaultAccount.cachedPolicyData";
const ACCOUNT_DATA_POLL_INTERVAL_MS = 60 * 60 * 1e3;
const MANAGED_SETTINGS_REQUEST_TIMEOUT_MS = 5e3;
function toDefaultAccountConfig(defaultChatAgent) {
  return {
    preferredExtensions: [
      defaultChatAgent.chatExtensionId,
      defaultChatAgent.extensionId
    ],
    authenticationProvider: {
      default: {
        id: defaultChatAgent.provider.default.id,
        name: defaultChatAgent.provider.default.name
      },
      enterprise: {
        id: defaultChatAgent.provider.enterprise.id,
        name: defaultChatAgent.provider.enterprise.name
      },
      enterpriseProviderConfig: `${defaultChatAgent.completionsAdvancedSetting}.authProvider`,
      enterpriseProviderUriSetting: defaultChatAgent.providerUriSetting,
      scopes: defaultChatAgent.providerScopes
    },
    entitlementUrl: defaultChatAgent.entitlementUrl,
    tokenEntitlementUrl: defaultChatAgent.tokenEntitlementUrl,
    mcpRegistryDataUrl: defaultChatAgent.mcpRegistryDataUrl,
    managedSettingsUrl: defaultChatAgent.managedSettingsUrl
  };
}
let DefaultAccountService = class extends Disposable {
  constructor(productService) {
    super();
    this.defaultAccount = null;
    this.initBarrier = new Barrier();
    this._onDidChangeDefaultAccount = this._register(new Emitter());
    this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
    this._onDidChangePolicyData = this._register(new Emitter());
    this.onDidChangePolicyData = this._onDidChangePolicyData.event;
    this._onDidChangeCopilotTokenInfo = this._register(new Emitter());
    this.onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;
    this.defaultAccountProvider = null;
    this.defaultAccountConfig = toDefaultAccountConfig(productService.defaultChatAgent);
  }
  get currentDefaultAccount() {
    return this.defaultAccount;
  }
  get policyData() {
    return this.defaultAccountProvider?.policyData ?? null;
  }
  get copilotTokenInfo() {
    return this.defaultAccountProvider?.copilotTokenInfo ?? null;
  }
  get managedSettingsFetchStatus() {
    return this.defaultAccountProvider?.managedSettingsFetchStatus ?? null;
  }
  get managedSettingsFetchedAt() {
    return this.defaultAccountProvider?.managedSettingsFetchedAt ?? null;
  }
  get managedSettingsRawResponse() {
    return this.defaultAccountProvider?.managedSettingsRawResponse ?? null;
  }
  async getDefaultAccount() {
    await this.initBarrier.wait();
    return this.defaultAccount;
  }
  getDefaultAccountAuthenticationProvider() {
    if (this.defaultAccountProvider) {
      return this.defaultAccountProvider.getDefaultAccountAuthenticationProvider();
    }
    return {
      ...this.defaultAccountConfig.authenticationProvider.default,
      enterprise: false
    };
  }
  setDefaultAccountProvider(provider) {
    if (this.defaultAccountProvider) {
      throw new Error("Default account provider is already set");
    }
    this.defaultAccountProvider = provider;
    if (this.defaultAccountProvider.policyData) {
      this._onDidChangePolicyData.fire(this.defaultAccountProvider.policyData);
    }
    provider.refresh().then((account) => {
      this.defaultAccount = account;
    }).finally(() => {
      this.initBarrier.open();
      this._register(provider.onDidChangeDefaultAccount((account) => this.setDefaultAccount(account)));
      this._register(provider.onDidChangePolicyData((policyData) => this._onDidChangePolicyData.fire(policyData)));
      this._register(provider.onDidChangeCopilotTokenInfo((tokenInfo) => this._onDidChangeCopilotTokenInfo.fire(tokenInfo)));
    });
  }
  async refresh(options) {
    await this.initBarrier.wait();
    const account = await this.defaultAccountProvider?.refresh(options);
    this.setDefaultAccount(account ?? null);
    return this.defaultAccount;
  }
  async signIn(options) {
    await this.initBarrier.wait();
    return this.defaultAccountProvider?.signIn(options) ?? null;
  }
  async signOut() {
    await this.initBarrier.wait();
    await this.defaultAccountProvider?.signOut();
  }
  resolveGitHubUrl(path) {
    if (this.defaultAccountProvider) {
      return this.defaultAccountProvider.resolveGitHubUrl(path);
    }
    return `https://github.com/${path}`;
  }
  setDefaultAccount(account) {
    if (equals(this.defaultAccount, account)) {
      return;
    }
    this.defaultAccount = account;
    this._onDidChangeDefaultAccount.fire(this.defaultAccount);
  }
};
DefaultAccountService = __decorateClass([
  __decorateParam(0, IProductService)
], DefaultAccountService);
let DefaultAccountProvider = class extends Disposable {
  constructor(defaultAccountConfig, configurationService, authenticationService, authenticationExtensionsService, telemetryService, extensionService, requestService, logService, environmentService, contextKeyService, storageService, hostService, commandService) {
    super();
    this.defaultAccountConfig = defaultAccountConfig;
    this.configurationService = configurationService;
    this.authenticationService = authenticationService;
    this.authenticationExtensionsService = authenticationExtensionsService;
    this.telemetryService = telemetryService;
    this.extensionService = extensionService;
    this.requestService = requestService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.hostService = hostService;
    this.commandService = commandService;
    this._defaultAccount = null;
    this._policyData = null;
    this._copilotTokenInfo = null;
    this._managedSettingsFetchStatus = null;
    this._managedSettingsRawResponse = null;
    this._onDidChangeDefaultAccount = this._register(new Emitter());
    this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
    this._onDidChangePolicyData = this._register(new Emitter());
    this.onDidChangePolicyData = this._onDidChangePolicyData.event;
    this._onDidChangeCopilotTokenInfo = this._register(new Emitter());
    this.onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;
    this.initialized = false;
    this.updateThrottler = this._register(new ThrottledDelayer(100));
    this.accountDataPollScheduler = this._register(new RunOnceScheduler(() => this.refetchDefaultAccount(), ACCOUNT_DATA_POLL_INTERVAL_MS));
    this._rateLimitBackoffUntil = 0;
    this.accountStatusContext = CONTEXT_DEFAULT_ACCOUNT_STATE.bindTo(contextKeyService);
    const cachedAccountData = this.getCachedAccountData();
    this._policyData = cachedAccountData?.accountPolicyData ?? null;
    this._copilotTokenInfo = cachedAccountData?.copilotTokenInfo ?? null;
    this.initPromise = this.init().finally(() => {
      this.telemetryService.publicLog2("defaultaccount:status", { status: this.defaultAccount ? "available" : "unavailable", initial: true });
      this.initialized = true;
    });
  }
  get defaultAccount() {
    return this._defaultAccount?.defaultAccount ?? null;
  }
  get policyData() {
    return this._policyData?.policyData ?? null;
  }
  get copilotTokenInfo() {
    return this._copilotTokenInfo;
  }
  get managedSettingsFetchStatus() {
    return this._managedSettingsFetchStatus;
  }
  get managedSettingsFetchedAt() {
    return this._policyData?.managedSettingsFetchedAt ?? null;
  }
  get managedSettingsRawResponse() {
    return this._managedSettingsRawResponse;
  }
  getCachedAccountData() {
    const cached = this.storageService.get(CACHED_POLICY_DATA_KEY, StorageScope.APPLICATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const { accountId, policyData, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt, copilotTokenInfo } = parsed;
        if (accountId && policyData) {
          this.logService.debug("[DefaultAccount] Initializing with cached policy data (migrating old format)");
          const result = { accountPolicyData: { accountId, policyData, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt }, copilotTokenInfo };
          this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(result), StorageScope.APPLICATION, StorageTarget.MACHINE);
          return result;
        }
        const { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo } = parsed;
        if (accountPolicyData?.accountId && accountPolicyData?.policyData) {
          this.logService.debug("[DefaultAccount] Initializing with cached policy data");
          return { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo };
        }
      } catch (error) {
        this.logService.error("[DefaultAccount] Failed to parse cached policy data", getErrorMessage(error));
      }
    }
    return null;
  }
  async init() {
    if (isWeb && !this.environmentService.remoteAuthority && !this.environmentService.isSessionsWindow) {
      this.logService.debug("[DefaultAccount] Running in web without remote, skipping initialization");
      return;
    }
    await this.whenDefaultAccountAuthenticationProviderAvailable();
    this.logService.debug("[DefaultAccount] Starting initialization");
    await this.doUpdateDefaultAccount();
    this.logService.debug("[DefaultAccount] Initialization complete");
    this._register(this.onDidChangeDefaultAccount((account) => {
      this.telemetryService.publicLog2("defaultaccount:status", { status: account ? "available" : "unavailable", initial: false });
    }));
    this._register(this.authenticationService.onDidChangeSessions((e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.providerId !== defaultAccountProvider.id) {
        return;
      }
      if (this.defaultAccount && e.event.removed?.some((session) => session.id === this.defaultAccount?.sessionId)) {
        this.setDefaultAccount(null);
      } else {
        this.logService.debug("[DefaultAccount] Sessions changed for default account provider, updating default account");
        this.updateDefaultAccount();
      }
    }));
    this._register(this.authenticationExtensionsService.onDidChangeAccountPreference(async (e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.providerId !== defaultAccountProvider.id) {
        return;
      }
      this.logService.debug("[DefaultAccount] Account preference changed for default account provider, updating default account");
      this.updateDefaultAccount();
    }));
    this._register(this.authenticationService.onDidRegisterAuthenticationProvider((e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.id !== defaultAccountProvider.id) {
        return;
      }
      this.logService.debug("[DefaultAccount] Default account provider registered, updating default account");
      this.updateDefaultAccount();
    }));
    this._register(this.authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.id !== defaultAccountProvider.id) {
        return;
      }
      this.logService.debug("[DefaultAccount] Default account provider unregistered, updating default account");
      this.updateDefaultAccount();
    }));
    this._register(this.hostService.onDidChangeFocus((focused) => {
      if (focused) {
        this.refetchDefaultAccount();
      }
    }));
  }
  async whenDefaultAccountAuthenticationProviderAvailable() {
    const provider = this.getDefaultAccountAuthenticationProvider();
    this.logService.debug("[DefaultAccount] Waiting for default account authentication provider to be available.");
    const disposables = new DisposableStore();
    try {
      await new Promise((resolve) => {
        if (this.isAccountProviderAvailable(provider)) {
          this.logService.debug("[DefaultAccount] Default account authentication provider is now available.");
          resolve();
          return;
        }
        disposables.add(Event.any(this.authenticationService.onDidChangeDeclaredProviders, this.authenticationService.onDidRegisterAuthenticationProvider)(() => {
          if (this.isAccountProviderAvailable(provider)) {
            this.logService.debug("[DefaultAccount] Default account authentication provider is now available.");
            resolve();
          }
        }));
        if (this.environmentService.remoteAuthority) {
          void this.authenticationService.getSessions(provider.id, void 0, {}, true);
        }
        this.extensionService.whenInstalledExtensionsRegistered().then(() => {
          disposables.dispose();
          this.logService.debug("[DefaultAccount] Installed extensions registered.");
          resolve();
        }, (error) => {
          this.logService.error("[DefaultAccount] Error while waiting for installed extensions to be registered", getErrorMessage(error));
          resolve();
        });
      });
    } finally {
      disposables.dispose();
    }
  }
  async refresh(options) {
    if (!this.initialized) {
      await this.initPromise;
      return this.defaultAccount;
    }
    this.logService.debug("[DefaultAccount] Refreshing default account");
    await this.updateDefaultAccount(options);
    return this.defaultAccount;
  }
  async refetchDefaultAccount() {
    if (this.accountDataPollScheduler.isScheduled()) {
      this.accountDataPollScheduler.cancel();
    }
    if (!this.hostService.hasFocus || !this._defaultAccount) {
      this.scheduleAccountDataPoll();
      this.logService.debug("[DefaultAccount] Skipping refetching default account. Host is not focused or default account is not set");
      return;
    }
    this.logService.debug("[DefaultAccount] Refetching default account");
    await this.updateDefaultAccount();
  }
  async updateDefaultAccount(options) {
    await this.updateThrottler.trigger(() => this.doUpdateDefaultAccount(options));
  }
  async doUpdateDefaultAccount(options) {
    try {
      const defaultAccount = await this.fetchDefaultAccount(options);
      this.setDefaultAccount(defaultAccount);
      this.scheduleAccountDataPoll();
    } catch (error) {
      this.logService.error("[DefaultAccount] Error while updating default account", getErrorMessage(error));
    }
  }
  async fetchDefaultAccount(options) {
    const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
    this.logService.debug("[DefaultAccount] Default account provider ID:", defaultAccountProvider.id);
    if (!this.isAccountProviderAvailable(defaultAccountProvider)) {
      this.logService.info(`[DefaultAccount] Authentication provider is not available.`, defaultAccountProvider);
      return null;
    }
    return await this.getDefaultAccountForAuthenticationProvider(defaultAccountProvider, options);
  }
  isAccountProviderAvailable(accountProvider) {
    return this.authenticationService.declaredProviders.some((p) => p.id === accountProvider.id) || this.authenticationService.isAuthenticationProviderRegistered(accountProvider.id);
  }
  setDefaultAccount(account) {
    if (equals(this._defaultAccount, account)) {
      return;
    }
    this.logService.trace("[DefaultAccount] Updating default account:", account);
    if (account) {
      this._defaultAccount = account;
      this.setCopilotTokenInfo(account.copilotTokenInfo);
      this.setPolicyData(account.policyData);
      this._onDidChangeDefaultAccount.fire(this._defaultAccount.defaultAccount);
      this.accountStatusContext.set("available" /* Available */);
      this.logService.debug("[DefaultAccount] Account status set to Available");
    } else {
      this._defaultAccount = null;
      this.setPolicyData(null);
      this.setCopilotTokenInfo(null);
      this._onDidChangeDefaultAccount.fire(null);
      this.accountDataPollScheduler.cancel();
      this.accountStatusContext.set("unavailable" /* Unavailable */);
      this.logService.debug("[DefaultAccount] Account status set to Unavailable");
    }
  }
  setPolicyData(accountPolicyData) {
    if (equals(this._policyData, accountPolicyData)) {
      return;
    }
    this._policyData = accountPolicyData;
    this.cachePolicyData(accountPolicyData);
    this._onDidChangePolicyData.fire(this._policyData?.policyData ?? null);
  }
  setCopilotTokenInfo(copilotTokenInfo) {
    if (equals(this._copilotTokenInfo, copilotTokenInfo)) {
      return;
    }
    this._copilotTokenInfo = copilotTokenInfo;
    this._onDidChangeCopilotTokenInfo.fire(this._copilotTokenInfo);
  }
  cachePolicyData(accountPolicyData) {
    if (accountPolicyData) {
      this.logService.debug("[DefaultAccount] Caching policy data for account:", accountPolicyData.accountId);
      const cachedAccountData = {
        accountPolicyData,
        copilotTokenInfo: this._copilotTokenInfo ?? void 0
      };
      this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(cachedAccountData), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.logService.debug("[DefaultAccount] Removing cached policy data");
      this.storageService.remove(CACHED_POLICY_DATA_KEY, StorageScope.APPLICATION);
    }
  }
  scheduleAccountDataPoll() {
    if (!this._defaultAccount) {
      return;
    }
    this.accountDataPollScheduler.schedule(ACCOUNT_DATA_POLL_INTERVAL_MS);
  }
  extractFromToken(token) {
    const result = /* @__PURE__ */ new Map();
    const firstPart = token?.split(":")[0];
    const fields = firstPart?.split(";");
    for (const field of fields) {
      const [key, value] = field.split("=");
      result.set(key, value);
    }
    this.logService.debug(`[DefaultAccount] extractFromToken: ${JSON.stringify(Object.fromEntries(result))}`);
    return result;
  }
  async getDefaultAccountForAuthenticationProvider(authenticationProvider, options) {
    try {
      this.logService.debug("[DefaultAccount] Getting Default Account from authenticated sessions for provider:", authenticationProvider.id);
      const sessions = await this.findMatchingProviderSession(authenticationProvider.id, this.defaultAccountConfig.authenticationProvider.scopes);
      if (!sessions?.length) {
        this.logService.debug("[DefaultAccount] No matching session found for provider:", authenticationProvider.id);
        return null;
      }
      return this.getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions, options);
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to get default account for provider:", authenticationProvider.id, getErrorMessage(error));
      return null;
    }
  }
  async getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions, options) {
    try {
      const accountId = sessions[0].account.id;
      const accountPolicyData = this._policyData?.accountId === accountId ? this._policyData : void 0;
      const entitlementsResult = await this.getEntitlements(sessions, accountPolicyData, options);
      const entitlementsData = entitlementsResult?.data;
      const entitlementsFetchedAt = entitlementsResult?.fetchedAt;
      const [tokenEntitlementsResult, managedSettingsResult] = entitlementsData?.chat_enabled ? await Promise.all([
        this.getTokenEntitlements(sessions, accountPolicyData, options),
        this.getManagedSettings(sessions, accountPolicyData, options)
      ]) : [void 0, void 0];
      const tokenEntitlementsFetchedAt = tokenEntitlementsResult?.fetchedAt;
      const managedSettingsFetchedAt = managedSettingsResult?.fetchedAt;
      let mcpRegistryDataFetchedAt;
      let policyData = accountPolicyData?.policyData ? { ...accountPolicyData.policyData } : void 0;
      if (entitlementsData) {
        policyData = policyData ?? {};
        policyData.cloud_session_storage_enabled = entitlementsData.cloud_session_storage_enabled;
      }
      if (tokenEntitlementsResult?.data) {
        const tokenEntitlementsData = tokenEntitlementsResult.data;
        policyData = policyData ?? {};
        policyData.chat_agent_enabled = tokenEntitlementsData.policyData.chat_agent_enabled;
        policyData.chat_preview_features_enabled = tokenEntitlementsData.policyData.chat_preview_features_enabled;
        policyData.mcp = tokenEntitlementsData.policyData.mcp;
        if (policyData.mcp) {
          const mcpRegistryResult = await this.getMcpRegistryProvider(sessions, accountPolicyData, options);
          mcpRegistryDataFetchedAt = mcpRegistryResult?.fetchedAt;
          policyData.mcpRegistryUrl = mcpRegistryResult?.data?.url;
          policyData.mcpAccess = mcpRegistryResult?.data?.registry_access;
        } else {
          policyData.mcpRegistryUrl = void 0;
          policyData.mcpAccess = void 0;
        }
      }
      if (managedSettingsResult?.data) {
        policyData = { ...policyData ?? {}, ...managedSettingsResult.data };
      }
      const defaultAccount = {
        authenticationProvider,
        accountName: sessions[0].account.label,
        sessionId: sessions[0].id,
        enterprise: authenticationProvider.enterprise || sessions[0].account.label.includes("_"),
        entitlementsData
      };
      this.logService.debug("[DefaultAccount] Successfully created default account for provider:", authenticationProvider.id);
      const accountPolicyResult = policyData || entitlementsFetchedAt ? { accountId, policyData: policyData ?? {}, entitlementsFetchedAt, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt, managedSettingsFetchedAt } : null;
      return {
        defaultAccount,
        accountId,
        policyData: accountPolicyResult,
        copilotTokenInfo: tokenEntitlementsResult?.data?.copilotTokenInfo ?? null
      };
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to create default account for provider:", authenticationProvider.id, getErrorMessage(error));
      return null;
    }
  }
  async findMatchingProviderSession(authProviderId, allScopes) {
    const sessions = await this.getSessions(authProviderId);
    const matchingSessions = [];
    for (const session of sessions) {
      this.logService.debug("[DefaultAccount] Checking session with scopes", session.scopes);
      for (const scopes of allScopes) {
        if (this.scopesMatch(session.scopes, scopes)) {
          matchingSessions.push(session);
        }
      }
    }
    return matchingSessions.length > 0 ? matchingSessions : void 0;
  }
  async getSessions(authProviderId) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        let preferredAccount;
        let preferredAccountName;
        for (const preferredExtension of this.defaultAccountConfig.preferredExtensions) {
          preferredAccountName = this.authenticationExtensionsService.getAccountPreference(preferredExtension, authProviderId);
          if (preferredAccountName) {
            break;
          }
        }
        for (const account of await this.authenticationService.getAccounts(authProviderId)) {
          if (account.label === preferredAccountName) {
            preferredAccount = account;
            break;
          }
        }
        return await this.authenticationService.getSessions(authProviderId, void 0, { account: preferredAccount }, true);
      } catch (error) {
        this.logService.warn(`[DefaultAccount] Attempt ${attempt} to get sessions failed:`, getErrorMessage(error));
        if (attempt === 3) {
          throw error;
        }
        await timeout(500);
      }
    }
    throw new Error("Unable to get sessions after multiple attempts");
  }
  scopesMatch(scopes, expectedScopes) {
    return expectedScopes.every((scope) => scopes.includes(scope));
  }
  async getTokenEntitlements(sessions, accountPolicyData, options) {
    if (!options?.forceRefresh && accountPolicyData?.tokenEntitlementsFetchedAt && !this.isDataStale(accountPolicyData.tokenEntitlementsFetchedAt)) {
      this.logService.debug("[DefaultAccount] Using last fetched token entitlements data");
      return { data: { policyData: accountPolicyData.policyData, copilotTokenInfo: this._copilotTokenInfo ?? {} }, fetchedAt: accountPolicyData.tokenEntitlementsFetchedAt };
    }
    const data = await this.requestTokenEntitlements(sessions);
    return { data, fetchedAt: Date.now() };
  }
  async requestTokenEntitlements(sessions) {
    const tokenEntitlementsUrl = this.getTokenEntitlementUrl();
    if (!tokenEntitlementsUrl) {
      this.logService.debug("[DefaultAccount] No token entitlements URL found");
      return void 0;
    }
    this.logService.debug("[DefaultAccount] Fetching token entitlements from:", tokenEntitlementsUrl);
    const response = await this.request(tokenEntitlementsUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.tokenEntitlements");
    if (!response) {
      return void 0;
    }
    if (response.res.statusCode && response.res.statusCode !== 200) {
      this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching token entitlements`);
      return void 0;
    }
    try {
      const chatData = await asJson(response);
      if (chatData) {
        const tokenMap = this.extractFromToken(chatData.token);
        return {
          policyData: {
            // Editor preview features are disabled if the flag is present and set to 0
            chat_preview_features_enabled: tokenMap.get("editor_preview_features") !== "0",
            chat_agent_enabled: tokenMap.get("agent_mode") !== "0",
            // MCP is only enabled if the flag is explicitly present and set to 1
            mcp: tokenMap.get("mcp") === "1"
          },
          copilotTokenInfo: {
            sn: tokenMap.get("sn"),
            fcv1: tokenMap.get("fcv1")
          }
        };
      }
      this.logService.error("Failed to fetch token entitlements", "No data returned");
    } catch (error) {
      this.logService.error("Failed to fetch token entitlements", getErrorMessage(error));
    }
    return void 0;
  }
  async getEntitlements(sessions, accountPolicyData, options) {
    const accountId = sessions[0].account.id;
    const existingData = this._defaultAccount?.accountId === accountId ? this._defaultAccount?.defaultAccount.entitlementsData : void 0;
    if (!options?.forceRefresh && existingData && accountPolicyData?.entitlementsFetchedAt && !this.isDataStale(accountPolicyData.entitlementsFetchedAt)) {
      this.logService.debug("[DefaultAccount] Using last fetched entitlements data");
      return { data: existingData, fetchedAt: accountPolicyData.entitlementsFetchedAt };
    }
    const entitlementUrl = this.getEntitlementUrl();
    if (!entitlementUrl) {
      this.logService.debug("[DefaultAccount] No chat entitlements URL found");
      return { data: void 0, fetchedAt: void 0 };
    }
    this.logService.debug("[DefaultAccount] Fetching entitlements from:", entitlementUrl);
    const response = await this.request(entitlementUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.entitlements");
    if (!response) {
      return { data: void 0, fetchedAt: Date.now() };
    }
    if (response.res.statusCode && response.res.statusCode !== 200) {
      this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching entitlements`);
      const data = response.res.statusCode === 401 || // oauth token being unavailable (expired/revoked)
      response.res.statusCode === 404 ? null : void 0;
      return { data, fetchedAt: Date.now() };
    }
    try {
      const data = await asJson(response);
      if (data) {
        return { data, fetchedAt: Date.now() };
      }
      this.logService.error("[DefaultAccount] Failed to fetch entitlements", "No data returned");
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to fetch entitlements", getErrorMessage(error));
    }
    return { data: void 0, fetchedAt: Date.now() };
  }
  async getMcpRegistryProvider(sessions, accountPolicyData, options) {
    if (!options?.forceRefresh && accountPolicyData?.mcpRegistryDataFetchedAt && !this.isDataStale(accountPolicyData.mcpRegistryDataFetchedAt)) {
      this.logService.debug("[DefaultAccount] Using last fetched MCP registry data");
      const data2 = accountPolicyData.policyData.mcpRegistryUrl && accountPolicyData.policyData.mcpAccess ? { url: accountPolicyData.policyData.mcpRegistryUrl, registry_access: accountPolicyData.policyData.mcpAccess } : null;
      return { data: data2, fetchedAt: accountPolicyData.mcpRegistryDataFetchedAt };
    }
    const data = await this.requestMcpRegistryProvider(sessions);
    return !isUndefined(data) ? { data, fetchedAt: Date.now() } : void 0;
  }
  async requestMcpRegistryProvider(sessions) {
    const mcpRegistryDataUrl = this.getMcpRegistryDataUrl();
    if (!mcpRegistryDataUrl) {
      this.logService.debug("[DefaultAccount] No MCP registry data URL found");
      return null;
    }
    this.logService.debug("[DefaultAccount] Fetching MCP registry data from:", mcpRegistryDataUrl);
    const response = await this.request(mcpRegistryDataUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.mcpRegistryProvider");
    if (!response) {
      return void 0;
    }
    if (!isSuccess(response)) {
      if (isClientError(response)) {
        this.logService.debug(`[DefaultAccount] Received ${response.res.statusCode} for MCP registry data, treating as no registry available.`);
        return null;
      }
      this.logService.debug(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching MCP registry data`);
      return void 0;
    }
    try {
      const data = await asJson(response);
      if (data) {
        this.logService.debug("Fetched MCP registry providers", data.mcp_registries);
        return data.mcp_registries[0] ?? null;
      }
      this.logService.debug("No MCP registry providers content found in response");
      return null;
    } catch (error) {
      this.logService.error("Failed to fetch MCP registry providers", getErrorMessage(error));
      return void 0;
    }
  }
  async getManagedSettings(sessions, accountPolicyData, options) {
    if (!options?.forceRefresh && accountPolicyData?.managedSettingsFetchedAt && !this.isDataStale(accountPolicyData.managedSettingsFetchedAt)) {
      this.logService.debug("[DefaultAccount] Using last fetched managed settings data");
      this._managedSettingsFetchStatus = "ok";
      return {
        data: {
          managedSettings: accountPolicyData.policyData.managedSettings
        },
        fetchedAt: accountPolicyData.managedSettingsFetchedAt
      };
    }
    const data = await this.requestManagedSettings(sessions);
    return { data, fetchedAt: Date.now() };
  }
  async requestManagedSettings(sessions) {
    const managedSettingsUrl = this.getManagedSettingsUrl();
    if (!managedSettingsUrl) {
      this.logService.debug("[DefaultAccount] No managed settings URL configured; skipping enterprise policy fetch");
      this._managedSettingsFetchStatus = "no-url";
      return void 0;
    }
    this.logService.debug("[DefaultAccount] Fetching managed settings from:", managedSettingsUrl);
    const rateLimitBackoffActive = Date.now() < this._rateLimitBackoffUntil;
    const response = await this.request(managedSettingsUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.managedSettings", MANAGED_SETTINGS_REQUEST_TIMEOUT_MS);
    if (!response) {
      this.logService.debug("[DefaultAccount] Managed settings fetch returned no response (network error, all sessions rejected, or active rate-limit backoff); falling back to local-only policy");
      this.reportManagedSettingsOutcome("no-response", rateLimitBackoffActive);
      return void 0;
    }
    if (!isSuccess(response)) {
      const status = response.res.statusCode ?? 0;
      this.logService.warn(`[DefaultAccount] Managed settings fetch returned non-success status ${status}; falling back to local-only policy`);
      this.reportManagedSettingsOutcome(status, rateLimitBackoffActive);
      return void 0;
    }
    try {
      const data = await asJson(response);
      this.logService.trace("[DefaultAccount] Managed settings raw response:", JSON.stringify(data ?? null));
      this._managedSettingsRawResponse = data ?? null;
      const adapted = adaptManagedSettings(data ?? {}, (msg) => this.logService.warn(msg));
      const managedSettingsCount = adapted.managedSettings ? Object.keys(adapted.managedSettings).length : 0;
      if (managedSettingsCount === 0) {
        this.logService.debug("[DefaultAccount] Managed settings fetched (empty response \u2014 no enterprise policy file present)");
      } else {
        this.logService.info("[DefaultAccount] Managed settings applied");
        this.logService.trace("[DefaultAccount] Managed settings payload:", JSON.stringify(adapted));
      }
      this.reportManagedSettingsOutcome("ok", rateLimitBackoffActive);
      return adapted;
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to parse managed settings response", getErrorMessage(error));
      this.reportManagedSettingsOutcome("parse-error", rateLimitBackoffActive);
      return void 0;
    }
  }
  reportManagedSettingsOutcome(status, rateLimitBackoffActive) {
    this._managedSettingsFetchStatus = status;
    this.telemetryService.publicLog2("defaultaccount:managedSettings:fetch", {
      outcome: typeof status === "number" ? `status:${status}` : status,
      rateLimitBackoffActive
    });
  }
  /**
   * Detects a rate-limited GitHub response. Mirrors the public-API check in
   * `githubRepoFetcher.ts`:
   * - Canonical `429 Too Many Requests`.
   * - Primary quota exhaustion: `403` with `X-RateLimit-Remaining: 0`.
   * - Secondary throttling: GitHub omits `X-RateLimit-Remaining` but sets
   *   `Retry-After` (on a non-2xx response). We treat any non-success status
   *   that carries `Retry-After` as a back-off signal.
   */
  isRateLimited(response) {
    const status = response.res.statusCode;
    if (status === 429) {
      return true;
    }
    if (status === 403 && readHeader(response.res.headers, "x-ratelimit-remaining") === "0") {
      return true;
    }
    if (!isSuccess(response) && readHeader(response.res.headers, "retry-after") !== void 0) {
      return true;
    }
    return false;
  }
  async request(url, type, body, sessions, token, callSite, requestTimeoutMs) {
    if (Date.now() < this._rateLimitBackoffUntil) {
      const remainingSec = Math.ceil((this._rateLimitBackoffUntil - Date.now()) / 1e3);
      this.logService.debug(`[DefaultAccount] Skipping request to ${url} \u2014 rate-limit backoff active for ${remainingSec}s more`);
      return void 0;
    }
    let lastResponse;
    for (const session of sessions) {
      if (token.isCancellationRequested) {
        return lastResponse;
      }
      try {
        const response = await this.requestService.request({
          type,
          url,
          data: type === "POST" ? JSON.stringify(body) : void 0,
          disableCache: true,
          timeout: requestTimeoutMs,
          headers: {
            "Authorization": `Bearer ${session.accessToken}`
          },
          callSite
        }, token);
        const status = response.res.statusCode;
        if (this.isRateLimited(response)) {
          const retryAfterSec = retryAfterFromHeaders(response.res.headers) ?? 60;
          this._rateLimitBackoffUntil = Date.now() + retryAfterSec * 1e3;
          this.logService.warn(`[DefaultAccount] Rate limited by ${url} (status ${status}); backing off for ${retryAfterSec}s`);
          return response;
        }
        if (status === 401 || status === 404) {
          this.logService.debug(`[DefaultAccount] Received ${status} for URL ${url} with session ${session.id}, likely due to expired/revoked token or insufficient permissions.`, "Trying next session if available.");
          lastResponse = response;
          continue;
        }
        return response;
      } catch (error) {
        if (!token.isCancellationRequested) {
          this.logService.error(`[DefaultAccount] request: error ${error}`, url);
        }
      }
    }
    if (!lastResponse) {
      this.logService.trace("[DefaultAccount]: No response received for request", url);
      return void 0;
    }
    return lastResponse;
  }
  isDataStale(fetchedAt) {
    return Date.now() - fetchedAt >= ACCOUNT_DATA_POLL_INTERVAL_MS;
  }
  getEntitlementUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot_internal/user`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.entitlementUrl;
  }
  getTokenEntitlementUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot_internal/v2/token`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.tokenEntitlementUrl;
  }
  getMcpRegistryDataUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot/mcp_registry`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.mcpRegistryDataUrl;
  }
  getManagedSettingsUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot_internal/managed_settings`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.managedSettingsUrl;
  }
  getDefaultAccountAuthenticationProvider() {
    if (this.configurationService.getValue(this.defaultAccountConfig.authenticationProvider.enterpriseProviderConfig) === this.defaultAccountConfig.authenticationProvider.enterprise.id) {
      return {
        ...this.defaultAccountConfig.authenticationProvider.enterprise,
        enterprise: true
      };
    }
    return {
      ...this.defaultAccountConfig.authenticationProvider.default,
      enterprise: false
    };
  }
  resolveGitHubUrl(path) {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (enterpriseUrl) {
          return `${enterpriseUrl.protocol}//${enterpriseUrl.host}/${path}`;
        }
      } catch {
      }
    }
    return `https://github.com/${path}`;
  }
  getEnterpriseUrl() {
    const value = this.configurationService.getValue(this.defaultAccountConfig.authenticationProvider.enterpriseProviderUriSetting);
    if (!isString(value)) {
      return void 0;
    }
    return new URL(value);
  }
  async signIn(options) {
    const authProvider = this.getDefaultAccountAuthenticationProvider();
    if (!authProvider) {
      throw new Error("No default account provider configured");
    }
    const { additionalScopes, ...sessionOptions } = options ?? {};
    const defaultAccountScopes = this.defaultAccountConfig.authenticationProvider.scopes[0];
    const scopes = additionalScopes ? distinct([...defaultAccountScopes, ...additionalScopes]) : defaultAccountScopes;
    const session = await this.authenticationService.createSession(authProvider.id, scopes, sessionOptions);
    for (const preferredExtension of this.defaultAccountConfig.preferredExtensions) {
      this.authenticationExtensionsService.updateAccountPreference(preferredExtension, authProvider.id, session.account);
    }
    await this.updateDefaultAccount();
    return this.defaultAccount;
  }
  async signOut() {
    if (!this.defaultAccount) {
      return;
    }
    await this.commandService.executeCommand("_signOutOfAccount", { providerId: this.defaultAccount.authenticationProvider.id, accountLabel: this.defaultAccount.accountName });
  }
};
DefaultAccountProvider = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IAuthenticationService),
  __decorateParam(3, IAuthenticationExtensionsService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IRequestService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IHostService),
  __decorateParam(12, ICommandService)
], DefaultAccountProvider);
let DefaultAccountProviderContribution = class extends Disposable {
  constructor(productService, instantiationService, defaultAccountService) {
    super();
    const defaultAccountProvider = this._register(instantiationService.createInstance(DefaultAccountProvider, toDefaultAccountConfig(productService.defaultChatAgent)));
    defaultAccountService.setDefaultAccountProvider(defaultAccountProvider);
  }
};
DefaultAccountProviderContribution.ID = "workbench.contributions.defaultAccountProvider";
DefaultAccountProviderContribution = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IDefaultAccountService)
], DefaultAccountProviderContribution);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: DEFAULT_ACCOUNT_SIGN_IN_COMMAND,
      title: localize2("signIn", "Sign In")
    });
  }
  async run(accessor) {
    const defaultAccountService = accessor.get(IDefaultAccountService);
    await defaultAccountService.signIn();
  }
});
registerWorkbenchContribution2(DefaultAccountProviderContribution.ID, DefaultAccountProviderContribution, WorkbenchPhase.BlockStartup);
export {
  CONTEXT_DEFAULT_ACCOUNT_STATE,
  DEFAULT_ACCOUNT_SIGN_IN_COMMAND,
  DefaultAccountService,
  DefaultAccountStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hY2NvdW50cy9icm93c2VyL2RlZmF1bHRBY2NvdW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQmFycmllciwgUnVuT25jZVNjaGVkdWxlciwgVGhyb3R0bGVkRGVsYXllciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElDb3BpbG90VG9rZW5JbmZvLCBJRGVmYXVsdEFjY291bnQsIElEZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIElFbnRpdGxlbWVudHNEYXRhLCBJUG9saWN5RGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSURlZmF1bHRDaGF0QWdlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IGlzU3RyaW5nLCBpc1VuZGVmaW5lZCwgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRQcm92aWRlciwgSURlZmF1bHRBY2NvdW50U2VydmljZSwgTWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzSnNvbiwgSVJlcXVlc3RTZXJ2aWNlLCBpc0NsaWVudEVycm9yLCBpc1N1Y2Nlc3MsIHJlYWRIZWFkZXIsIHJldHJ5QWZ0ZXJGcm9tSGVhZGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCwgSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IGFkYXB0TWFuYWdlZFNldHRpbmdzLCBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UgfSBmcm9tICcuL21hbmFnZWRTZXR0aW5ncy5qcyc7XG5cbmludGVyZmFjZSBJRGVmYXVsdEFjY291bnRDb25maWcge1xuXHRyZWFkb25seSBwcmVmZXJyZWRFeHRlbnNpb25zOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgYXV0aGVudGljYXRpb25Qcm92aWRlcjoge1xuXHRcdHJlYWRvbmx5IGRlZmF1bHQ6IHtcblx0XHRcdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0fTtcblx0XHRyZWFkb25seSBlbnRlcnByaXNlOiB7XG5cdFx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRcdH07XG5cdFx0cmVhZG9ubHkgZW50ZXJwcmlzZVByb3ZpZGVyQ29uZmlnOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZW50ZXJwcmlzZVByb3ZpZGVyVXJpU2V0dGluZzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNjb3Blczogc3RyaW5nW11bXTtcblx0fTtcblx0cmVhZG9ubHkgdG9rZW5FbnRpdGxlbWVudFVybDogc3RyaW5nO1xuXHRyZWFkb25seSBlbnRpdGxlbWVudFVybDogc3RyaW5nO1xuXHRyZWFkb25seSBtY3BSZWdpc3RyeURhdGFVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzVXJsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0FDQ09VTlRfU0lHTl9JTl9DT01NQU5EID0gJ3dvcmtiZW5jaC5hY3Rpb25zLmFjY291bnRzLnNpZ25Jbic7XG5cbmV4cG9ydCBjb25zdCBlbnVtIERlZmF1bHRBY2NvdW50U3RhdHVzIHtcblx0VW5pbml0aWFsaXplZCA9ICd1bmluaXRpYWxpemVkJyxcblx0VW5hdmFpbGFibGUgPSAndW5hdmFpbGFibGUnLFxuXHRBdmFpbGFibGUgPSAnYXZhaWxhYmxlJyxcbn1cblxuZXhwb3J0IGNvbnN0IENPTlRFWFRfREVGQVVMVF9BQ0NPVU5UX1NUQVRFID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignZGVmYXVsdEFjY291bnRTdGF0dXMnLCBEZWZhdWx0QWNjb3VudFN0YXR1cy5VbmluaXRpYWxpemVkKTtcbmNvbnN0IENBQ0hFRF9QT0xJQ1lfREFUQV9LRVkgPSAnZGVmYXVsdEFjY291bnQuY2FjaGVkUG9saWN5RGF0YSc7XG5jb25zdCBBQ0NPVU5UX0RBVEFfUE9MTF9JTlRFUlZBTF9NUyA9IDYwICogNjAgKiAxMDAwOyAvLyAxIGhvdXJcbmNvbnN0IE1BTkFHRURfU0VUVElOR1NfUkVRVUVTVF9USU1FT1VUX01TID0gNTAwMDtcblxuaW50ZXJmYWNlIElUb2tlbkVudGl0bGVtZW50c1Jlc3BvbnNlIHtcblx0dG9rZW46IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElNY3BSZWdpc3RyeVByb3ZpZGVyIHtcblx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlZ2lzdHJ5X2FjY2VzczogJ2FsbG93X2FsbCcgfCAncmVnaXN0cnlfb25seSc7XG5cdHJlYWRvbmx5IG93bmVyPzoge1xuXHRcdHJlYWRvbmx5IGxvZ2luOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaWQ6IG51bWJlcjtcblx0XHRyZWFkb25seSB0eXBlOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcGFyZW50X2xvZ2luOiBzdHJpbmcgfCBudWxsO1xuXHRcdHJlYWRvbmx5IHByaW9yaXR5OiBudW1iZXI7XG5cdH07XG59XG5cbmludGVyZmFjZSBJTWNwUmVnaXN0cnlSZXNwb25zZSB7XG5cdHJlYWRvbmx5IG1jcF9yZWdpc3RyaWVzOiBSZWFkb25seUFycmF5PElNY3BSZWdpc3RyeVByb3ZpZGVyPjtcbn1cblxuZnVuY3Rpb24gdG9EZWZhdWx0QWNjb3VudENvbmZpZyhkZWZhdWx0Q2hhdEFnZW50OiBJRGVmYXVsdENoYXRBZ2VudCk6IElEZWZhdWx0QWNjb3VudENvbmZpZyB7XG5cdHJldHVybiB7XG5cdFx0cHJlZmVycmVkRXh0ZW5zaW9uczogW1xuXHRcdFx0ZGVmYXVsdENoYXRBZ2VudC5jaGF0RXh0ZW5zaW9uSWQsXG5cdFx0XHRkZWZhdWx0Q2hhdEFnZW50LmV4dGVuc2lvbklkLFxuXHRcdF0sXG5cdFx0YXV0aGVudGljYXRpb25Qcm92aWRlcjoge1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRpZDogZGVmYXVsdENoYXRBZ2VudC5wcm92aWRlci5kZWZhdWx0LmlkLFxuXHRcdFx0XHRuYW1lOiBkZWZhdWx0Q2hhdEFnZW50LnByb3ZpZGVyLmRlZmF1bHQubmFtZSxcblx0XHRcdH0sXG5cdFx0XHRlbnRlcnByaXNlOiB7XG5cdFx0XHRcdGlkOiBkZWZhdWx0Q2hhdEFnZW50LnByb3ZpZGVyLmVudGVycHJpc2UuaWQsXG5cdFx0XHRcdG5hbWU6IGRlZmF1bHRDaGF0QWdlbnQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lLFxuXHRcdFx0fSxcblx0XHRcdGVudGVycHJpc2VQcm92aWRlckNvbmZpZzogYCR7ZGVmYXVsdENoYXRBZ2VudC5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZ30uYXV0aFByb3ZpZGVyYCxcblx0XHRcdGVudGVycHJpc2VQcm92aWRlclVyaVNldHRpbmc6IGRlZmF1bHRDaGF0QWdlbnQucHJvdmlkZXJVcmlTZXR0aW5nLFxuXHRcdFx0c2NvcGVzOiBkZWZhdWx0Q2hhdEFnZW50LnByb3ZpZGVyU2NvcGVzLFxuXHRcdH0sXG5cdFx0ZW50aXRsZW1lbnRVcmw6IGRlZmF1bHRDaGF0QWdlbnQuZW50aXRsZW1lbnRVcmwsXG5cdFx0dG9rZW5FbnRpdGxlbWVudFVybDogZGVmYXVsdENoYXRBZ2VudC50b2tlbkVudGl0bGVtZW50VXJsLFxuXHRcdG1jcFJlZ2lzdHJ5RGF0YVVybDogZGVmYXVsdENoYXRBZ2VudC5tY3BSZWdpc3RyeURhdGFVcmwsXG5cdFx0bWFuYWdlZFNldHRpbmdzVXJsOiBkZWZhdWx0Q2hhdEFnZW50Lm1hbmFnZWRTZXR0aW5nc1VybCxcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRBY2NvdW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBkZWZhdWx0QWNjb3VudDogSURlZmF1bHRBY2NvdW50IHwgbnVsbCA9IG51bGw7XG5cdGdldCBjdXJyZW50RGVmYXVsdEFjY291bnQoKTogSURlZmF1bHRBY2NvdW50IHwgbnVsbCB7IHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50OyB9XG5cdGdldCBwb2xpY3lEYXRhKCk6IElQb2xpY3lEYXRhIHwgbnVsbCB7IHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXI/LnBvbGljeURhdGEgPz8gbnVsbDsgfVxuXHRnZXQgY29waWxvdFRva2VuSW5mbygpOiBJQ29waWxvdFRva2VuSW5mbyB8IG51bGwgeyByZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyPy5jb3BpbG90VG9rZW5JbmZvID8/IG51bGw7IH1cblxuXHRnZXQgbWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMoKTogTWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMgeyByZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyPy5tYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyA/PyBudWxsOyB9XG5cdGdldCBtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQoKTogbnVtYmVyIHwgbnVsbCB7IHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXI/Lm1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdCA/PyBudWxsOyB9XG5cdGdldCBtYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZSgpOiB1bmtub3duIHsgcmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlcj8ubWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2UgPz8gbnVsbDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5pdEJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGVmYXVsdEFjY291bnQgfCBudWxsPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQb2xpY3lEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVBvbGljeURhdGEgfCBudWxsPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQb2xpY3lEYXRhID0gdGhpcy5fb25EaWRDaGFuZ2VQb2xpY3lEYXRhLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mbyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb3BpbG90VG9rZW5JbmZvIHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mbyA9IHRoaXMuX29uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mby5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50Q29uZmlnOiBJRGVmYXVsdEFjY291bnRDb25maWc7XG5cdHByaXZhdGUgZGVmYXVsdEFjY291bnRQcm92aWRlcjogSURlZmF1bHRBY2NvdW50UHJvdmlkZXIgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZyA9IHRvRGVmYXVsdEFjY291bnRDb25maWcocHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudCk7XG5cdH1cblxuXHRhc3luYyBnZXREZWZhdWx0QWNjb3VudCgpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRCYXJyaWVyLndhaXQoKTtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudDtcblx0fVxuXG5cdGdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpOiBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblx0XHRpZiAodGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4udGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmRlZmF1bHQsXG5cdFx0XHRlbnRlcnByaXNlOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRzZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKHByb3ZpZGVyOiBJRGVmYXVsdEFjY291bnRQcm92aWRlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRGVmYXVsdCBhY2NvdW50IHByb3ZpZGVyIGlzIGFscmVhZHkgc2V0Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0aWYgKHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlci5wb2xpY3lEYXRhKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVBvbGljeURhdGEuZmlyZSh0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXIucG9saWN5RGF0YSk7XG5cdFx0fVxuXHRcdHByb3ZpZGVyLnJlZnJlc2goKS50aGVuKGFjY291bnQgPT4ge1xuXHRcdFx0dGhpcy5kZWZhdWx0QWNjb3VudCA9IGFjY291bnQ7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLmluaXRCYXJyaWVyLm9wZW4oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHByb3ZpZGVyLm9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQoYWNjb3VudCA9PiB0aGlzLnNldERlZmF1bHRBY2NvdW50KGFjY291bnQpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihwcm92aWRlci5vbkRpZENoYW5nZVBvbGljeURhdGEocG9saWN5RGF0YSA9PiB0aGlzLl9vbkRpZENoYW5nZVBvbGljeURhdGEuZmlyZShwb2xpY3lEYXRhKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocHJvdmlkZXIub25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvKHRva2VuSW5mbyA9PiB0aGlzLl9vbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8uZmlyZSh0b2tlbkluZm8pKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdEJhcnJpZXIud2FpdCgpO1xuXG5cdFx0Y29uc3QgYWNjb3VudCA9IGF3YWl0IHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlcj8ucmVmcmVzaChvcHRpb25zKTtcblx0XHR0aGlzLnNldERlZmF1bHRBY2NvdW50KGFjY291bnQgPz8gbnVsbCk7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnQ7XG5cdH1cblxuXHRhc3luYyBzaWduSW4ob3B0aW9ucz86IHsgYWRkaXRpb25hbFNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdO1trZXk6IHN0cmluZ106IHVua25vd24gfSk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdEJhcnJpZXIud2FpdCgpO1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXI/LnNpZ25JbihvcHRpb25zKSA/PyBudWxsO1xuXHR9XG5cblx0YXN5bmMgc2lnbk91dCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRCYXJyaWVyLndhaXQoKTtcblx0XHRhd2FpdCB0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXI/LnNpZ25PdXQoKTtcblx0fVxuXG5cdHJlc29sdmVHaXRIdWJVcmwocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyLnJlc29sdmVHaXRIdWJVcmwocGF0aCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGBodHRwczovL2dpdGh1Yi5jb20vJHtwYXRofWA7XG5cdH1cblxuXHRwcml2YXRlIHNldERlZmF1bHRBY2NvdW50KGFjY291bnQ6IElEZWZhdWx0QWNjb3VudCB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoZXF1YWxzKHRoaXMuZGVmYXVsdEFjY291bnQsIGFjY291bnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZGVmYXVsdEFjY291bnQgPSBhY2NvdW50O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQuZmlyZSh0aGlzLmRlZmF1bHRBY2NvdW50KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUFjY291bnRQb2xpY3lEYXRhIHtcblx0cmVhZG9ubHkgYWNjb3VudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBvbGljeURhdGE6IElQb2xpY3lEYXRhO1xuXHRyZWFkb25seSBlbnRpdGxlbWVudHNGZXRjaGVkQXQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRva2VuRW50aXRsZW1lbnRzRmV0Y2hlZEF0PzogbnVtYmVyO1xuXHRyZWFkb25seSBtY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElDYWNoZWRBY2NvdW50RGF0YSB7XG5cdHJlYWRvbmx5IGFjY291bnRQb2xpY3lEYXRhOiBJQWNjb3VudFBvbGljeURhdGE7XG5cdHJlYWRvbmx5IGNvcGlsb3RUb2tlbkluZm8/OiBJQ29waWxvdFRva2VuSW5mbztcbn1cblxuaW50ZXJmYWNlIElEZWZhdWx0QWNjb3VudERhdGEge1xuXHRhY2NvdW50SWQ6IHN0cmluZztcblx0ZGVmYXVsdEFjY291bnQ6IElEZWZhdWx0QWNjb3VudDtcblx0cG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgbnVsbDtcblx0Y29waWxvdFRva2VuSW5mbzogSUNvcGlsb3RUb2tlbkluZm8gfCBudWxsO1xufVxuXG50eXBlIERlZmF1bHRBY2NvdW50U3RhdHVzVGVsZW1ldHJ5ID0ge1xuXHRzdGF0dXM6IHN0cmluZztcblx0aW5pdGlhbDogYm9vbGVhbjtcbn07XG5cbnR5cGUgRGVmYXVsdEFjY291bnRTdGF0dXNUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYW5keTA4MSc7XG5cdGNvbW1lbnQ6ICdMb2cgZGVmYXVsdCBhY2NvdW50IGF2YWlsYWJpbGl0eSBzdGF0dXMnO1xuXHRzdGF0dXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdJbmRpY2F0ZXMgd2hldGhlciBkZWZhdWx0IGFjY291bnQgaXMgYXZhaWxhYmxlIG9yIG5vdC4nIH07XG5cdGluaXRpYWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdJbmRpY2F0ZXMgd2hldGhlciB0aGlzIGlzIHRoZSBpbml0aWFsIHN0YXR1cyByZXBvcnQuJyB9O1xufTtcblxudHlwZSBNYW5hZ2VkU2V0dGluZ3NGZXRjaFRlbGVtZXRyeSA9IHtcblx0b3V0Y29tZTogc3RyaW5nO1xuXHRyYXRlTGltaXRCYWNrb2ZmQWN0aXZlOiBib29sZWFuO1xufTtcblxudHlwZSBNYW5hZ2VkU2V0dGluZ3NGZXRjaFRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2pvc2hzcGljZXInO1xuXHRjb21tZW50OiAnT3V0Y29tZSBvZiBhIGZldGNoIGFnYWluc3QgdGhlIGVudGVycHJpc2UgbWFuYWdlZF9zZXR0aW5ncyBlbmRwb2ludC4gVXNlZCB0byBkZXRlY3QgZW5kcG9pbnQgcmVncmVzc2lvbnMgYW5kIGFibm9ybWFsIGZhaWx1cmUgcmF0ZXMgaW4gdGhlIHdpbGQuJztcblx0b3V0Y29tZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0hpZ2gtbGV2ZWwgb3V0Y29tZTogYSBudW1lcmljIEhUVFAgc3RhdHVzIChgc3RhdHVzOk5OTmApLCBvciBvbmUgb2YgYG9rYCAvIGBuby1yZXNwb25zZWAgLyBgcGFyc2UtZXJyb3JgLicgfTtcblx0cmF0ZUxpbWl0QmFja29mZkFjdGl2ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RydWUgd2hlbiB0aGUgcmVxdWVzdCB3YXMgc2hvcnQtY2lyY3VpdGVkIGJlY2F1c2UgYSBwcmlvciByYXRlLWxpbWl0IFJldHJ5LUFmdGVyIHdpbmRvdyB3YXMgc3RpbGwgYWN0aXZlLicgfTtcbn07XG5cbmNsYXNzIERlZmF1bHRBY2NvdW50UHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURlZmF1bHRBY2NvdW50UHJvdmlkZXIge1xuXG5cdHByaXZhdGUgX2RlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnREYXRhIHwgbnVsbCA9IG51bGw7XG5cdGdldCBkZWZhdWx0QWNjb3VudCgpOiBJRGVmYXVsdEFjY291bnQgfCBudWxsIHsgcmV0dXJuIHRoaXMuX2RlZmF1bHRBY2NvdW50Py5kZWZhdWx0QWNjb3VudCA/PyBudWxsOyB9XG5cblx0cHJpdmF0ZSBfcG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgbnVsbCA9IG51bGw7XG5cdGdldCBwb2xpY3lEYXRhKCk6IElQb2xpY3lEYXRhIHwgbnVsbCB7IHJldHVybiB0aGlzLl9wb2xpY3lEYXRhPy5wb2xpY3lEYXRhID8/IG51bGw7IH1cblxuXHRwcml2YXRlIF9jb3BpbG90VG9rZW5JbmZvOiBJQ29waWxvdFRva2VuSW5mbyB8IG51bGwgPSBudWxsO1xuXHRnZXQgY29waWxvdFRva2VuSW5mbygpOiBJQ29waWxvdFRva2VuSW5mbyB8IG51bGwgeyByZXR1cm4gdGhpcy5fY29waWxvdFRva2VuSW5mbzsgfVxuXG5cdHByaXZhdGUgX21hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzOiBNYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyA9IG51bGw7XG5cdGdldCBtYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cygpOiBNYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyB7IHJldHVybiB0aGlzLl9tYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1czsgfVxuXHRnZXQgbWFuYWdlZFNldHRpbmdzRmV0Y2hlZEF0KCk6IG51bWJlciB8IG51bGwgeyByZXR1cm4gdGhpcy5fcG9saWN5RGF0YT8ubWFuYWdlZFNldHRpbmdzRmV0Y2hlZEF0ID8/IG51bGw7IH1cblxuXHRwcml2YXRlIF9tYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZTogdW5rbm93biA9IG51bGw7XG5cdGdldCBtYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZSgpOiB1bmtub3duIHsgcmV0dXJuIHRoaXMuX21hbmFnZWRTZXR0aW5nc1Jhd1Jlc3BvbnNlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElEZWZhdWx0QWNjb3VudCB8IG51bGw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50ID0gdGhpcy5fb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBvbGljeURhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUG9saWN5RGF0YSB8IG51bGw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBvbGljeURhdGEgPSB0aGlzLl9vbkRpZENoYW5nZVBvbGljeURhdGEuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvcGlsb3RUb2tlbkluZm8gfCBudWxsPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvID0gdGhpcy5fb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudFN0YXR1c0NvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBpbml0UHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVUaHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcigxMDApKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY2NvdW50RGF0YVBvbGxTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnJlZmV0Y2hEZWZhdWx0QWNjb3VudCgpLCBBQ0NPVU5UX0RBVEFfUE9MTF9JTlRFUlZBTF9NUykpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRDb25maWc6IElEZWZhdWx0QWNjb3VudENvbmZpZyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hY2NvdW50U3RhdHVzQ29udGV4dCA9IENPTlRFWFRfREVGQVVMVF9BQ0NPVU5UX1NUQVRFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY2FjaGVkQWNjb3VudERhdGEgPSB0aGlzLmdldENhY2hlZEFjY291bnREYXRhKCk7XG5cdFx0dGhpcy5fcG9saWN5RGF0YSA9IGNhY2hlZEFjY291bnREYXRhPy5hY2NvdW50UG9saWN5RGF0YSA/PyBudWxsO1xuXHRcdHRoaXMuX2NvcGlsb3RUb2tlbkluZm8gPSBjYWNoZWRBY2NvdW50RGF0YT8uY29waWxvdFRva2VuSW5mbyA/PyBudWxsO1xuXHRcdHRoaXMuaW5pdFByb21pc2UgPSB0aGlzLmluaXQoKVxuXHRcdFx0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxEZWZhdWx0QWNjb3VudFN0YXR1c1RlbGVtZXRyeSwgRGVmYXVsdEFjY291bnRTdGF0dXNUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbj4oJ2RlZmF1bHRhY2NvdW50OnN0YXR1cycsIHsgc3RhdHVzOiB0aGlzLmRlZmF1bHRBY2NvdW50ID8gJ2F2YWlsYWJsZScgOiAndW5hdmFpbGFibGUnLCBpbml0aWFsOiB0cnVlIH0pO1xuXHRcdFx0XHR0aGlzLmluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDYWNoZWRBY2NvdW50RGF0YSgpOiBJQ2FjaGVkQWNjb3VudERhdGEgfCBudWxsIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChDQUNIRURfUE9MSUNZX0RBVEFfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoY2FjaGVkKTtcblxuXHRcdFx0XHQvLyBUT0RPOiBSZW1vdmUgb2xkIGZvcm1hdCBtaWdyYXRpb24gYWZ0ZXIgQXVndXN0IDIwMjYuXG5cdFx0XHRcdC8vIFByZXZpb3VzbHksIHRoZSBjYWNoZSBzdG9yZWQgYSBmbGF0IElBY2NvdW50UG9saWN5RGF0YSBzaGFwZVxuXHRcdFx0XHQvLyAoZS5nLiB7IGFjY291bnRJZCwgcG9saWN5RGF0YSwgLi4uIH0pLiBXZSBub3cgd3JhcCBpdCBpbnNpZGVcblx0XHRcdFx0Ly8gSUNhY2hlZEFjY291bnREYXRhICh7IGFjY291bnRQb2xpY3lEYXRhLCBjb3BpbG90VG9rZW5JbmZvIH0pLlxuXHRcdFx0XHQvLyBUaGlzIGJyYW5jaCBtaWdyYXRlcyB0aGUgb2xkIGZsYXQgZm9ybWF0IHRvIHRoZSBuZXcgc2hhcGUgYW5kXG5cdFx0XHRcdC8vIHJlLXN0b3JlcyBpdCBzbyBzdWJzZXF1ZW50IHJlYWRzIHVzZSB0aGUgbmV3IGZvcm1hdCBkaXJlY3RseS5cblx0XHRcdFx0Y29uc3QgeyBhY2NvdW50SWQsIHBvbGljeURhdGEsIHRva2VuRW50aXRsZW1lbnRzRmV0Y2hlZEF0LCBtY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQsIGNvcGlsb3RUb2tlbkluZm8gfSA9IHBhcnNlZDtcblx0XHRcdFx0aWYgKGFjY291bnRJZCAmJiBwb2xpY3lEYXRhKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIEluaXRpYWxpemluZyB3aXRoIGNhY2hlZCBwb2xpY3kgZGF0YSAobWlncmF0aW5nIG9sZCBmb3JtYXQpJyk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJQ2FjaGVkQWNjb3VudERhdGEgPSB7IGFjY291bnRQb2xpY3lEYXRhOiB7IGFjY291bnRJZCwgcG9saWN5RGF0YSwgdG9rZW5FbnRpdGxlbWVudHNGZXRjaGVkQXQsIG1jcFJlZ2lzdHJ5RGF0YUZldGNoZWRBdCB9LCBjb3BpbG90VG9rZW5JbmZvIH07XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDQUNIRURfUE9MSUNZX0RBVEFfS0VZLCBKU09OLnN0cmluZ2lmeShyZXN1bHQpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE5ldyBmb3JtYXRcblx0XHRcdFx0Y29uc3QgeyBhY2NvdW50UG9saWN5RGF0YSwgY29waWxvdFRva2VuSW5mbzogd3JhcHBlZENvcGlsb3RUb2tlbkluZm8gfSA9IHBhcnNlZDtcblx0XHRcdFx0aWYgKGFjY291bnRQb2xpY3lEYXRhPy5hY2NvdW50SWQgJiYgYWNjb3VudFBvbGljeURhdGE/LnBvbGljeURhdGEpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gSW5pdGlhbGl6aW5nIHdpdGggY2FjaGVkIHBvbGljeSBkYXRhJyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgYWNjb3VudFBvbGljeURhdGEsIGNvcGlsb3RUb2tlbkluZm86IHdyYXBwZWRDb3BpbG90VG9rZW5JbmZvIH07XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0RlZmF1bHRBY2NvdW50XSBGYWlsZWQgdG8gcGFyc2UgY2FjaGVkIHBvbGljeSBkYXRhJywgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFNraXAgaW5pdGlhbGl6YXRpb24gZm9yIGNsYXNzaWMgd2ViLW5vLXJlbW90ZSAodnNjb2RlLmRldiBlZGl0b3IpLCBidXRcblx0XHQvLyBzdGlsbCBpbml0aWFsaXplIGZvciB0aGUgYWdlbnRzIHdlYiB3b3JrYmVuY2ggKHZzY29kZS5kZXYvYWdlbnRzKSB3aGVyZVxuXHRcdC8vIGFjY291bnQgc3RhdGUgZHJpdmVzIHRoZSB0aXRsZSBiYXIgYW5kIHRoZSB3ZWxjb21lIHdhbGt0aHJvdWdoLlxuXHRcdGlmIChpc1dlYiAmJiAhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmICF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gUnVubmluZyBpbiB3ZWIgd2l0aG91dCByZW1vdGUsIHNraXBwaW5nIGluaXRpYWxpemF0aW9uJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2FpdCB1bnRpbCB0aGUgZGVmYXVsdCBhY2NvdW50IGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGlzIGF2YWlsYWJsZSBpbnN0ZWFkIG9mXG5cdFx0Ly8gd2FpdGluZyBmb3IgYWxsIGluc3RhbGxlZCBleHRlbnNpb25zIHRvIGJlIHJlZ2lzdGVyZWQuIEluIGRlc2t0b3AgcmVtb3RlXG5cdFx0Ly8gY29ubmVjdGlvbnMgZXh0ZW5zaW9ucyBhcmUgb25seSByZWdpc3RlcmVkIGFmdGVyIHRoZSBjb25uZWN0aW9uIGlzIGVzdGFibGlzaGVkLFxuXHRcdC8vIHNvIHdhaXRpbmcgZm9yIGB3aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWRgIGNhbiBkZWFkbG9jayBpbml0aWFsaXphdGlvbi5cblx0XHRhd2FpdCB0aGlzLndoZW5EZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJBdmFpbGFibGUoKTtcblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBTdGFydGluZyBpbml0aWFsaXphdGlvbicpO1xuXHRcdGF3YWl0IHRoaXMuZG9VcGRhdGVEZWZhdWx0QWNjb3VudCgpO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBJbml0aWFsaXphdGlvbiBjb21wbGV0ZScpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KGFjY291bnQgPT4ge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RGVmYXVsdEFjY291bnRTdGF0dXNUZWxlbWV0cnksIERlZmF1bHRBY2NvdW50U3RhdHVzVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdkZWZhdWx0YWNjb3VudDpzdGF0dXMnLCB7IHN0YXR1czogYWNjb3VudCA/ICdhdmFpbGFibGUnIDogJ3VuYXZhaWxhYmxlJywgaW5pdGlhbDogZmFsc2UgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIgPSB0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpO1xuXHRcdFx0aWYgKGUucHJvdmlkZXJJZCAhPT0gZGVmYXVsdEFjY291bnRQcm92aWRlci5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5kZWZhdWx0QWNjb3VudCAmJiBlLmV2ZW50LnJlbW92ZWQ/LnNvbWUoc2Vzc2lvbiA9PiBzZXNzaW9uLmlkID09PSB0aGlzLmRlZmF1bHRBY2NvdW50Py5zZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHRoaXMuc2V0RGVmYXVsdEFjY291bnQobnVsbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gU2Vzc2lvbnMgY2hhbmdlZCBmb3IgZGVmYXVsdCBhY2NvdW50IHByb3ZpZGVyLCB1cGRhdGluZyBkZWZhdWx0IGFjY291bnQnKTtcblx0XHRcdFx0dGhpcy51cGRhdGVEZWZhdWx0QWNjb3VudCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5vbkRpZENoYW5nZUFjY291bnRQcmVmZXJlbmNlKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdEFjY291bnRQcm92aWRlciA9IHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk7XG5cdFx0XHRpZiAoZS5wcm92aWRlcklkICE9PSBkZWZhdWx0QWNjb3VudFByb3ZpZGVyLmlkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBBY2NvdW50IHByZWZlcmVuY2UgY2hhbmdlZCBmb3IgZGVmYXVsdCBhY2NvdW50IHByb3ZpZGVyLCB1cGRhdGluZyBkZWZhdWx0IGFjY291bnQnKTtcblx0XHRcdHRoaXMudXBkYXRlRGVmYXVsdEFjY291bnQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihlID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIgPSB0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpO1xuXHRcdFx0aWYgKGUuaWQgIT09IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIuaWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIERlZmF1bHQgYWNjb3VudCBwcm92aWRlciByZWdpc3RlcmVkLCB1cGRhdGluZyBkZWZhdWx0IGFjY291bnQnKTtcblx0XHRcdHRoaXMudXBkYXRlRGVmYXVsdEFjY291bnQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGUgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdEFjY291bnRQcm92aWRlciA9IHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk7XG5cdFx0XHRpZiAoZS5pZCAhPT0gZGVmYXVsdEFjY291bnRQcm92aWRlci5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gRGVmYXVsdCBhY2NvdW50IHByb3ZpZGVyIHVucmVnaXN0ZXJlZCwgdXBkYXRpbmcgZGVmYXVsdCBhY2NvdW50Jyk7XG5cdFx0XHR0aGlzLnVwZGF0ZURlZmF1bHRBY2NvdW50KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzKGZvY3VzZWQgPT4ge1xuXHRcdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdFx0dGhpcy5yZWZldGNoRGVmYXVsdEFjY291bnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdoZW5EZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJBdmFpbGFibGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFdhaXRpbmcgZm9yIGRlZmF1bHQgYWNjb3VudCBhdXRoZW50aWNhdGlvbiBwcm92aWRlciB0byBiZSBhdmFpbGFibGUuJyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgcHJvdmlkZXIgaXMgYXZhaWxhYmxlLlxuXHRcdFx0XHQvLyBJZiBhdmFpbGFibGUsIHJlc29sdmUgaW1tZWRpYXRlbHkuIE90aGVyd2lzZSwgd2FpdCBmb3IgaXQgdG8gYmUgZGVjbGFyZWQgb3IgcmVnaXN0ZXJlZC5cblx0XHRcdFx0aWYgKHRoaXMuaXNBY2NvdW50UHJvdmlkZXJBdmFpbGFibGUocHJvdmlkZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIERlZmF1bHQgYWNjb3VudCBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBpcyBub3cgYXZhaWxhYmxlLicpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXNvbHZlIGFzIHNvb24gYXMgdGhlIGRlZmF1bHQgYWNjb3VudCBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBpcyBkZWNsYXJlZCBvclxuXHRcdFx0XHQvLyByZWdpc3RlcmVkLCBidXQgd2FpdCBubyBsb25nZXIgdGhhbiBpbnN0YWxsZWQgZXh0ZW5zaW9ucyBiZWluZyByZWdpc3RlcmVkLlxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQuYW55KHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRGVjbGFyZWRQcm92aWRlcnMsIHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNBY2NvdW50UHJvdmlkZXJBdmFpbGFibGUocHJvdmlkZXIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gRGVmYXVsdCBhY2NvdW50IGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGlzIG5vdyBhdmFpbGFibGUuJyk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gRXhwbGljaXRseSBhY3RpdmF0ZSB0aGUgcHJvdmlkZXIncyBleHRlbnNpb24gc28gdGhhdCB0aGUgYXV0aGVudGljYXRpb25cblx0XHRcdFx0Ly8gcHJvdmlkZXIgZ2V0cyByZWdpc3RlcmVkLiBJbiBkZXNrdG9wIHJlbW90ZSBjb25uZWN0aW9ucyBleHRlbnNpb25zIGFyZSBvbmx5XG5cdFx0XHRcdC8vIHJlZ2lzdGVyZWQgYWZ0ZXIgdGhlIGNvbm5lY3Rpb24gaXMgZXN0YWJsaXNoZWQsIHNvIHdpdGhvdXQgdGhpcyB0aGUgcHJvdmlkZXJcblx0XHRcdFx0Ly8gd291bGQgbmV2ZXIgYmVjb21lIGF2YWlsYWJsZS5cblx0XHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQsIHVuZGVmaW5lZCwge30sIHRydWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gSW5zdGFsbGVkIGV4dGVuc2lvbnMgcmVnaXN0ZXJlZC4nKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRXJyb3Igd2hpbGUgd2FpdGluZyBmb3IgaW5zdGFsbGVkIGV4dGVuc2lvbnMgdG8gYmUgcmVnaXN0ZXJlZCcsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlZnJlc2gob3B0aW9ucz86IHsgZm9yY2VSZWZyZXNoPzogYm9vbGVhbiB9KTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmluaXRQcm9taXNlO1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFJlZnJlc2hpbmcgZGVmYXVsdCBhY2NvdW50Jyk7XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZURlZmF1bHRBY2NvdW50KG9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZldGNoRGVmYXVsdEFjY291bnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuYWNjb3VudERhdGFQb2xsU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdHRoaXMuYWNjb3VudERhdGFQb2xsU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuaG9zdFNlcnZpY2UuaGFzRm9jdXMgfHwgIXRoaXMuX2RlZmF1bHRBY2NvdW50KSB7XG5cdFx0XHR0aGlzLnNjaGVkdWxlQWNjb3VudERhdGFQb2xsKCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gU2tpcHBpbmcgcmVmZXRjaGluZyBkZWZhdWx0IGFjY291bnQuIEhvc3QgaXMgbm90IGZvY3VzZWQgb3IgZGVmYXVsdCBhY2NvdW50IGlzIG5vdCBzZXQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFJlZmV0Y2hpbmcgZGVmYXVsdCBhY2NvdW50Jyk7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVEZWZhdWx0QWNjb3VudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVEZWZhdWx0QWNjb3VudChvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZVRocm90dGxlci50cmlnZ2VyKCgpID0+IHRoaXMuZG9VcGRhdGVEZWZhdWx0QWNjb3VudChvcHRpb25zKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVXBkYXRlRGVmYXVsdEFjY291bnQob3B0aW9ucz86IHsgZm9yY2VSZWZyZXNoPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50ID0gYXdhaXQgdGhpcy5mZXRjaERlZmF1bHRBY2NvdW50KG9wdGlvbnMpO1xuXHRcdFx0dGhpcy5zZXREZWZhdWx0QWNjb3VudChkZWZhdWx0QWNjb3VudCk7XG5cdFx0XHR0aGlzLnNjaGVkdWxlQWNjb3VudERhdGFQb2xsKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0RlZmF1bHRBY2NvdW50XSBFcnJvciB3aGlsZSB1cGRhdGluZyBkZWZhdWx0IGFjY291bnQnLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZldGNoRGVmYXVsdEFjY291bnQob3B0aW9ucz86IHsgZm9yY2VSZWZyZXNoPzogYm9vbGVhbiB9KTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnREYXRhIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIgPSB0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBEZWZhdWx0IGFjY291bnQgcHJvdmlkZXIgSUQ6JywgZGVmYXVsdEFjY291bnRQcm92aWRlci5pZCk7XG5cblx0XHRpZiAoIXRoaXMuaXNBY2NvdW50UHJvdmlkZXJBdmFpbGFibGUoZGVmYXVsdEFjY291bnRQcm92aWRlcikpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbRGVmYXVsdEFjY291bnRdIEF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGlzIG5vdCBhdmFpbGFibGUuYCwgZGVmYXVsdEFjY291bnRQcm92aWRlcik7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5nZXREZWZhdWx0QWNjb3VudEZvckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZGVmYXVsdEFjY291bnRQcm92aWRlciwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGlzQWNjb3VudFByb3ZpZGVyQXZhaWxhYmxlKGFjY291bnRQcm92aWRlcjogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5kZWNsYXJlZFByb3ZpZGVycy5zb21lKHAgPT4gcC5pZCA9PT0gYWNjb3VudFByb3ZpZGVyLmlkKVxuXHRcdFx0fHwgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuaXNBdXRoZW50aWNhdGlvblByb3ZpZGVyUmVnaXN0ZXJlZChhY2NvdW50UHJvdmlkZXIuaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREZWZhdWx0QWNjb3VudChhY2NvdW50OiBJRGVmYXVsdEFjY291bnREYXRhIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChlcXVhbHModGhpcy5fZGVmYXVsdEFjY291bnQsIGFjY291bnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbRGVmYXVsdEFjY291bnRdIFVwZGF0aW5nIGRlZmF1bHQgYWNjb3VudDonLCBhY2NvdW50KTtcblx0XHRpZiAoYWNjb3VudCkge1xuXHRcdFx0dGhpcy5fZGVmYXVsdEFjY291bnQgPSBhY2NvdW50O1xuXHRcdFx0dGhpcy5zZXRDb3BpbG90VG9rZW5JbmZvKGFjY291bnQuY29waWxvdFRva2VuSW5mbyk7XG5cdFx0XHR0aGlzLnNldFBvbGljeURhdGEoYWNjb3VudC5wb2xpY3lEYXRhKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQuZmlyZSh0aGlzLl9kZWZhdWx0QWNjb3VudC5kZWZhdWx0QWNjb3VudCk7XG5cdFx0XHR0aGlzLmFjY291bnRTdGF0dXNDb250ZXh0LnNldChEZWZhdWx0QWNjb3VudFN0YXR1cy5BdmFpbGFibGUpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIEFjY291bnQgc3RhdHVzIHNldCB0byBBdmFpbGFibGUnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVmYXVsdEFjY291bnQgPSBudWxsO1xuXHRcdFx0dGhpcy5zZXRQb2xpY3lEYXRhKG51bGwpO1xuXHRcdFx0dGhpcy5zZXRDb3BpbG90VG9rZW5JbmZvKG51bGwpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudC5maXJlKG51bGwpO1xuXHRcdFx0dGhpcy5hY2NvdW50RGF0YVBvbGxTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLmFjY291bnRTdGF0dXNDb250ZXh0LnNldChEZWZhdWx0QWNjb3VudFN0YXR1cy5VbmF2YWlsYWJsZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gQWNjb3VudCBzdGF0dXMgc2V0IHRvIFVuYXZhaWxhYmxlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRQb2xpY3lEYXRhKGFjY291bnRQb2xpY3lEYXRhOiBJQWNjb3VudFBvbGljeURhdGEgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKGVxdWFscyh0aGlzLl9wb2xpY3lEYXRhLCBhY2NvdW50UG9saWN5RGF0YSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcG9saWN5RGF0YSA9IGFjY291bnRQb2xpY3lEYXRhO1xuXHRcdHRoaXMuY2FjaGVQb2xpY3lEYXRhKGFjY291bnRQb2xpY3lEYXRhKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBvbGljeURhdGEuZmlyZSh0aGlzLl9wb2xpY3lEYXRhPy5wb2xpY3lEYXRhID8/IG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRDb3BpbG90VG9rZW5JbmZvKGNvcGlsb3RUb2tlbkluZm86IElDb3BpbG90VG9rZW5JbmZvIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChlcXVhbHModGhpcy5fY29waWxvdFRva2VuSW5mbywgY29waWxvdFRva2VuSW5mbykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29waWxvdFRva2VuSW5mbyA9IGNvcGlsb3RUb2tlbkluZm87XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvLmZpcmUodGhpcy5fY29waWxvdFRva2VuSW5mbyk7XG5cdH1cblxuXHRwcml2YXRlIGNhY2hlUG9saWN5RGF0YShhY2NvdW50UG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChhY2NvdW50UG9saWN5RGF0YSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIENhY2hpbmcgcG9saWN5IGRhdGEgZm9yIGFjY291bnQ6JywgYWNjb3VudFBvbGljeURhdGEuYWNjb3VudElkKTtcblx0XHRcdGNvbnN0IGNhY2hlZEFjY291bnREYXRhOiBJQ2FjaGVkQWNjb3VudERhdGEgPSB7XG5cdFx0XHRcdGFjY291bnRQb2xpY3lEYXRhLFxuXHRcdFx0XHRjb3BpbG90VG9rZW5JbmZvOiB0aGlzLl9jb3BpbG90VG9rZW5JbmZvID8/IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENBQ0hFRF9QT0xJQ1lfREFUQV9LRVksIEpTT04uc3RyaW5naWZ5KGNhY2hlZEFjY291bnREYXRhKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gUmVtb3ZpbmcgY2FjaGVkIHBvbGljeSBkYXRhJyk7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDQUNIRURfUE9MSUNZX0RBVEFfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVBY2NvdW50RGF0YVBvbGwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFjY291bnREYXRhUG9sbFNjaGVkdWxlci5zY2hlZHVsZShBQ0NPVU5UX0RBVEFfUE9MTF9JTlRFUlZBTF9NUyk7XG5cdH1cblxuXHRwcml2YXRlIGV4dHJhY3RGcm9tVG9rZW4odG9rZW46IHN0cmluZyk6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZmlyc3RQYXJ0ID0gdG9rZW4/LnNwbGl0KCc6JylbMF07XG5cdFx0Y29uc3QgZmllbGRzID0gZmlyc3RQYXJ0Py5zcGxpdCgnOycpO1xuXHRcdGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG5cdFx0XHRjb25zdCBba2V5LCB2YWx1ZV0gPSBmaWVsZC5zcGxpdCgnPScpO1xuXHRcdFx0cmVzdWx0LnNldChrZXksIHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRGVmYXVsdEFjY291bnRdIGV4dHJhY3RGcm9tVG9rZW46ICR7SlNPTi5zdHJpbmdpZnkoT2JqZWN0LmZyb21FbnRyaWVzKHJlc3VsdCkpfWApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldERlZmF1bHRBY2NvdW50Rm9yQXV0aGVudGljYXRpb25Qcm92aWRlcihhdXRoZW50aWNhdGlvblByb3ZpZGVyOiBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudERhdGEgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBHZXR0aW5nIERlZmF1bHQgQWNjb3VudCBmcm9tIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbnMgZm9yIHByb3ZpZGVyOicsIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmZpbmRNYXRjaGluZ1Byb3ZpZGVyU2Vzc2lvbihhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkLCB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuc2NvcGVzKTtcblxuXHRcdFx0aWYgKCFzZXNzaW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBObyBtYXRjaGluZyBzZXNzaW9uIGZvdW5kIGZvciBwcm92aWRlcjonLCBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXREZWZhdWx0QWNjb3VudEZyb21BdXRoZW50aWNhdGVkU2Vzc2lvbnMoYXV0aGVudGljYXRpb25Qcm92aWRlciwgc2Vzc2lvbnMsIG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIGdldCBkZWZhdWx0IGFjY291bnQgZm9yIHByb3ZpZGVyOicsIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXREZWZhdWx0QWNjb3VudEZyb21BdXRoZW50aWNhdGVkU2Vzc2lvbnMoYXV0aGVudGljYXRpb25Qcm92aWRlcjogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciwgc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudERhdGEgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY291bnRJZCA9IHNlc3Npb25zWzBdLmFjY291bnQuaWQ7XG5cdFx0XHRjb25zdCBhY2NvdW50UG9saWN5RGF0YSA9IHRoaXMuX3BvbGljeURhdGE/LmFjY291bnRJZCA9PT0gYWNjb3VudElkID8gdGhpcy5fcG9saWN5RGF0YSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgZW50aXRsZW1lbnRzUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRFbnRpdGxlbWVudHMoc2Vzc2lvbnMsIGFjY291bnRQb2xpY3lEYXRhLCBvcHRpb25zKTtcblx0XHRcdGNvbnN0IGVudGl0bGVtZW50c0RhdGEgPSBlbnRpdGxlbWVudHNSZXN1bHQ/LmRhdGE7XG5cdFx0XHRjb25zdCBlbnRpdGxlbWVudHNGZXRjaGVkQXQgPSBlbnRpdGxlbWVudHNSZXN1bHQ/LmZldGNoZWRBdDtcblx0XHRcdGNvbnN0IFt0b2tlbkVudGl0bGVtZW50c1Jlc3VsdCwgbWFuYWdlZFNldHRpbmdzUmVzdWx0XSA9IGVudGl0bGVtZW50c0RhdGE/LmNoYXRfZW5hYmxlZFxuXHRcdFx0XHQ/IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHR0aGlzLmdldFRva2VuRW50aXRsZW1lbnRzKHNlc3Npb25zLCBhY2NvdW50UG9saWN5RGF0YSwgb3B0aW9ucyksXG5cdFx0XHRcdFx0dGhpcy5nZXRNYW5hZ2VkU2V0dGluZ3Moc2Vzc2lvbnMsIGFjY291bnRQb2xpY3lEYXRhLCBvcHRpb25zKSxcblx0XHRcdFx0XSlcblx0XHRcdFx0OiBbdW5kZWZpbmVkLCB1bmRlZmluZWRdO1xuXG5cdFx0XHRjb25zdCB0b2tlbkVudGl0bGVtZW50c0ZldGNoZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdG9rZW5FbnRpdGxlbWVudHNSZXN1bHQ/LmZldGNoZWRBdDtcblx0XHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkID0gbWFuYWdlZFNldHRpbmdzUmVzdWx0Py5mZXRjaGVkQXQ7XG5cdFx0XHRsZXQgbWNwUmVnaXN0cnlEYXRhRmV0Y2hlZEF0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgcG9saWN5RGF0YTogTXV0YWJsZTxJUG9saWN5RGF0YT4gfCB1bmRlZmluZWQgPSBhY2NvdW50UG9saWN5RGF0YT8ucG9saWN5RGF0YSA/IHsgLi4uYWNjb3VudFBvbGljeURhdGEucG9saWN5RGF0YSB9IDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGVudGl0bGVtZW50c0RhdGEpIHtcblx0XHRcdFx0cG9saWN5RGF0YSA9IHBvbGljeURhdGEgPz8ge307XG5cdFx0XHRcdHBvbGljeURhdGEuY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQgPSBlbnRpdGxlbWVudHNEYXRhLmNsb3VkX3Nlc3Npb25fc3RvcmFnZV9lbmFibGVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2VuRW50aXRsZW1lbnRzUmVzdWx0Py5kYXRhKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuRW50aXRsZW1lbnRzRGF0YSA9IHRva2VuRW50aXRsZW1lbnRzUmVzdWx0LmRhdGE7XG5cdFx0XHRcdHBvbGljeURhdGEgPSBwb2xpY3lEYXRhID8/IHt9O1xuXHRcdFx0XHRwb2xpY3lEYXRhLmNoYXRfYWdlbnRfZW5hYmxlZCA9IHRva2VuRW50aXRsZW1lbnRzRGF0YS5wb2xpY3lEYXRhLmNoYXRfYWdlbnRfZW5hYmxlZDtcblx0XHRcdFx0cG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9IHRva2VuRW50aXRsZW1lbnRzRGF0YS5wb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkO1xuXHRcdFx0XHRwb2xpY3lEYXRhLm1jcCA9IHRva2VuRW50aXRsZW1lbnRzRGF0YS5wb2xpY3lEYXRhLm1jcDtcblx0XHRcdFx0aWYgKHBvbGljeURhdGEubWNwKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWNwUmVnaXN0cnlSZXN1bHQgPSBhd2FpdCB0aGlzLmdldE1jcFJlZ2lzdHJ5UHJvdmlkZXIoc2Vzc2lvbnMsIGFjY291bnRQb2xpY3lEYXRhLCBvcHRpb25zKTtcblx0XHRcdFx0XHRtY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQgPSBtY3BSZWdpc3RyeVJlc3VsdD8uZmV0Y2hlZEF0O1xuXHRcdFx0XHRcdHBvbGljeURhdGEubWNwUmVnaXN0cnlVcmwgPSBtY3BSZWdpc3RyeVJlc3VsdD8uZGF0YT8udXJsO1xuXHRcdFx0XHRcdHBvbGljeURhdGEubWNwQWNjZXNzID0gbWNwUmVnaXN0cnlSZXN1bHQ/LmRhdGE/LnJlZ2lzdHJ5X2FjY2Vzcztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwb2xpY3lEYXRhLm1jcFJlZ2lzdHJ5VXJsID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHBvbGljeURhdGEubWNwQWNjZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobWFuYWdlZFNldHRpbmdzUmVzdWx0Py5kYXRhKSB7XG5cdFx0XHRcdHBvbGljeURhdGEgPSB7IC4uLihwb2xpY3lEYXRhID8/IHt9KSwgLi4ubWFuYWdlZFNldHRpbmdzUmVzdWx0LmRhdGEgfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVmYXVsdEFjY291bnQ6IElEZWZhdWx0QWNjb3VudCA9IHtcblx0XHRcdFx0YXV0aGVudGljYXRpb25Qcm92aWRlcixcblx0XHRcdFx0YWNjb3VudE5hbWU6IHNlc3Npb25zWzBdLmFjY291bnQubGFiZWwsXG5cdFx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbnNbMF0uaWQsXG5cdFx0XHRcdGVudGVycHJpc2U6IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuZW50ZXJwcmlzZSB8fCBzZXNzaW9uc1swXS5hY2NvdW50LmxhYmVsLmluY2x1ZGVzKCdfJyksXG5cdFx0XHRcdGVudGl0bGVtZW50c0RhdGEsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFN1Y2Nlc3NmdWxseSBjcmVhdGVkIGRlZmF1bHQgYWNjb3VudCBmb3IgcHJvdmlkZXI6JywgYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCk7XG5cdFx0XHRjb25zdCBhY2NvdW50UG9saWN5UmVzdWx0OiBJQWNjb3VudFBvbGljeURhdGEgfCBudWxsID0gcG9saWN5RGF0YSB8fCBlbnRpdGxlbWVudHNGZXRjaGVkQXRcblx0XHRcdFx0PyB7IGFjY291bnRJZCwgcG9saWN5RGF0YTogcG9saWN5RGF0YSA/PyB7fSwgZW50aXRsZW1lbnRzRmV0Y2hlZEF0LCB0b2tlbkVudGl0bGVtZW50c0ZldGNoZWRBdCwgbWNwUmVnaXN0cnlEYXRhRmV0Y2hlZEF0LCBtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQgfVxuXHRcdFx0XHQ6IG51bGw7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkZWZhdWx0QWNjb3VudCxcblx0XHRcdFx0YWNjb3VudElkLFxuXHRcdFx0XHRwb2xpY3lEYXRhOiBhY2NvdW50UG9saWN5UmVzdWx0LFxuXHRcdFx0XHRjb3BpbG90VG9rZW5JbmZvOiB0b2tlbkVudGl0bGVtZW50c1Jlc3VsdD8uZGF0YT8uY29waWxvdFRva2VuSW5mbyA/PyBudWxsLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbRGVmYXVsdEFjY291bnRdIEZhaWxlZCB0byBjcmVhdGUgZGVmYXVsdCBhY2NvdW50IGZvciBwcm92aWRlcjonLCBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmluZE1hdGNoaW5nUHJvdmlkZXJTZXNzaW9uKGF1dGhQcm92aWRlcklkOiBzdHJpbmcsIGFsbFNjb3Blczogc3RyaW5nW11bXSk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbnMoYXV0aFByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IG1hdGNoaW5nU2Vzc2lvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBDaGVja2luZyBzZXNzaW9uIHdpdGggc2NvcGVzJywgc2Vzc2lvbi5zY29wZXMpO1xuXHRcdFx0Zm9yIChjb25zdCBzY29wZXMgb2YgYWxsU2NvcGVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNjb3Blc01hdGNoKHNlc3Npb24uc2NvcGVzLCBzY29wZXMpKSB7XG5cdFx0XHRcdFx0bWF0Y2hpbmdTZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGluZ1Nlc3Npb25zLmxlbmd0aCA+IDAgPyBtYXRjaGluZ1Nlc3Npb25zIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXNzaW9ucyhhdXRoUHJvdmlkZXJJZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXT4ge1xuXHRcdGZvciAobGV0IGF0dGVtcHQgPSAxOyBhdHRlbXB0IDw9IDM7IGF0dGVtcHQrKykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGV0IHByZWZlcnJlZEFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBwcmVmZXJyZWRBY2NvdW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByZWZlcnJlZEV4dGVuc2lvbiBvZiB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLnByZWZlcnJlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRwcmVmZXJyZWRBY2NvdW50TmFtZSA9IHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZShwcmVmZXJyZWRFeHRlbnNpb24sIGF1dGhQcm92aWRlcklkKTtcblx0XHRcdFx0XHRpZiAocHJlZmVycmVkQWNjb3VudE5hbWUpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHMoYXV0aFByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdFx0aWYgKGFjY291bnQubGFiZWwgPT09IHByZWZlcnJlZEFjY291bnROYW1lKSB7XG5cdFx0XHRcdFx0XHRwcmVmZXJyZWRBY2NvdW50ID0gYWNjb3VudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhhdXRoUHJvdmlkZXJJZCwgdW5kZWZpbmVkLCB7IGFjY291bnQ6IHByZWZlcnJlZEFjY291bnQgfSwgdHJ1ZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0RlZmF1bHRBY2NvdW50XSBBdHRlbXB0ICR7YXR0ZW1wdH0gdG8gZ2V0IHNlc3Npb25zIGZhaWxlZDpgLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0aWYgKGF0dGVtcHQgPT09IDMpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGdldCBzZXNzaW9ucyBhZnRlciBtdWx0aXBsZSBhdHRlbXB0cycpO1xuXHR9XG5cblx0cHJpdmF0ZSBzY29wZXNNYXRjaChzY29wZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiwgZXhwZWN0ZWRTY29wZXM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGV4cGVjdGVkU2NvcGVzLmV2ZXJ5KHNjb3BlID0+IHNjb3Blcy5pbmNsdWRlcyhzY29wZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRUb2tlbkVudGl0bGVtZW50cyhzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10sIGFjY291bnRQb2xpY3lEYXRhOiBJQWNjb3VudFBvbGljeURhdGEgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8eyBkYXRhOiB7IHBvbGljeURhdGE6IFBhcnRpYWw8SVBvbGljeURhdGE+OyBjb3BpbG90VG9rZW5JbmZvOiBJQ29waWxvdFRva2VuSW5mbyB9IHwgdW5kZWZpbmVkOyBmZXRjaGVkQXQ6IG51bWJlciB9PiB7XG5cdFx0aWYgKCFvcHRpb25zPy5mb3JjZVJlZnJlc2ggJiYgYWNjb3VudFBvbGljeURhdGE/LnRva2VuRW50aXRsZW1lbnRzRmV0Y2hlZEF0ICYmICF0aGlzLmlzRGF0YVN0YWxlKGFjY291bnRQb2xpY3lEYXRhLnRva2VuRW50aXRsZW1lbnRzRmV0Y2hlZEF0KSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFVzaW5nIGxhc3QgZmV0Y2hlZCB0b2tlbiBlbnRpdGxlbWVudHMgZGF0YScpO1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBwb2xpY3lEYXRhOiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLCBjb3BpbG90VG9rZW5JbmZvOiB0aGlzLl9jb3BpbG90VG9rZW5JbmZvID8/IHt9IH0sIGZldGNoZWRBdDogYWNjb3VudFBvbGljeURhdGEudG9rZW5FbnRpdGxlbWVudHNGZXRjaGVkQXQgfTtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMucmVxdWVzdFRva2VuRW50aXRsZW1lbnRzKHNlc3Npb25zKTtcblx0XHRyZXR1cm4geyBkYXRhLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVxdWVzdFRva2VuRW50aXRsZW1lbnRzKHNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSk6IFByb21pc2U8eyBwb2xpY3lEYXRhOiBQYXJ0aWFsPElQb2xpY3lEYXRhPjsgY29waWxvdFRva2VuSW5mbzogSUNvcGlsb3RUb2tlbkluZm8gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRva2VuRW50aXRsZW1lbnRzVXJsID0gdGhpcy5nZXRUb2tlbkVudGl0bGVtZW50VXJsKCk7XG5cdFx0aWYgKCF0b2tlbkVudGl0bGVtZW50c1VybCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIE5vIHRva2VuIGVudGl0bGVtZW50cyBVUkwgZm91bmQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIEZldGNoaW5nIHRva2VuIGVudGl0bGVtZW50cyBmcm9tOicsIHRva2VuRW50aXRsZW1lbnRzVXJsKTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdCh0b2tlbkVudGl0bGVtZW50c1VybCwgJ0dFVCcsIHVuZGVmaW5lZCwgc2Vzc2lvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdkZWZhdWx0QWNjb3VudC50b2tlbkVudGl0bGVtZW50cycpO1xuXHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlICYmIHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0RlZmF1bHRBY2NvdW50XSB1bmV4cGVjdGVkIHN0YXR1cyBjb2RlICR7cmVzcG9uc2UucmVzLnN0YXR1c0NvZGV9IHdoaWxlIGZldGNoaW5nIHRva2VuIGVudGl0bGVtZW50c2ApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2hhdERhdGEgPSBhd2FpdCBhc0pzb248SVRva2VuRW50aXRsZW1lbnRzUmVzcG9uc2U+KHJlc3BvbnNlKTtcblx0XHRcdGlmIChjaGF0RGF0YSkge1xuXHRcdFx0XHRjb25zdCB0b2tlbk1hcCA9IHRoaXMuZXh0cmFjdEZyb21Ub2tlbihjaGF0RGF0YS50b2tlbik7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cG9saWN5RGF0YToge1xuXHRcdFx0XHRcdFx0Ly8gRWRpdG9yIHByZXZpZXcgZmVhdHVyZXMgYXJlIGRpc2FibGVkIGlmIHRoZSBmbGFnIGlzIHByZXNlbnQgYW5kIHNldCB0byAwXG5cdFx0XHRcdFx0XHRjaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZDogdG9rZW5NYXAuZ2V0KCdlZGl0b3JfcHJldmlld19mZWF0dXJlcycpICE9PSAnMCcsXG5cdFx0XHRcdFx0XHRjaGF0X2FnZW50X2VuYWJsZWQ6IHRva2VuTWFwLmdldCgnYWdlbnRfbW9kZScpICE9PSAnMCcsXG5cdFx0XHRcdFx0XHQvLyBNQ1AgaXMgb25seSBlbmFibGVkIGlmIHRoZSBmbGFnIGlzIGV4cGxpY2l0bHkgcHJlc2VudCBhbmQgc2V0IHRvIDFcblx0XHRcdFx0XHRcdG1jcDogdG9rZW5NYXAuZ2V0KCdtY3AnKSA9PT0gJzEnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29waWxvdFRva2VuSW5mbzoge1xuXHRcdFx0XHRcdFx0c246IHRva2VuTWFwLmdldCgnc24nKSxcblx0XHRcdFx0XHRcdGZjdjE6IHRva2VuTWFwLmdldCgnZmN2MScpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCB0b2tlbiBlbnRpdGxlbWVudHMnLCAnTm8gZGF0YSByZXR1cm5lZCcpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCB0b2tlbiBlbnRpdGxlbWVudHMnLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFbnRpdGxlbWVudHMoc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCBhY2NvdW50UG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPHsgZGF0YTogSUVudGl0bGVtZW50c0RhdGEgfCB1bmRlZmluZWQgfCBudWxsOyBmZXRjaGVkQXQ6IG51bWJlciB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgYWNjb3VudElkID0gc2Vzc2lvbnNbMF0uYWNjb3VudC5pZDtcblx0XHRjb25zdCBleGlzdGluZ0RhdGEgPSB0aGlzLl9kZWZhdWx0QWNjb3VudD8uYWNjb3VudElkID09PSBhY2NvdW50SWQgPyB0aGlzLl9kZWZhdWx0QWNjb3VudD8uZGVmYXVsdEFjY291bnQuZW50aXRsZW1lbnRzRGF0YSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIW9wdGlvbnM/LmZvcmNlUmVmcmVzaCAmJiBleGlzdGluZ0RhdGEgJiYgYWNjb3VudFBvbGljeURhdGE/LmVudGl0bGVtZW50c0ZldGNoZWRBdCAmJiAhdGhpcy5pc0RhdGFTdGFsZShhY2NvdW50UG9saWN5RGF0YS5lbnRpdGxlbWVudHNGZXRjaGVkQXQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gVXNpbmcgbGFzdCBmZXRjaGVkIGVudGl0bGVtZW50cyBkYXRhJyk7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiBleGlzdGluZ0RhdGEsIGZldGNoZWRBdDogYWNjb3VudFBvbGljeURhdGEuZW50aXRsZW1lbnRzRmV0Y2hlZEF0IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50aXRsZW1lbnRVcmwgPSB0aGlzLmdldEVudGl0bGVtZW50VXJsKCk7XG5cdFx0aWYgKCFlbnRpdGxlbWVudFVybCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIE5vIGNoYXQgZW50aXRsZW1lbnRzIFVSTCBmb3VuZCcpO1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogdW5kZWZpbmVkLCBmZXRjaGVkQXQ6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBGZXRjaGluZyBlbnRpdGxlbWVudHMgZnJvbTonLCBlbnRpdGxlbWVudFVybCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3QoZW50aXRsZW1lbnRVcmwsICdHRVQnLCB1bmRlZmluZWQsIHNlc3Npb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnZGVmYXVsdEFjY291bnQuZW50aXRsZW1lbnRzJyk7XG5cdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogdW5kZWZpbmVkLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfTtcblx0XHR9XG5cblx0XHRpZiAocmVzcG9uc2UucmVzLnN0YXR1c0NvZGUgJiYgcmVzcG9uc2UucmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbRGVmYXVsdEFjY291bnRdIHVuZXhwZWN0ZWQgc3RhdHVzIGNvZGUgJHtyZXNwb25zZS5yZXMuc3RhdHVzQ29kZX0gd2hpbGUgZmV0Y2hpbmcgZW50aXRsZW1lbnRzYCk7XG5cdFx0XHRjb25zdCBkYXRhID0gKFxuXHRcdFx0XHRyZXNwb25zZS5yZXMuc3RhdHVzQ29kZSA9PT0gNDAxIHx8IFx0Ly8gb2F1dGggdG9rZW4gYmVpbmcgdW5hdmFpbGFibGUgKGV4cGlyZWQvcmV2b2tlZClcblx0XHRcdFx0cmVzcG9uc2UucmVzLnN0YXR1c0NvZGUgPT09IDQwNFx0XHQvLyBtaXNzaW5nIHNjb3Blcy9wZXJtaXNzaW9ucywgc2VydmljZSBwcmV0ZW5kcyB0aGUgZW5kcG9pbnQgZG9lc24ndCBleGlzdFxuXHRcdFx0KSA/IG51bGwgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4geyBkYXRhLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGFzSnNvbjxJRW50aXRsZW1lbnRzRGF0YT4ocmVzcG9uc2UpO1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIHsgZGF0YSwgZmV0Y2hlZEF0OiBEYXRlLm5vdygpIH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIGZldGNoIGVudGl0bGVtZW50cycsICdObyBkYXRhIHJldHVybmVkJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0RlZmF1bHRBY2NvdW50XSBGYWlsZWQgdG8gZmV0Y2ggZW50aXRsZW1lbnRzJywgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGRhdGE6IHVuZGVmaW5lZCwgZmV0Y2hlZEF0OiBEYXRlLm5vdygpIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1jcFJlZ2lzdHJ5UHJvdmlkZXIoc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCBhY2NvdW50UG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPHsgZGF0YTogSU1jcFJlZ2lzdHJ5UHJvdmlkZXIgfCBudWxsOyBmZXRjaGVkQXQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFvcHRpb25zPy5mb3JjZVJlZnJlc2ggJiYgYWNjb3VudFBvbGljeURhdGE/Lm1jcFJlZ2lzdHJ5RGF0YUZldGNoZWRBdCAmJiAhdGhpcy5pc0RhdGFTdGFsZShhY2NvdW50UG9saWN5RGF0YS5tY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gVXNpbmcgbGFzdCBmZXRjaGVkIE1DUCByZWdpc3RyeSBkYXRhJyk7XG5cdFx0XHRjb25zdCBkYXRhID0gYWNjb3VudFBvbGljeURhdGEucG9saWN5RGF0YS5tY3BSZWdpc3RyeVVybCAmJiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLm1jcEFjY2VzcyA/IHsgdXJsOiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLm1jcFJlZ2lzdHJ5VXJsLCByZWdpc3RyeV9hY2Nlc3M6IGFjY291bnRQb2xpY3lEYXRhLnBvbGljeURhdGEubWNwQWNjZXNzIH0gOiBudWxsO1xuXHRcdFx0cmV0dXJuIHsgZGF0YSwgZmV0Y2hlZEF0OiBhY2NvdW50UG9saWN5RGF0YS5tY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQgfTtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMucmVxdWVzdE1jcFJlZ2lzdHJ5UHJvdmlkZXIoc2Vzc2lvbnMpO1xuXHRcdHJldHVybiAhaXNVbmRlZmluZWQoZGF0YSkgPyB7IGRhdGEsIGZldGNoZWRBdDogRGF0ZS5ub3coKSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXF1ZXN0TWNwUmVnaXN0cnlQcm92aWRlcihzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiBQcm9taXNlPElNY3BSZWdpc3RyeVByb3ZpZGVyIHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG1jcFJlZ2lzdHJ5RGF0YVVybCA9IHRoaXMuZ2V0TWNwUmVnaXN0cnlEYXRhVXJsKCk7XG5cdFx0aWYgKCFtY3BSZWdpc3RyeURhdGFVcmwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBObyBNQ1AgcmVnaXN0cnkgZGF0YSBVUkwgZm91bmQnKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBGZXRjaGluZyBNQ1AgcmVnaXN0cnkgZGF0YSBmcm9tOicsIG1jcFJlZ2lzdHJ5RGF0YVVybCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3QobWNwUmVnaXN0cnlEYXRhVXJsLCAnR0VUJywgdW5kZWZpbmVkLCBzZXNzaW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ2RlZmF1bHRBY2NvdW50Lm1jcFJlZ2lzdHJ5UHJvdmlkZXInKTtcblx0XHRpZiAoIXJlc3BvbnNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghaXNTdWNjZXNzKHJlc3BvbnNlKSkge1xuXHRcdFx0aWYgKGlzQ2xpZW50RXJyb3IocmVzcG9uc2UpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0RlZmF1bHRBY2NvdW50XSBSZWNlaXZlZCAke3Jlc3BvbnNlLnJlcy5zdGF0dXNDb2RlfSBmb3IgTUNQIHJlZ2lzdHJ5IGRhdGEsIHRyZWF0aW5nIGFzIG5vIHJlZ2lzdHJ5IGF2YWlsYWJsZS5gKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWZhdWx0QWNjb3VudF0gdW5leHBlY3RlZCBzdGF0dXMgY29kZSAke3Jlc3BvbnNlLnJlcy5zdGF0dXNDb2RlfSB3aGlsZSBmZXRjaGluZyBNQ1AgcmVnaXN0cnkgZGF0YWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGFzSnNvbjxJTWNwUmVnaXN0cnlSZXNwb25zZT4ocmVzcG9uc2UpO1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdGZXRjaGVkIE1DUCByZWdpc3RyeSBwcm92aWRlcnMnLCBkYXRhLm1jcF9yZWdpc3RyaWVzKTtcblx0XHRcdFx0cmV0dXJuIGRhdGEubWNwX3JlZ2lzdHJpZXNbMF0gPz8gbnVsbDtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnTm8gTUNQIHJlZ2lzdHJ5IHByb3ZpZGVycyBjb250ZW50IGZvdW5kIGluIHJlc3BvbnNlJyk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gZmV0Y2ggTUNQIHJlZ2lzdHJ5IHByb3ZpZGVycycsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1hbmFnZWRTZXR0aW5ncyhzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10sIGFjY291bnRQb2xpY3lEYXRhOiBJQWNjb3VudFBvbGljeURhdGEgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8eyBkYXRhOiBQYXJ0aWFsPElQb2xpY3lEYXRhPiB8IHVuZGVmaW5lZDsgZmV0Y2hlZEF0OiBudW1iZXIgfT4ge1xuXHRcdGlmICghb3B0aW9ucz8uZm9yY2VSZWZyZXNoICYmIGFjY291bnRQb2xpY3lEYXRhPy5tYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQgJiYgIXRoaXMuaXNEYXRhU3RhbGUoYWNjb3VudFBvbGljeURhdGEubWFuYWdlZFNldHRpbmdzRmV0Y2hlZEF0KSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFVzaW5nIGxhc3QgZmV0Y2hlZCBtYW5hZ2VkIHNldHRpbmdzIGRhdGEnKTtcblx0XHRcdC8vIFNlZWQgc3RhdHVzIHNvIFBvbGljeSBEaWFnbm9zdGljcyByZWZsZWN0cyBcImFwcGxpZWRcIiByYXRoZXIgdGhhblxuXHRcdFx0Ly8gXCJub3QgeWV0IGZldGNoZWRcIiBhZnRlciBhIHByb2Nlc3MgcmVzdGFydCB0aGF0IHdhcm0tc3RhcnRzIGZyb21cblx0XHRcdC8vIHRoZSBjYWNoZWQgcG9saWN5IHBheWxvYWQuXG5cdFx0XHR0aGlzLl9tYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyA9ICdvayc7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmV0Y2hlZEF0OiBhY2NvdW50UG9saWN5RGF0YS5tYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5yZXF1ZXN0TWFuYWdlZFNldHRpbmdzKHNlc3Npb25zKTtcblx0XHRyZXR1cm4geyBkYXRhLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVxdWVzdE1hbmFnZWRTZXR0aW5ncyhzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiBQcm9taXNlPFBhcnRpYWw8SVBvbGljeURhdGE+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbWFuYWdlZFNldHRpbmdzVXJsID0gdGhpcy5nZXRNYW5hZ2VkU2V0dGluZ3NVcmwoKTtcblx0XHRpZiAoIW1hbmFnZWRTZXR0aW5nc1VybCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIE5vIG1hbmFnZWQgc2V0dGluZ3MgVVJMIGNvbmZpZ3VyZWQ7IHNraXBwaW5nIGVudGVycHJpc2UgcG9saWN5IGZldGNoJyk7XG5cdFx0XHR0aGlzLl9tYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyA9ICduby11cmwnO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gRmV0Y2hpbmcgbWFuYWdlZCBzZXR0aW5ncyBmcm9tOicsIG1hbmFnZWRTZXR0aW5nc1VybCk7XG5cdFx0Y29uc3QgcmF0ZUxpbWl0QmFja29mZkFjdGl2ZSA9IERhdGUubm93KCkgPCB0aGlzLl9yYXRlTGltaXRCYWNrb2ZmVW50aWw7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3QobWFuYWdlZFNldHRpbmdzVXJsLCAnR0VUJywgdW5kZWZpbmVkLCBzZXNzaW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ2RlZmF1bHRBY2NvdW50Lm1hbmFnZWRTZXR0aW5ncycsIE1BTkFHRURfU0VUVElOR1NfUkVRVUVTVF9USU1FT1VUX01TKTtcblx0XHRpZiAoIXJlc3BvbnNlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyBmZXRjaCByZXR1cm5lZCBubyByZXNwb25zZSAobmV0d29yayBlcnJvciwgYWxsIHNlc3Npb25zIHJlamVjdGVkLCBvciBhY3RpdmUgcmF0ZS1saW1pdCBiYWNrb2ZmKTsgZmFsbGluZyBiYWNrIHRvIGxvY2FsLW9ubHkgcG9saWN5Jyk7XG5cdFx0XHR0aGlzLnJlcG9ydE1hbmFnZWRTZXR0aW5nc091dGNvbWUoJ25vLXJlc3BvbnNlJywgcmF0ZUxpbWl0QmFja29mZkFjdGl2ZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEFueSBub24tMnh4IHJlc3BvbnNlIG1lYW5zIFwiZmFsbCBiYWNrIHRvIGxvY2FsIHNldHRpbmdzIG9ubHkgYW5kIGNvbnRpbnVlXG5cdFx0Ly8gb3BlcmF0aW5nIG5vcm1hbGx5XCIgXHUyMDE0IHNpbGVudCBmYWxsYmFjaywgbm8gcG9saWN5LlxuXHRcdGlmICghaXNTdWNjZXNzKHJlc3BvbnNlKSkge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gcmVzcG9uc2UucmVzLnN0YXR1c0NvZGUgPz8gMDtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbRGVmYXVsdEFjY291bnRdIE1hbmFnZWQgc2V0dGluZ3MgZmV0Y2ggcmV0dXJuZWQgbm9uLXN1Y2Nlc3Mgc3RhdHVzICR7c3RhdHVzfTsgZmFsbGluZyBiYWNrIHRvIGxvY2FsLW9ubHkgcG9saWN5YCk7XG5cdFx0XHR0aGlzLnJlcG9ydE1hbmFnZWRTZXR0aW5nc091dGNvbWUoc3RhdHVzLCByYXRlTGltaXRCYWNrb2ZmQWN0aXZlKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBhc0pzb248SU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlPihyZXNwb25zZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyByYXcgcmVzcG9uc2U6JywgSlNPTi5zdHJpbmdpZnkoZGF0YSA/PyBudWxsKSk7XG5cdFx0XHR0aGlzLl9tYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZSA9IGRhdGEgPz8gbnVsbDtcblx0XHRcdGNvbnN0IGFkYXB0ZWQgPSBhZGFwdE1hbmFnZWRTZXR0aW5ncyhkYXRhID8/IHt9LCBtc2cgPT4gdGhpcy5sb2dTZXJ2aWNlLndhcm4obXNnKSk7XG5cdFx0XHQvLyBBbiBlbXB0eSByZXNwb25zZSAoYHt9YCkgaXMgYSBzdWNjZXNzZnVsIFwibm8gcG9saWN5IGZpbGUgcHJlc2VudFwiIHNpZ25hbC5cblx0XHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc0NvdW50ID0gYWRhcHRlZC5tYW5hZ2VkU2V0dGluZ3MgPyBPYmplY3Qua2V5cyhhZGFwdGVkLm1hbmFnZWRTZXR0aW5ncykubGVuZ3RoIDogMDtcblx0XHRcdGlmIChtYW5hZ2VkU2V0dGluZ3NDb3VudCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyBmZXRjaGVkIChlbXB0eSByZXNwb25zZSBcdTIwMTQgbm8gZW50ZXJwcmlzZSBwb2xpY3kgZmlsZSBwcmVzZW50KScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyBhcHBsaWVkJyk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0RlZmF1bHRBY2NvdW50XSBNYW5hZ2VkIHNldHRpbmdzIHBheWxvYWQ6JywgSlNPTi5zdHJpbmdpZnkoYWRhcHRlZCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZXBvcnRNYW5hZ2VkU2V0dGluZ3NPdXRjb21lKCdvaycsIHJhdGVMaW1pdEJhY2tvZmZBY3RpdmUpO1xuXHRcdFx0cmV0dXJuIGFkYXB0ZWQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0RlZmF1bHRBY2NvdW50XSBGYWlsZWQgdG8gcGFyc2UgbWFuYWdlZCBzZXR0aW5ncyByZXNwb25zZScsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0dGhpcy5yZXBvcnRNYW5hZ2VkU2V0dGluZ3NPdXRjb21lKCdwYXJzZS1lcnJvcicsIHJhdGVMaW1pdEJhY2tvZmZBY3RpdmUpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydE1hbmFnZWRTZXR0aW5nc091dGNvbWUoc3RhdHVzOiBFeGNsdWRlPE1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzLCBudWxsIHwgJ25vLXVybCc+LCByYXRlTGltaXRCYWNrb2ZmQWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMgPSBzdGF0dXM7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8TWFuYWdlZFNldHRpbmdzRmV0Y2hUZWxlbWV0cnksIE1hbmFnZWRTZXR0aW5nc0ZldGNoVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdkZWZhdWx0YWNjb3VudDptYW5hZ2VkU2V0dGluZ3M6ZmV0Y2gnLCB7XG5cdFx0XHRvdXRjb21lOiB0eXBlb2Ygc3RhdHVzID09PSAnbnVtYmVyJyA/IGBzdGF0dXM6JHtzdGF0dXN9YCA6IHN0YXR1cyxcblx0XHRcdHJhdGVMaW1pdEJhY2tvZmZBY3RpdmUsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZWN0cyBhIHJhdGUtbGltaXRlZCBHaXRIdWIgcmVzcG9uc2UuIE1pcnJvcnMgdGhlIHB1YmxpYy1BUEkgY2hlY2sgaW5cblx0ICogYGdpdGh1YlJlcG9GZXRjaGVyLnRzYDpcblx0ICogLSBDYW5vbmljYWwgYDQyOSBUb28gTWFueSBSZXF1ZXN0c2AuXG5cdCAqIC0gUHJpbWFyeSBxdW90YSBleGhhdXN0aW9uOiBgNDAzYCB3aXRoIGBYLVJhdGVMaW1pdC1SZW1haW5pbmc6IDBgLlxuXHQgKiAtIFNlY29uZGFyeSB0aHJvdHRsaW5nOiBHaXRIdWIgb21pdHMgYFgtUmF0ZUxpbWl0LVJlbWFpbmluZ2AgYnV0IHNldHNcblx0ICogICBgUmV0cnktQWZ0ZXJgIChvbiBhIG5vbi0yeHggcmVzcG9uc2UpLiBXZSB0cmVhdCBhbnkgbm9uLXN1Y2Nlc3Mgc3RhdHVzXG5cdCAqICAgdGhhdCBjYXJyaWVzIGBSZXRyeS1BZnRlcmAgYXMgYSBiYWNrLW9mZiBzaWduYWwuXG5cdCAqL1xuXHRwcml2YXRlIGlzUmF0ZUxpbWl0ZWQocmVzcG9uc2U6IElSZXF1ZXN0Q29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXR1cyA9IHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlO1xuXHRcdGlmIChzdGF0dXMgPT09IDQyOSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzdGF0dXMgPT09IDQwMyAmJiByZWFkSGVhZGVyKHJlc3BvbnNlLnJlcy5oZWFkZXJzLCAneC1yYXRlbGltaXQtcmVtYWluaW5nJykgPT09ICcwJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdC8vIFNlY29uZGFyeSByYXRlIGxpbWl0OiB0aGUgc2VydmVyIGV4cGxpY2l0bHkgYXNrcyB0aGUgY2xpZW50IHRvIHdhaXQsXG5cdFx0Ly8gcmVnYXJkbGVzcyBvZiB3aGljaCBub24tMnh4IGNvZGUgaXQgcmV0dXJuZWQgd2l0aC5cblx0XHRpZiAoIWlzU3VjY2VzcyhyZXNwb25zZSkgJiYgcmVhZEhlYWRlcihyZXNwb25zZS5yZXMuaGVhZGVycywgJ3JldHJ5LWFmdGVyJykgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3JhdGVMaW1pdEJhY2tvZmZVbnRpbCA9IDA7XG5cblx0cHJpdmF0ZSBhc3luYyByZXF1ZXN0KHVybDogc3RyaW5nLCB0eXBlOiAnR0VUJywgYm9keTogdW5kZWZpbmVkLCBzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY2FsbFNpdGU6IHN0cmluZywgcmVxdWVzdFRpbWVvdXRNcz86IG51bWJlcik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBhc3luYyByZXF1ZXN0KHVybDogc3RyaW5nLCB0eXBlOiAnUE9TVCcsIGJvZHk6IG9iamVjdCwgc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNhbGxTaXRlOiBzdHJpbmcsIHJlcXVlc3RUaW1lb3V0TXM/OiBudW1iZXIpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dCB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgYXN5bmMgcmVxdWVzdCh1cmw6IHN0cmluZywgdHlwZTogJ0dFVCcgfCAnUE9TVCcsIGJvZHk6IG9iamVjdCB8IHVuZGVmaW5lZCwgc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNhbGxTaXRlOiBzdHJpbmcsIHJlcXVlc3RUaW1lb3V0TXM/OiBudW1iZXIpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dCB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFJhdGUtbGltaXQgYmFja29mZjogd2hlbiBhbnkgcHJpb3IgYC9jb3BpbG90X2ludGVybmFsLypgIHJlcXVlc3Qgd2FzXG5cdFx0Ly8gdGhyb3R0bGVkICg0Mjkgb3IgNDAzICsgYFgtUmF0ZUxpbWl0LVJlbWFpbmluZzogMGApLCBldmVyeSBzdWJzZXF1ZW50XG5cdFx0Ly8gcmVxdWVzdCBpcyBzaG9ydC1jaXJjdWl0ZWQgdW50aWwgdGhlIHBhcnNlZCBgUmV0cnktQWZ0ZXJgIGVsYXBzZXMuXG5cdFx0Ly8gQWxsIGVuZHBvaW50cyBjYWxsZWQgZnJvbSBoZXJlIHNoYXJlIHRoZSBzYW1lIGhvc3QgYW5kIGJlYXJlciB0b2tlbixcblx0XHQvLyBzbyBiYWNraW5nIG9mZiB0aGUgYnVja2V0IGFzIGEgd2hvbGUgYXZvaWRzIHBpbGluZyBvbiBhIHNlcnZlciB0aGF0XG5cdFx0Ly8gaGFzIGFscmVhZHkgYXNrZWQgdXMgdG8gc2xvdyBkb3duLiBTZWUgYGdpdGh1YlJlcG9GZXRjaGVyLnRzYCBmb3IgdGhlXG5cdFx0Ly8gcHVibGljLUFQSSBhbmFsb2d1ZS5cblx0XHRpZiAoRGF0ZS5ub3coKSA8IHRoaXMuX3JhdGVMaW1pdEJhY2tvZmZVbnRpbCkge1xuXHRcdFx0Y29uc3QgcmVtYWluaW5nU2VjID0gTWF0aC5jZWlsKCh0aGlzLl9yYXRlTGltaXRCYWNrb2ZmVW50aWwgLSBEYXRlLm5vdygpKSAvIDEwMDApO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRGVmYXVsdEFjY291bnRdIFNraXBwaW5nIHJlcXVlc3QgdG8gJHt1cmx9IFx1MjAxNCByYXRlLWxpbWl0IGJhY2tvZmYgYWN0aXZlIGZvciAke3JlbWFpbmluZ1NlY31zIG1vcmVgKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGxhc3RSZXNwb25zZTogSVJlcXVlc3RDb250ZXh0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RSZXNwb25zZTtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0XHRcdHR5cGUsXG5cdFx0XHRcdFx0dXJsLFxuXHRcdFx0XHRcdGRhdGE6IHR5cGUgPT09ICdQT1NUJyA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc2FibGVDYWNoZTogdHJ1ZSxcblx0XHRcdFx0XHR0aW1lb3V0OiByZXF1ZXN0VGltZW91dE1zLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3Nlc3Npb24uYWNjZXNzVG9rZW59YFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2FsbFNpdGVcblx0XHRcdFx0fSwgdG9rZW4pO1xuXG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlO1xuXHRcdFx0XHRpZiAodGhpcy5pc1JhdGVMaW1pdGVkKHJlc3BvbnNlKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJldHJ5QWZ0ZXJTZWMgPSByZXRyeUFmdGVyRnJvbUhlYWRlcnMocmVzcG9uc2UucmVzLmhlYWRlcnMpID8/IDYwO1xuXHRcdFx0XHRcdHRoaXMuX3JhdGVMaW1pdEJhY2tvZmZVbnRpbCA9IERhdGUubm93KCkgKyByZXRyeUFmdGVyU2VjICogMTAwMDtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0RlZmF1bHRBY2NvdW50XSBSYXRlIGxpbWl0ZWQgYnkgJHt1cmx9IChzdGF0dXMgJHtzdGF0dXN9KTsgYmFja2luZyBvZmYgZm9yICR7cmV0cnlBZnRlclNlY31zYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGF0dXMgPT09IDQwMSB8fCBzdGF0dXMgPT09IDQwNCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0RlZmF1bHRBY2NvdW50XSBSZWNlaXZlZCAke3N0YXR1c30gZm9yIFVSTCAke3VybH0gd2l0aCBzZXNzaW9uICR7c2Vzc2lvbi5pZH0sIGxpa2VseSBkdWUgdG8gZXhwaXJlZC9yZXZva2VkIHRva2VuIG9yIGluc3VmZmljaWVudCBwZXJtaXNzaW9ucy5gLCAnVHJ5aW5nIG5leHQgc2Vzc2lvbiBpZiBhdmFpbGFibGUuJyk7XG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlID0gcmVzcG9uc2U7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIHRyeSBuZXh0IHNlc3Npb25cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtEZWZhdWx0QWNjb3VudF0gcmVxdWVzdDogZXJyb3IgJHtlcnJvcn1gLCB1cmwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFsYXN0UmVzcG9uc2UpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0RlZmF1bHRBY2NvdW50XTogTm8gcmVzcG9uc2UgcmVjZWl2ZWQgZm9yIHJlcXVlc3QnLCB1cmwpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGFzdFJlc3BvbnNlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0RhdGFTdGFsZShmZXRjaGVkQXQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoRGF0ZS5ub3coKSAtIGZldGNoZWRBdCkgPj0gQUNDT1VOVF9EQVRBX1BPTExfSU5URVJWQUxfTVM7XG5cdH1cblxuXHRwcml2YXRlIGdldEVudGl0bGVtZW50VXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkuZW50ZXJwcmlzZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZW50ZXJwcmlzZVVybCA9IHRoaXMuZ2V0RW50ZXJwcmlzZVVybCgpO1xuXHRcdFx0XHRpZiAoIWVudGVycHJpc2VVcmwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBgJHtlbnRlcnByaXNlVXJsLnByb3RvY29sfS8vYXBpLiR7ZW50ZXJwcmlzZVVybC5ob3N0bmFtZX0ke2VudGVycHJpc2VVcmwucG9ydCA/ICc6JyArIGVudGVycHJpc2VVcmwucG9ydCA6ICcnfS9jb3BpbG90X2ludGVybmFsL3VzZXJgO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5lbnRpdGxlbWVudFVybDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9rZW5FbnRpdGxlbWVudFVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpLmVudGVycHJpc2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVudGVycHJpc2VVcmwgPSB0aGlzLmdldEVudGVycHJpc2VVcmwoKTtcblx0XHRcdFx0aWYgKCFlbnRlcnByaXNlVXJsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYCR7ZW50ZXJwcmlzZVVybC5wcm90b2NvbH0vL2FwaS4ke2VudGVycHJpc2VVcmwuaG9zdG5hbWV9JHtlbnRlcnByaXNlVXJsLnBvcnQgPyAnOicgKyBlbnRlcnByaXNlVXJsLnBvcnQgOiAnJ30vY29waWxvdF9pbnRlcm5hbC92Mi90b2tlbmA7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLnRva2VuRW50aXRsZW1lbnRVcmw7XG5cdH1cblxuXHRwcml2YXRlIGdldE1jcFJlZ2lzdHJ5RGF0YVVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpLmVudGVycHJpc2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVudGVycHJpc2VVcmwgPSB0aGlzLmdldEVudGVycHJpc2VVcmwoKTtcblx0XHRcdFx0aWYgKCFlbnRlcnByaXNlVXJsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYCR7ZW50ZXJwcmlzZVVybC5wcm90b2NvbH0vL2FwaS4ke2VudGVycHJpc2VVcmwuaG9zdG5hbWV9JHtlbnRlcnByaXNlVXJsLnBvcnQgPyAnOicgKyBlbnRlcnByaXNlVXJsLnBvcnQgOiAnJ30vY29waWxvdC9tY3BfcmVnaXN0cnlgO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5tY3BSZWdpc3RyeURhdGFVcmw7XG5cdH1cblxuXHRwcml2YXRlIGdldE1hbmFnZWRTZXR0aW5nc1VybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpLmVudGVycHJpc2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVudGVycHJpc2VVcmwgPSB0aGlzLmdldEVudGVycHJpc2VVcmwoKTtcblx0XHRcdFx0aWYgKCFlbnRlcnByaXNlVXJsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYCR7ZW50ZXJwcmlzZVVybC5wcm90b2NvbH0vL2FwaS4ke2VudGVycHJpc2VVcmwuaG9zdG5hbWV9JHtlbnRlcnByaXNlVXJsLnBvcnQgPyAnOicgKyBlbnRlcnByaXNlVXJsLnBvcnQgOiAnJ30vY29waWxvdF9pbnRlcm5hbC9tYW5hZ2VkX3NldHRpbmdzYDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnRDb25maWcubWFuYWdlZFNldHRpbmdzVXJsO1xuXHR9XG5cblx0Z2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk6IElEZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmVudGVycHJpc2VQcm92aWRlckNvbmZpZykgPT09IHRoaXMuZGVmYXVsdEFjY291bnRDb25maWcuYXV0aGVudGljYXRpb25Qcm92aWRlci5lbnRlcnByaXNlLmlkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi50aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuZW50ZXJwcmlzZSxcblx0XHRcdFx0ZW50ZXJwcmlzZTogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnRoaXMuZGVmYXVsdEFjY291bnRDb25maWcuYXV0aGVudGljYXRpb25Qcm92aWRlci5kZWZhdWx0LFxuXHRcdFx0ZW50ZXJwcmlzZTogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0cmVzb2x2ZUdpdEh1YlVybChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpLmVudGVycHJpc2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVudGVycHJpc2VVcmwgPSB0aGlzLmdldEVudGVycHJpc2VVcmwoKTtcblx0XHRcdFx0aWYgKGVudGVycHJpc2VVcmwpIHtcblx0XHRcdFx0XHRyZXR1cm4gYCR7ZW50ZXJwcmlzZVVybC5wcm90b2NvbH0vLyR7ZW50ZXJwcmlzZVVybC5ob3N0fS8ke3BhdGh9YDtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGZhbGwgdGhyb3VnaCB0byBkZWZhdWx0XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGBodHRwczovL2dpdGh1Yi5jb20vJHtwYXRofWA7XG5cdH1cblxuXHRwcml2YXRlIGdldEVudGVycHJpc2VVcmwoKTogVVJMIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmVudGVycHJpc2VQcm92aWRlclVyaVNldHRpbmcpO1xuXHRcdGlmICghaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFVSTCh2YWx1ZSk7XG5cdH1cblxuXHRhc3luYyBzaWduSW4ob3B0aW9ucz86IHsgYWRkaXRpb25hbFNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdO1trZXk6IHN0cmluZ106IHVua25vd24gfSk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGF1dGhQcm92aWRlciA9IHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk7XG5cdFx0aWYgKCFhdXRoUHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZGVmYXVsdCBhY2NvdW50IHByb3ZpZGVyIGNvbmZpZ3VyZWQnKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBhZGRpdGlvbmFsU2NvcGVzLCAuLi5zZXNzaW9uT3B0aW9ucyB9ID0gb3B0aW9ucyA/PyB7fTtcblx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFNjb3BlcyA9IHRoaXMuZGVmYXVsdEFjY291bnRDb25maWcuYXV0aGVudGljYXRpb25Qcm92aWRlci5zY29wZXNbMF07XG5cdFx0Y29uc3Qgc2NvcGVzID0gYWRkaXRpb25hbFNjb3BlcyA/IGRpc3RpbmN0KFsuLi5kZWZhdWx0QWNjb3VudFNjb3BlcywgLi4uYWRkaXRpb25hbFNjb3Blc10pIDogZGVmYXVsdEFjY291bnRTY29wZXM7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24oYXV0aFByb3ZpZGVyLmlkLCBzY29wZXMsIHNlc3Npb25PcHRpb25zKTtcblx0XHRmb3IgKGNvbnN0IHByZWZlcnJlZEV4dGVuc2lvbiBvZiB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLnByZWZlcnJlZEV4dGVuc2lvbnMpIHtcblx0XHRcdHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS51cGRhdGVBY2NvdW50UHJlZmVyZW5jZShwcmVmZXJyZWRFeHRlbnNpb24sIGF1dGhQcm92aWRlci5pZCwgc2Vzc2lvbi5hY2NvdW50KTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVEZWZhdWx0QWNjb3VudCgpO1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50O1xuXHR9XG5cblx0YXN5bmMgc2lnbk91dCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuZGVmYXVsdEFjY291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX3NpZ25PdXRPZkFjY291bnQnLCB7IHByb3ZpZGVySWQ6IHRoaXMuZGVmYXVsdEFjY291bnQuYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCwgYWNjb3VudExhYmVsOiB0aGlzLmRlZmF1bHRBY2NvdW50LmFjY291bnROYW1lIH0pO1xuXHR9XG5cbn1cblxuY2xhc3MgRGVmYXVsdEFjY291bnRQcm92aWRlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWJ1dGlvbnMuZGVmYXVsdEFjY291bnRQcm92aWRlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnRQcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlZmF1bHRBY2NvdW50UHJvdmlkZXIsIHRvRGVmYXVsdEFjY291bnRDb25maWcocHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudCkpKTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihkZWZhdWx0QWNjb3VudFByb3ZpZGVyKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERFRkFVTFRfQUNDT1VOVF9TSUdOX0lOX0NPTU1BTkQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaWduSW4nLCAnU2lnbiBJbicpLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVmYXVsdEFjY291bnRTZXJ2aWNlKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2lnbkluKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRGVmYXVsdEFjY291bnRQcm92aWRlckNvbnRyaWJ1dGlvbi5JRCwgRGVmYXVsdEFjY291bnRQcm92aWRlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGtCQUFrQixrQkFBa0IsZUFBZTtBQUNyRSxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWE7QUFFdEIsU0FBUyxVQUFVLG1CQUE0QjtBQUUvQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsU0FBa0MsOEJBQTBEO0FBQzVGLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsUUFBUSxpQkFBaUIsZUFBZSxXQUFXLFlBQVksNkJBQTZCO0FBQ3JHLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBOEQsa0NBQWtDLDhCQUE4QjtBQUM5SCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUFzRDtBQXVCeEQsTUFBTSxrQ0FBa0M7QUFF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
