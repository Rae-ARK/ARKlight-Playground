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
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IAuthenticationService, IAuthenticationExtensionsService, INTERNAL_AUTH_PROVIDER_PREFIX } from "../common/authentication.js";
import {
  IAuthenticationQueryService
} from "../common/authenticationQuery.js";
import { IAuthenticationUsageService } from "./authenticationUsageService.js";
import { IAuthenticationMcpUsageService } from "./authenticationMcpUsageService.js";
import { IAuthenticationAccessService } from "./authenticationAccessService.js";
import { IAuthenticationMcpAccessService } from "./authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "./authenticationMcpService.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
class BaseQuery {
  constructor(providerId, queryService) {
    this.providerId = providerId;
    this.queryService = queryService;
  }
}
class AccountExtensionQuery extends BaseQuery {
  constructor(providerId, accountName, extensionId, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
    this.extensionId = extensionId;
  }
  isAccessAllowed() {
    return this.queryService.authenticationAccessService.isAccessAllowed(this.providerId, this.accountName, this.extensionId);
  }
  setAccessAllowed(allowed, extensionName) {
    this.queryService.authenticationAccessService.updateAllowedExtensions(
      this.providerId,
      this.accountName,
      [{ id: this.extensionId, name: extensionName || this.extensionId, allowed }]
    );
  }
  addUsage(scopes, extensionName) {
    this.queryService.authenticationUsageService.addAccountUsage(
      this.providerId,
      this.accountName,
      scopes,
      this.extensionId,
      extensionName
    );
  }
  getUsage() {
    const allUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    return allUsages.filter((usage) => usage.extensionId === ExtensionIdentifier.toKey(this.extensionId)).map((usage) => ({
      extensionId: usage.extensionId,
      extensionName: usage.extensionName,
      scopes: usage.scopes || [],
      lastUsed: usage.lastUsed
    }));
  }
  removeUsage() {
    const allUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    const filteredUsages = allUsages.filter((usage) => usage.extensionId !== this.extensionId);
    this.queryService.authenticationUsageService.removeAccountUsage(this.providerId, this.accountName);
    for (const usage of filteredUsages) {
      this.queryService.authenticationUsageService.addAccountUsage(
        this.providerId,
        this.accountName,
        usage.scopes || [],
        usage.extensionId,
        usage.extensionName
      );
    }
  }
  setAsPreferred() {
    this.queryService.authenticationExtensionsService.updateAccountPreference(
      this.extensionId,
      this.providerId,
      { label: this.accountName, id: this.accountName }
    );
  }
  isPreferred() {
    const preferredAccount = this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
    return preferredAccount === this.accountName;
  }
  isTrusted() {
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    const extension = allowedExtensions.find((ext) => ext.id === this.extensionId);
    return extension?.trusted === true;
  }
}
class AccountMcpServerQuery extends BaseQuery {
  constructor(providerId, accountName, mcpServerId, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
    this.mcpServerId = mcpServerId;
  }
  isAccessAllowed() {
    return this.queryService.authenticationMcpAccessService.isAccessAllowed(this.providerId, this.accountName, this.mcpServerId);
  }
  setAccessAllowed(allowed, mcpServerName) {
    this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(
      this.providerId,
      this.accountName,
      [{ id: this.mcpServerId, name: mcpServerName || this.mcpServerId, allowed }]
    );
  }
  addUsage(scopes, mcpServerName) {
    this.queryService.authenticationMcpUsageService.addAccountUsage(
      this.providerId,
      this.accountName,
      scopes,
      this.mcpServerId,
      mcpServerName
    );
  }
  getUsage() {
    const allUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    return allUsages.filter((usage) => usage.mcpServerId === this.mcpServerId).map((usage) => ({
      mcpServerId: usage.mcpServerId,
      mcpServerName: usage.mcpServerName,
      scopes: usage.scopes || [],
      lastUsed: usage.lastUsed
    }));
  }
  removeUsage() {
    const allUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    const filteredUsages = allUsages.filter((usage) => usage.mcpServerId !== this.mcpServerId);
    this.queryService.authenticationMcpUsageService.removeAccountUsage(this.providerId, this.accountName);
    for (const usage of filteredUsages) {
      this.queryService.authenticationMcpUsageService.addAccountUsage(
        this.providerId,
        this.accountName,
        usage.scopes || [],
        usage.mcpServerId,
        usage.mcpServerName
      );
    }
  }
  setAsPreferred() {
    this.queryService.authenticationMcpService.updateAccountPreference(
      this.mcpServerId,
      this.providerId,
      { label: this.accountName, id: this.accountName }
    );
  }
  isPreferred() {
    const preferredAccount = this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
    return preferredAccount === this.accountName;
  }
  isTrusted() {
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
    const mcpServer = allowedMcpServers.find((server) => server.id === this.mcpServerId);
    return mcpServer?.trusted === true;
  }
}
class AccountExtensionsQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  getAllowedExtensions() {
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    const usages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    return allowedExtensions.filter((ext) => ext.allowed !== false).map((ext) => {
      const extensionUsages = usages.filter((usage) => usage.extensionId === ext.id);
      const lastUsed = extensionUsages.length > 0 ? Math.max(...extensionUsages.map((u) => u.lastUsed)) : void 0;
      const extensionQuery = new AccountExtensionQuery(this.providerId, this.accountName, ext.id, this.queryService);
      const trusted = extensionQuery.isTrusted();
      return {
        id: ext.id,
        name: ext.name,
        allowed: ext.allowed,
        lastUsed,
        trusted
      };
    });
  }
  allowAccess(extensionIds) {
    const extensionsToAllow = extensionIds.map((id) => ({ id, name: id, allowed: true }));
    this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToAllow);
  }
  removeAccess(extensionIds) {
    const extensionsToRemove = extensionIds.map((id) => ({ id, name: id, allowed: false }));
    this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToRemove);
  }
  forEach(callback) {
    const usages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    const extensionIds = /* @__PURE__ */ new Set();
    usages.forEach((usage) => extensionIds.add(usage.extensionId));
    allowedExtensions.forEach((ext) => extensionIds.add(ext.id));
    for (const extensionId of extensionIds) {
      const extensionQuery = new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
      callback(extensionQuery);
    }
  }
}
class AccountMcpServersQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  getAllowedMcpServers() {
    return this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName).filter((server) => server.allowed !== false);
  }
  allowAccess(mcpServerIds) {
    const mcpServersToAllow = mcpServerIds.map((id) => ({ id, name: id, allowed: true }));
    this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToAllow);
  }
  removeAccess(mcpServerIds) {
    const mcpServersToRemove = mcpServerIds.map((id) => ({ id, name: id, allowed: false }));
    this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToRemove);
  }
  forEach(callback) {
    const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
    const mcpServerIds = /* @__PURE__ */ new Set();
    usages.forEach((usage) => mcpServerIds.add(usage.mcpServerId));
    allowedMcpServers.forEach((server) => mcpServerIds.add(server.id));
    for (const mcpServerId of mcpServerIds) {
      const mcpServerQuery = new AccountMcpServerQuery(this.providerId, this.accountName, mcpServerId, this.queryService);
      callback(mcpServerQuery);
    }
  }
}
class AccountEntitiesQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  hasAnyUsage() {
    const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    if (extensionUsages.length > 0) {
      return true;
    }
    const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    if (mcpUsages.length > 0) {
      return true;
    }
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    if (allowedExtensions.some((ext) => ext.allowed !== false)) {
      return true;
    }
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
    if (allowedMcpServers.some((server) => server.allowed !== false)) {
      return true;
    }
    return false;
  }
  getEntityCount() {
    const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName).filter((ext) => ext.allowed);
    const extensionIds = /* @__PURE__ */ new Set();
    extensionUsages.forEach((usage) => extensionIds.add(usage.extensionId));
    allowedExtensions.forEach((ext) => extensionIds.add(ext.id));
    const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName).filter((server) => server.allowed);
    const mcpServerIds = /* @__PURE__ */ new Set();
    mcpUsages.forEach((usage) => mcpServerIds.add(usage.mcpServerId));
    allowedMcpServers.forEach((server) => mcpServerIds.add(server.id));
    const extensionCount = extensionIds.size;
    const mcpServerCount = mcpServerIds.size;
    return {
      extensions: extensionCount,
      mcpServers: mcpServerCount,
      total: extensionCount + mcpServerCount
    };
  }
  removeAllAccess() {
    const extensionsQuery = new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
    const extensions = extensionsQuery.getAllowedExtensions();
    const extensionIds = extensions.map((ext) => ext.id);
    if (extensionIds.length > 0) {
      extensionsQuery.removeAccess(extensionIds);
    }
    const mcpServersQuery = new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
    const mcpServers = mcpServersQuery.getAllowedMcpServers();
    const mcpServerIds = mcpServers.map((server) => server.id);
    if (mcpServerIds.length > 0) {
      mcpServersQuery.removeAccess(mcpServerIds);
    }
  }
  forEach(callback) {
    const extensionsQuery = new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
    extensionsQuery.forEach((extensionQuery) => {
      callback(extensionQuery.extensionId, "extension");
    });
    const mcpServersQuery = new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
    mcpServersQuery.forEach((mcpServerQuery) => {
      callback(mcpServerQuery.mcpServerId, "mcpServer");
    });
  }
}
class AccountQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  extension(extensionId) {
    return new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
  }
  mcpServer(mcpServerId) {
    return new AccountMcpServerQuery(this.providerId, this.accountName, mcpServerId, this.queryService);
  }
  extensions() {
    return new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
  }
  mcpServers() {
    return new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
  }
  entities() {
    return new AccountEntitiesQuery(this.providerId, this.accountName, this.queryService);
  }
  remove() {
    this.queryService.authenticationAccessService.removeAllowedExtensions(this.providerId, this.accountName);
    this.queryService.authenticationUsageService.removeAccountUsage(this.providerId, this.accountName);
    this.queryService.authenticationMcpAccessService.removeAllowedMcpServers(this.providerId, this.accountName);
    this.queryService.authenticationMcpUsageService.removeAccountUsage(this.providerId, this.accountName);
  }
}
class ProviderExtensionQuery extends BaseQuery {
  constructor(providerId, extensionId, queryService) {
    super(providerId, queryService);
    this.extensionId = extensionId;
  }
  getPreferredAccount() {
    return this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
  }
  setPreferredAccount(account) {
    this.queryService.authenticationExtensionsService.updateAccountPreference(this.extensionId, this.providerId, account);
  }
  removeAccountPreference() {
    this.queryService.authenticationExtensionsService.removeAccountPreference(this.extensionId, this.providerId);
  }
}
class ProviderMcpServerQuery extends BaseQuery {
  constructor(providerId, mcpServerId, queryService) {
    super(providerId, queryService);
    this.mcpServerId = mcpServerId;
  }
  async getLastUsedAccount() {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      let lastUsedAccount;
      let lastUsedTime = 0;
      for (const account of accounts) {
        const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        const mcpServerUsages = usages.filter((usage) => usage.mcpServerId === this.mcpServerId);
        for (const usage of mcpServerUsages) {
          if (usage.lastUsed > lastUsedTime) {
            lastUsedTime = usage.lastUsed;
            lastUsedAccount = account.label;
          }
        }
      }
      return lastUsedAccount;
    } catch {
      return void 0;
    }
  }
  getPreferredAccount() {
    return this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
  }
  setPreferredAccount(account) {
    this.queryService.authenticationMcpService.updateAccountPreference(this.mcpServerId, this.providerId, account);
  }
  removeAccountPreference() {
    this.queryService.authenticationMcpService.removeAccountPreference(this.mcpServerId, this.providerId);
  }
  async getUsedAccounts() {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      const usedAccounts = [];
      for (const account of accounts) {
        const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        if (usages.some((usage) => usage.mcpServerId === this.mcpServerId)) {
          usedAccounts.push(account.label);
        }
      }
      return usedAccounts;
    } catch {
      return [];
    }
  }
}
class ProviderQuery extends BaseQuery {
  constructor(providerId, queryService) {
    super(providerId, queryService);
  }
  account(accountName) {
    return new AccountQuery(this.providerId, accountName, this.queryService);
  }
  extension(extensionId) {
    return new ProviderExtensionQuery(this.providerId, extensionId, this.queryService);
  }
  mcpServer(mcpServerId) {
    return new ProviderMcpServerQuery(this.providerId, mcpServerId, this.queryService);
  }
  async getActiveEntities() {
    const extensions = [];
    const mcpServers = [];
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      for (const account of accounts) {
        const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, account.label);
        for (const usage of extensionUsages) {
          if (!extensions.includes(usage.extensionId)) {
            extensions.push(usage.extensionId);
          }
        }
        const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        for (const usage of mcpUsages) {
          if (!mcpServers.includes(usage.mcpServerId)) {
            mcpServers.push(usage.mcpServerId);
          }
        }
      }
    } catch {
    }
    return { extensions, mcpServers };
  }
  async getAccountNames() {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      return accounts.map((account) => account.label);
    } catch {
      return [];
    }
  }
  async getUsageStats() {
    const recentActivity = [];
    let totalSessions = 0;
    let totalAccounts = 0;
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      totalAccounts = accounts.length;
      for (const account of accounts) {
        const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, account.label);
        const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        const allUsages = [...extensionUsages, ...mcpUsages];
        const usageCount = allUsages.length;
        const lastUsed = Math.max(...allUsages.map((u) => u.lastUsed), 0);
        if (usageCount > 0) {
          recentActivity.push({ accountName: account.label, lastUsed, usageCount });
        }
      }
      recentActivity.sort((a, b) => b.lastUsed - a.lastUsed);
      totalSessions = recentActivity.reduce((sum, activity) => sum + activity.usageCount, 0);
    } catch {
    }
    return { totalSessions, totalAccounts, recentActivity };
  }
  async forEachAccount(callback) {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      for (const account of accounts) {
        const accountQuery = new AccountQuery(this.providerId, account.label, this.queryService);
        callback(accountQuery);
      }
    } catch {
    }
  }
}
class ExtensionQuery {
  constructor(extensionId, queryService) {
    this.extensionId = extensionId;
    this.queryService = queryService;
  }
  async getProvidersWithAccess(includeInternal) {
    const providersWithAccess = [];
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      try {
        const accounts = await this.queryService.authenticationService.getAccounts(providerId);
        const hasAccess = accounts.some((account) => {
          const accessAllowed = this.queryService.authenticationAccessService.isAccessAllowed(providerId, account.label, this.extensionId);
          return accessAllowed === true;
        });
        if (hasAccess) {
          providersWithAccess.push(providerId);
        }
      } catch {
      }
    }
    return providersWithAccess;
  }
  getAllAccountPreferences(includeInternal) {
    const preferences = /* @__PURE__ */ new Map();
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      const preferredAccount = this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, providerId);
      if (preferredAccount) {
        preferences.set(providerId, preferredAccount);
      }
    }
    return preferences;
  }
  provider(providerId) {
    return new ProviderExtensionQuery(providerId, this.extensionId, this.queryService);
  }
}
class McpServerQuery {
  constructor(mcpServerId, queryService) {
    this.mcpServerId = mcpServerId;
    this.queryService = queryService;
  }
  async getProvidersWithAccess(includeInternal) {
    const providersWithAccess = [];
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      try {
        const accounts = await this.queryService.authenticationService.getAccounts(providerId);
        const hasAccess = accounts.some((account) => {
          const accessAllowed = this.queryService.authenticationMcpAccessService.isAccessAllowed(providerId, account.label, this.mcpServerId);
          return accessAllowed === true;
        });
        if (hasAccess) {
          providersWithAccess.push(providerId);
        }
      } catch {
      }
    }
    return providersWithAccess;
  }
  getAllAccountPreferences(includeInternal) {
    const preferences = /* @__PURE__ */ new Map();
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      const preferredAccount = this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, providerId);
      if (preferredAccount) {
        preferences.set(providerId, preferredAccount);
      }
    }
    return preferences;
  }
  provider(providerId) {
    return new ProviderMcpServerQuery(providerId, this.mcpServerId, this.queryService);
  }
}
let AuthenticationQueryService = class extends Disposable {
  constructor(authenticationService, authenticationUsageService, authenticationMcpUsageService, authenticationAccessService, authenticationMcpAccessService, authenticationExtensionsService, authenticationMcpService, logService) {
    super();
    this.authenticationService = authenticationService;
    this.authenticationUsageService = authenticationUsageService;
    this.authenticationMcpUsageService = authenticationMcpUsageService;
    this.authenticationAccessService = authenticationAccessService;
    this.authenticationMcpAccessService = authenticationMcpAccessService;
    this.authenticationExtensionsService = authenticationExtensionsService;
    this.authenticationMcpService = authenticationMcpService;
    this.logService = logService;
    this._onDidChangePreferences = this._register(new Emitter());
    this.onDidChangePreferences = this._onDidChangePreferences.event;
    this._onDidChangeAccess = this._register(new Emitter());
    this.onDidChangeAccess = this._onDidChangeAccess.event;
    this._register(this.authenticationExtensionsService.onDidChangeAccountPreference((e) => {
      this._onDidChangePreferences.fire({
        providerId: e.providerId,
        entityType: "extension",
        entityIds: e.extensionIds
      });
    }));
    this._register(this.authenticationMcpService.onDidChangeAccountPreference((e) => {
      this._onDidChangePreferences.fire({
        providerId: e.providerId,
        entityType: "mcpServer",
        entityIds: e.mcpServerIds
      });
    }));
    this._register(this.authenticationAccessService.onDidChangeExtensionSessionAccess((e) => {
      this._onDidChangeAccess.fire({
        providerId: e.providerId,
        accountName: e.accountName
      });
    }));
    this._register(this.authenticationMcpAccessService.onDidChangeMcpSessionAccess((e) => {
      this._onDidChangeAccess.fire({
        providerId: e.providerId,
        accountName: e.accountName
      });
    }));
  }
  provider(providerId) {
    return new ProviderQuery(providerId, this);
  }
  extension(extensionId) {
    return new ExtensionQuery(extensionId, this);
  }
  mcpServer(mcpServerId) {
    return new McpServerQuery(mcpServerId, this);
  }
  getProviderIds(includeInternal) {
    return this.authenticationService.getProviderIds().filter((providerId) => {
      return includeInternal || !providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX);
    });
  }
  async clearAllData(confirmation, includeInternal = true) {
    if (confirmation !== "CLEAR_ALL_AUTH_DATA") {
      throw new Error("Must provide confirmation string to clear all authentication data");
    }
    const providerIds = this.getProviderIds(includeInternal);
    for (const providerId of providerIds) {
      try {
        const accounts = await this.authenticationService.getAccounts(providerId);
        for (const account of accounts) {
          this.authenticationAccessService.removeAllowedExtensions(providerId, account.label);
          this.authenticationUsageService.removeAccountUsage(providerId, account.label);
          this.authenticationMcpAccessService.removeAllowedMcpServers(providerId, account.label);
          this.authenticationMcpUsageService.removeAccountUsage(providerId, account.label);
        }
      } catch (error) {
        this.logService.error(`Error clearing data for provider ${providerId}:`, error);
      }
    }
    this.logService.info("All authentication data cleared");
  }
};
AuthenticationQueryService = __decorateClass([
  __decorateParam(0, IAuthenticationService),
  __decorateParam(1, IAuthenticationUsageService),
  __decorateParam(2, IAuthenticationMcpUsageService),
  __decorateParam(3, IAuthenticationAccessService),
  __decorateParam(4, IAuthenticationMcpAccessService),
  __decorateParam(5, IAuthenticationExtensionsService),
  __decorateParam(6, IAuthenticationMcpService),
  __decorateParam(7, ILogService)
], AuthenticationQueryService);
registerSingleton(IAuthenticationQueryService, AuthenticationQueryService, InstantiationType.Delayed);
export {
  AuthenticationQueryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQsIElBdXRoZW50aWNhdGlvblNlcnZpY2UsIElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLCBJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCB9IGZyb20gJy4uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQge1xuXHRJQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UsXG5cdElQcm92aWRlclF1ZXJ5LFxuXHRJQWNjb3VudFF1ZXJ5LFxuXHRJQWNjb3VudEV4dGVuc2lvblF1ZXJ5LFxuXHRJQWNjb3VudE1jcFNlcnZlclF1ZXJ5LFxuXHRJQWNjb3VudEV4dGVuc2lvbnNRdWVyeSxcblx0SUFjY291bnRNY3BTZXJ2ZXJzUXVlcnksXG5cdElBY2NvdW50RW50aXRpZXNRdWVyeSxcblx0SVByb3ZpZGVyRXh0ZW5zaW9uUXVlcnksXG5cdElQcm92aWRlck1jcFNlcnZlclF1ZXJ5LFxuXHRJRXh0ZW5zaW9uUXVlcnksXG5cdElNY3BTZXJ2ZXJRdWVyeSxcblx0SUFjdGl2ZUVudGl0aWVzLFxuXHRJQXV0aGVudGljYXRpb25Vc2FnZVN0YXRzLFxuXHRJQmFzZVF1ZXJ5XG59IGZyb20gJy4uL2NvbW1vbi9hdXRoZW50aWNhdGlvblF1ZXJ5LmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSB9IGZyb20gJy4vYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi9hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSB9IGZyb20gJy4vYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UgfSBmcm9tICcuL2F1dGhlbnRpY2F0aW9uTWNwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbi8qKlxuICogQmFzZSBpbXBsZW1lbnRhdGlvbiBmb3IgcXVlcnkgaW50ZXJmYWNlc1xuICovXG5hYnN0cmFjdCBjbGFzcyBCYXNlUXVlcnkgaW1wbGVtZW50cyBJQmFzZVF1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgcXVlcnlTZXJ2aWNlOiBBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZVxuXHQpIHsgfVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIGFjY291bnQtZXh0ZW5zaW9uIHF1ZXJ5IG9wZXJhdGlvbnNcbiAqL1xuY2xhc3MgQWNjb3VudEV4dGVuc2lvblF1ZXJ5IGV4dGVuZHMgQmFzZVF1ZXJ5IGltcGxlbWVudHMgSUFjY291bnRFeHRlbnNpb25RdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWNjb3VudE5hbWU6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZyxcblx0XHRxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHByb3ZpZGVySWQsIHF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRpc0FjY2Vzc0FsbG93ZWQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCB0aGlzLmV4dGVuc2lvbklkKTtcblx0fVxuXG5cdHNldEFjY2Vzc0FsbG93ZWQoYWxsb3dlZDogYm9vbGVhbiwgZXh0ZW5zaW9uTmFtZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucyhcblx0XHRcdHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRbeyBpZDogdGhpcy5leHRlbnNpb25JZCwgbmFtZTogZXh0ZW5zaW9uTmFtZSB8fCB0aGlzLmV4dGVuc2lvbklkLCBhbGxvd2VkIH1dXG5cdFx0KTtcblx0fVxuXG5cdGFkZFVzYWdlKHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10sIGV4dGVuc2lvbk5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShcblx0XHRcdHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR0aGlzLmV4dGVuc2lvbklkLFxuXHRcdFx0ZXh0ZW5zaW9uTmFtZVxuXHRcdCk7XG5cdH1cblxuXHRnZXRVc2FnZSgpOiB7XG5cdFx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBleHRlbnNpb25OYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0XHRyZWFkb25seSBsYXN0VXNlZDogbnVtYmVyO1xuXHR9W10ge1xuXHRcdGNvbnN0IGFsbFVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0cmV0dXJuIGFsbFVzYWdlc1xuXHRcdFx0LmZpbHRlcih1c2FnZSA9PiB1c2FnZS5leHRlbnNpb25JZCA9PT0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleSh0aGlzLmV4dGVuc2lvbklkKSlcblx0XHRcdC5tYXAodXNhZ2UgPT4gKHtcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVzYWdlLmV4dGVuc2lvbklkLFxuXHRcdFx0XHRleHRlbnNpb25OYW1lOiB1c2FnZS5leHRlbnNpb25OYW1lLFxuXHRcdFx0XHRzY29wZXM6IHVzYWdlLnNjb3BlcyB8fCBbXSxcblx0XHRcdFx0bGFzdFVzZWQ6IHVzYWdlLmxhc3RVc2VkXG5cdFx0XHR9KSk7XG5cdH1cblxuXHRyZW1vdmVVc2FnZSgpOiB2b2lkIHtcblx0XHQvLyBHZXQgY3VycmVudCB1c2FnZXMsIGZpbHRlciBvdXQgdGhpcyBleHRlbnNpb24sIGFuZCBzdG9yZSB0aGUgcmVzdFxuXHRcdGNvbnN0IGFsbFVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Y29uc3QgZmlsdGVyZWRVc2FnZXMgPSBhbGxVc2FnZXMuZmlsdGVyKHVzYWdlID0+IHVzYWdlLmV4dGVuc2lvbklkICE9PSB0aGlzLmV4dGVuc2lvbklkKTtcblxuXHRcdC8vIENsZWFyIGFsbCB1c2FnZXMgYW5kIHJlLWFkZCB0aGUgZmlsdGVyZWQgb25lc1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlbW92ZUFjY291bnRVc2FnZSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGZvciAoY29uc3QgdXNhZ2Ugb2YgZmlsdGVyZWRVc2FnZXMpIHtcblx0XHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShcblx0XHRcdFx0dGhpcy5wcm92aWRlcklkLFxuXHRcdFx0XHR0aGlzLmFjY291bnROYW1lLFxuXHRcdFx0XHR1c2FnZS5zY29wZXMgfHwgW10sXG5cdFx0XHRcdHVzYWdlLmV4dGVuc2lvbklkLFxuXHRcdFx0XHR1c2FnZS5leHRlbnNpb25OYW1lXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHNldEFzUHJlZmVycmVkKCk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UudXBkYXRlQWNjb3VudFByZWZlcmVuY2UoXG5cdFx0XHR0aGlzLmV4dGVuc2lvbklkLFxuXHRcdFx0dGhpcy5wcm92aWRlcklkLFxuXHRcdFx0eyBsYWJlbDogdGhpcy5hY2NvdW50TmFtZSwgaWQ6IHRoaXMuYWNjb3VudE5hbWUgfVxuXHRcdCk7XG5cdH1cblxuXHRpc1ByZWZlcnJlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBwcmVmZXJyZWRBY2NvdW50ID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZSh0aGlzLmV4dGVuc2lvbklkLCB0aGlzLnByb3ZpZGVySWQpO1xuXHRcdHJldHVybiBwcmVmZXJyZWRBY2NvdW50ID09PSB0aGlzLmFjY291bnROYW1lO1xuXHR9XG5cblx0aXNUcnVzdGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGFsbG93ZWRFeHRlbnNpb25zID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGFsbG93ZWRFeHRlbnNpb25zLmZpbmQoZXh0ID0+IGV4dC5pZCA9PT0gdGhpcy5leHRlbnNpb25JZCk7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbj8udHJ1c3RlZCA9PT0gdHJ1ZTtcblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIGFjY291bnQtTUNQIHNlcnZlciBxdWVyeSBvcGVyYXRpb25zXG4gKi9cbmNsYXNzIEFjY291bnRNY3BTZXJ2ZXJRdWVyeSBleHRlbmRzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElBY2NvdW50TWNwU2VydmVyUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFjY291bnROYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1jcFNlcnZlcklkOiBzdHJpbmcsXG5cdFx0cXVlcnlTZXJ2aWNlOiBBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihwcm92aWRlcklkLCBxdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0aXNBY2Nlc3NBbGxvd2VkKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgdGhpcy5tY3BTZXJ2ZXJJZCk7XG5cdH1cblxuXHRzZXRBY2Nlc3NBbGxvd2VkKGFsbG93ZWQ6IGJvb2xlYW4sIG1jcFNlcnZlck5hbWU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoXG5cdFx0XHR0aGlzLnByb3ZpZGVySWQsXG5cdFx0XHR0aGlzLmFjY291bnROYW1lLFxuXHRcdFx0W3sgaWQ6IHRoaXMubWNwU2VydmVySWQsIG5hbWU6IG1jcFNlcnZlck5hbWUgfHwgdGhpcy5tY3BTZXJ2ZXJJZCwgYWxsb3dlZCB9XVxuXHRcdCk7XG5cdH1cblxuXHRhZGRVc2FnZShzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5hZGRBY2NvdW50VXNhZ2UoXG5cdFx0XHR0aGlzLnByb3ZpZGVySWQsXG5cdFx0XHR0aGlzLmFjY291bnROYW1lLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0dGhpcy5tY3BTZXJ2ZXJJZCxcblx0XHRcdG1jcFNlcnZlck5hbWVcblx0XHQpO1xuXHR9XG5cblx0Z2V0VXNhZ2UoKToge1xuXHRcdHJlYWRvbmx5IG1jcFNlcnZlcklkOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbWNwU2VydmVyTmFtZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0cmVhZG9ubHkgbGFzdFVzZWQ6IG51bWJlcjtcblx0fVtdIHtcblx0XHRjb25zdCBhbGxVc2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdHJldHVybiBhbGxVc2FnZXNcblx0XHRcdC5maWx0ZXIodXNhZ2UgPT4gdXNhZ2UubWNwU2VydmVySWQgPT09IHRoaXMubWNwU2VydmVySWQpXG5cdFx0XHQubWFwKHVzYWdlID0+ICh7XG5cdFx0XHRcdG1jcFNlcnZlcklkOiB1c2FnZS5tY3BTZXJ2ZXJJZCxcblx0XHRcdFx0bWNwU2VydmVyTmFtZTogdXNhZ2UubWNwU2VydmVyTmFtZSxcblx0XHRcdFx0c2NvcGVzOiB1c2FnZS5zY29wZXMgfHwgW10sXG5cdFx0XHRcdGxhc3RVc2VkOiB1c2FnZS5sYXN0VXNlZFxuXHRcdFx0fSkpO1xuXHR9XG5cblx0cmVtb3ZlVXNhZ2UoKTogdm9pZCB7XG5cdFx0Ly8gR2V0IGN1cnJlbnQgdXNhZ2VzLCBmaWx0ZXIgb3V0IHRoaXMgTUNQIHNlcnZlciwgYW5kIHN0b3JlIHRoZSByZXN0XG5cdFx0Y29uc3QgYWxsVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRjb25zdCBmaWx0ZXJlZFVzYWdlcyA9IGFsbFVzYWdlcy5maWx0ZXIodXNhZ2UgPT4gdXNhZ2UubWNwU2VydmVySWQgIT09IHRoaXMubWNwU2VydmVySWQpO1xuXG5cdFx0Ly8gQ2xlYXIgYWxsIHVzYWdlcyBhbmQgcmUtYWRkIHRoZSBmaWx0ZXJlZCBvbmVzXG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UucmVtb3ZlQWNjb3VudFVzYWdlKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Zm9yIChjb25zdCB1c2FnZSBvZiBmaWx0ZXJlZFVzYWdlcykge1xuXHRcdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UuYWRkQWNjb3VudFVzYWdlKFxuXHRcdFx0XHR0aGlzLnByb3ZpZGVySWQsXG5cdFx0XHRcdHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRcdHVzYWdlLnNjb3BlcyB8fCBbXSxcblx0XHRcdFx0dXNhZ2UubWNwU2VydmVySWQsXG5cdFx0XHRcdHVzYWdlLm1jcFNlcnZlck5hbWVcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0QXNQcmVmZXJyZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLnVwZGF0ZUFjY291bnRQcmVmZXJlbmNlKFxuXHRcdFx0dGhpcy5tY3BTZXJ2ZXJJZCxcblx0XHRcdHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdHsgbGFiZWw6IHRoaXMuYWNjb3VudE5hbWUsIGlkOiB0aGlzLmFjY291bnROYW1lIH1cblx0XHQpO1xuXHR9XG5cblx0aXNQcmVmZXJyZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHJlZmVycmVkQWNjb3VudCA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZSh0aGlzLm1jcFNlcnZlcklkLCB0aGlzLnByb3ZpZGVySWQpO1xuXHRcdHJldHVybiBwcmVmZXJyZWRBY2NvdW50ID09PSB0aGlzLmFjY291bnROYW1lO1xuXHR9XG5cblx0aXNUcnVzdGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGFsbG93ZWRNY3BTZXJ2ZXJzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkTWNwU2VydmVycyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGNvbnN0IG1jcFNlcnZlciA9IGFsbG93ZWRNY3BTZXJ2ZXJzLmZpbmQoc2VydmVyID0+IHNlcnZlci5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXJJZCk7XG5cdFx0cmV0dXJuIG1jcFNlcnZlcj8udHJ1c3RlZCA9PT0gdHJ1ZTtcblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIGFjY291bnQtZXh0ZW5zaW9ucyBxdWVyeSBvcGVyYXRpb25zXG4gKi9cbmNsYXNzIEFjY291bnRFeHRlbnNpb25zUXVlcnkgZXh0ZW5kcyBCYXNlUXVlcnkgaW1wbGVtZW50cyBJQWNjb3VudEV4dGVuc2lvbnNRdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWNjb3VudE5hbWU6IHN0cmluZyxcblx0XHRxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHByb3ZpZGVySWQsIHF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRnZXRBbGxvd2VkRXh0ZW5zaW9ucygpOiB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgYWxsb3dlZD86IGJvb2xlYW47IGxhc3RVc2VkPzogbnVtYmVyOyB0cnVzdGVkPzogYm9vbGVhbiB9W10ge1xuXHRcdGNvbnN0IGFsbG93ZWRFeHRlbnNpb25zID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGNvbnN0IHVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cblx0XHRyZXR1cm4gYWxsb3dlZEV4dGVuc2lvbnNcblx0XHRcdC5maWx0ZXIoZXh0ID0+IGV4dC5hbGxvd2VkICE9PSBmYWxzZSlcblx0XHRcdC5tYXAoZXh0ID0+IHtcblx0XHRcdFx0Ly8gRmluZCB0aGUgbW9zdCByZWNlbnQgdXNhZ2UgZm9yIHRoaXMgZXh0ZW5zaW9uXG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblVzYWdlcyA9IHVzYWdlcy5maWx0ZXIodXNhZ2UgPT4gdXNhZ2UuZXh0ZW5zaW9uSWQgPT09IGV4dC5pZCk7XG5cdFx0XHRcdGNvbnN0IGxhc3RVc2VkID0gZXh0ZW5zaW9uVXNhZ2VzLmxlbmd0aCA+IDAgPyBNYXRoLm1heCguLi5leHRlbnNpb25Vc2FnZXMubWFwKHUgPT4gdS5sYXN0VXNlZCkpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIHRydXN0ZWQgdGhyb3VnaCB0aGUgZXh0ZW5zaW9uIHF1ZXJ5XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblF1ZXJ5ID0gbmV3IEFjY291bnRFeHRlbnNpb25RdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIGV4dC5pZCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB0cnVzdGVkID0gZXh0ZW5zaW9uUXVlcnkuaXNUcnVzdGVkKCk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogZXh0LmlkLFxuXHRcdFx0XHRcdG5hbWU6IGV4dC5uYW1lLFxuXHRcdFx0XHRcdGFsbG93ZWQ6IGV4dC5hbGxvd2VkLFxuXHRcdFx0XHRcdGxhc3RVc2VkLFxuXHRcdFx0XHRcdHRydXN0ZWRcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0YWxsb3dBY2Nlc3MoZXh0ZW5zaW9uSWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb0FsbG93ID0gZXh0ZW5zaW9uSWRzLm1hcChpZCA9PiAoeyBpZCwgbmFtZTogaWQsIGFsbG93ZWQ6IHRydWUgfSkpO1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIGV4dGVuc2lvbnNUb0FsbG93KTtcblx0fVxuXG5cdHJlbW92ZUFjY2VzcyhleHRlbnNpb25JZHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvUmVtb3ZlID0gZXh0ZW5zaW9uSWRzLm1hcChpZCA9PiAoeyBpZCwgbmFtZTogaWQsIGFsbG93ZWQ6IGZhbHNlIH0pKTtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCBleHRlbnNpb25zVG9SZW1vdmUpO1xuXHR9XG5cblx0Zm9yRWFjaChjYWxsYmFjazogKGV4dGVuc2lvblF1ZXJ5OiBJQWNjb3VudEV4dGVuc2lvblF1ZXJ5KSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgdXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9ucyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblxuXHRcdC8vIENvbWJpbmUgZXh0ZW5zaW9ucyBmcm9tIGJvdGggdXNhZ2UgYW5kIGFjY2VzcyBkYXRhXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dXNhZ2VzLmZvckVhY2godXNhZ2UgPT4gZXh0ZW5zaW9uSWRzLmFkZCh1c2FnZS5leHRlbnNpb25JZCkpO1xuXHRcdGFsbG93ZWRFeHRlbnNpb25zLmZvckVhY2goZXh0ID0+IGV4dGVuc2lvbklkcy5hZGQoZXh0LmlkKSk7XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIGV4dGVuc2lvbklkcykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uUXVlcnkgPSBuZXcgQWNjb3VudEV4dGVuc2lvblF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgZXh0ZW5zaW9uSWQsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0XHRcdGNhbGxiYWNrKGV4dGVuc2lvblF1ZXJ5KTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBJbXBsZW1lbnRhdGlvbiBvZiBhY2NvdW50LU1DUCBzZXJ2ZXJzIHF1ZXJ5IG9wZXJhdGlvbnNcbiAqL1xuY2xhc3MgQWNjb3VudE1jcFNlcnZlcnNRdWVyeSBleHRlbmRzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElBY2NvdW50TWNwU2VydmVyc1F1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBhY2NvdW50TmFtZTogc3RyaW5nLFxuXHRcdHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocHJvdmlkZXJJZCwgcXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGdldEFsbG93ZWRNY3BTZXJ2ZXJzKCk6IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBhbGxvd2VkPzogYm9vbGVhbjsgbGFzdFVzZWQ/OiBudW1iZXI7IHRydXN0ZWQ/OiBib29sZWFuOyB1cmw/OiBzdHJpbmc7IGFnZW50SG9zdD86IHsgYXV0aG9yaXR5OiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfSB9W10ge1xuXHRcdHJldHVybiB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSlcblx0XHRcdC5maWx0ZXIoc2VydmVyID0+IHNlcnZlci5hbGxvd2VkICE9PSBmYWxzZSk7XG5cdH1cblxuXHRhbGxvd0FjY2VzcyhtY3BTZXJ2ZXJJZHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgbWNwU2VydmVyc1RvQWxsb3cgPSBtY3BTZXJ2ZXJJZHMubWFwKGlkID0+ICh7IGlkLCBuYW1lOiBpZCwgYWxsb3dlZDogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgbWNwU2VydmVyc1RvQWxsb3cpO1xuXHR9XG5cblx0cmVtb3ZlQWNjZXNzKG1jcFNlcnZlcklkczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBtY3BTZXJ2ZXJzVG9SZW1vdmUgPSBtY3BTZXJ2ZXJJZHMubWFwKGlkID0+ICh7IGlkLCBuYW1lOiBpZCwgYWxsb3dlZDogZmFsc2UgfSkpO1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIG1jcFNlcnZlcnNUb1JlbW92ZSk7XG5cdH1cblxuXHRmb3JFYWNoKGNhbGxiYWNrOiAobWNwU2VydmVyUXVlcnk6IElBY2NvdW50TWNwU2VydmVyUXVlcnkpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB1c2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGNvbnN0IGFsbG93ZWRNY3BTZXJ2ZXJzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkTWNwU2VydmVycyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXG5cdFx0Ly8gQ29tYmluZSBNQ1Agc2VydmVycyBmcm9tIGJvdGggdXNhZ2UgYW5kIGFjY2VzcyBkYXRhXG5cdFx0Y29uc3QgbWNwU2VydmVySWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dXNhZ2VzLmZvckVhY2godXNhZ2UgPT4gbWNwU2VydmVySWRzLmFkZCh1c2FnZS5tY3BTZXJ2ZXJJZCkpO1xuXHRcdGFsbG93ZWRNY3BTZXJ2ZXJzLmZvckVhY2goc2VydmVyID0+IG1jcFNlcnZlcklkcy5hZGQoc2VydmVyLmlkKSk7XG5cblx0XHRmb3IgKGNvbnN0IG1jcFNlcnZlcklkIG9mIG1jcFNlcnZlcklkcykge1xuXHRcdFx0Y29uc3QgbWNwU2VydmVyUXVlcnkgPSBuZXcgQWNjb3VudE1jcFNlcnZlclF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgbWNwU2VydmVySWQsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0XHRcdGNhbGxiYWNrKG1jcFNlcnZlclF1ZXJ5KTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBJbXBsZW1lbnRhdGlvbiBvZiBhY2NvdW50LWVudGl0aWVzIHF1ZXJ5IG9wZXJhdGlvbnMgZm9yIHR5cGUtYWdub3N0aWMgb3BlcmF0aW9uc1xuICovXG5jbGFzcyBBY2NvdW50RW50aXRpZXNRdWVyeSBleHRlbmRzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElBY2NvdW50RW50aXRpZXNRdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWNjb3VudE5hbWU6IHN0cmluZyxcblx0XHRxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHByb3ZpZGVySWQsIHF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRoYXNBbnlVc2FnZSgpOiBib29sZWFuIHtcblx0XHQvLyBDaGVjayBleHRlbnNpb24gdXNhZ2Vcblx0XHRjb25zdCBleHRlbnNpb25Vc2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGlmIChleHRlbnNpb25Vc2FnZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgTUNQIHNlcnZlciB1c2FnZVxuXHRcdGNvbnN0IG1jcFVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0aWYgKG1jcFVzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBleHRlbnNpb24gYWNjZXNzXG5cdFx0Y29uc3QgYWxsb3dlZEV4dGVuc2lvbnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0aWYgKGFsbG93ZWRFeHRlbnNpb25zLnNvbWUoZXh0ID0+IGV4dC5hbGxvd2VkICE9PSBmYWxzZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIE1DUCBzZXJ2ZXIgYWNjZXNzXG5cdFx0Y29uc3QgYWxsb3dlZE1jcFNlcnZlcnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0aWYgKGFsbG93ZWRNY3BTZXJ2ZXJzLnNvbWUoc2VydmVyID0+IHNlcnZlci5hbGxvd2VkICE9PSBmYWxzZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldEVudGl0eUNvdW50KCk6IHsgZXh0ZW5zaW9uczogbnVtYmVyOyBtY3BTZXJ2ZXJzOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfSB7XG5cdFx0Ly8gVXNlIHRoZSBzYW1lIGxvZ2ljIGFzIGdldEFsbEVudGl0aWVzIHRvIGNvdW50IGFsbCBlbnRpdGllcyB3aXRoIHVzYWdlIG9yIGFjY2Vzc1xuXHRcdGNvbnN0IGV4dGVuc2lvblVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Y29uc3QgYWxsb3dlZEV4dGVuc2lvbnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSkuZmlsdGVyKGV4dCA9PiBleHQuYWxsb3dlZCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0ZXh0ZW5zaW9uVXNhZ2VzLmZvckVhY2godXNhZ2UgPT4gZXh0ZW5zaW9uSWRzLmFkZCh1c2FnZS5leHRlbnNpb25JZCkpO1xuXHRcdGFsbG93ZWRFeHRlbnNpb25zLmZvckVhY2goZXh0ID0+IGV4dGVuc2lvbklkcy5hZGQoZXh0LmlkKSk7XG5cblx0XHRjb25zdCBtY3BVc2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGNvbnN0IGFsbG93ZWRNY3BTZXJ2ZXJzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkTWNwU2VydmVycyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpLmZpbHRlcihzZXJ2ZXIgPT4gc2VydmVyLmFsbG93ZWQpO1xuXHRcdGNvbnN0IG1jcFNlcnZlcklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdG1jcFVzYWdlcy5mb3JFYWNoKHVzYWdlID0+IG1jcFNlcnZlcklkcy5hZGQodXNhZ2UubWNwU2VydmVySWQpKTtcblx0XHRhbGxvd2VkTWNwU2VydmVycy5mb3JFYWNoKHNlcnZlciA9PiBtY3BTZXJ2ZXJJZHMuYWRkKHNlcnZlci5pZCkpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uQ291bnQgPSBleHRlbnNpb25JZHMuc2l6ZTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJDb3VudCA9IG1jcFNlcnZlcklkcy5zaXplO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4dGVuc2lvbnM6IGV4dGVuc2lvbkNvdW50LFxuXHRcdFx0bWNwU2VydmVyczogbWNwU2VydmVyQ291bnQsXG5cdFx0XHR0b3RhbDogZXh0ZW5zaW9uQ291bnQgKyBtY3BTZXJ2ZXJDb3VudFxuXHRcdH07XG5cdH1cblxuXHRyZW1vdmVBbGxBY2Nlc3MoKTogdm9pZCB7XG5cdFx0Ly8gUmVtb3ZlIGFsbCBleHRlbnNpb24gYWNjZXNzXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1F1ZXJ5ID0gbmV3IEFjY291bnRFeHRlbnNpb25zUXVlcnkodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCB0aGlzLnF1ZXJ5U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnNRdWVyeS5nZXRBbGxvd2VkRXh0ZW5zaW9ucygpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkcyA9IGV4dGVuc2lvbnMubWFwKGV4dCA9PiBleHQuaWQpO1xuXHRcdGlmIChleHRlbnNpb25JZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZXh0ZW5zaW9uc1F1ZXJ5LnJlbW92ZUFjY2VzcyhleHRlbnNpb25JZHMpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBhbGwgTUNQIHNlcnZlciBhY2Nlc3Ncblx0XHRjb25zdCBtY3BTZXJ2ZXJzUXVlcnkgPSBuZXcgQWNjb3VudE1jcFNlcnZlcnNRdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJzID0gbWNwU2VydmVyc1F1ZXJ5LmdldEFsbG93ZWRNY3BTZXJ2ZXJzKCk7XG5cdFx0Y29uc3QgbWNwU2VydmVySWRzID0gbWNwU2VydmVycy5tYXAoc2VydmVyID0+IHNlcnZlci5pZCk7XG5cdFx0aWYgKG1jcFNlcnZlcklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRtY3BTZXJ2ZXJzUXVlcnkucmVtb3ZlQWNjZXNzKG1jcFNlcnZlcklkcyk7XG5cdFx0fVxuXHR9XG5cblx0Zm9yRWFjaChjYWxsYmFjazogKGVudGl0eUlkOiBzdHJpbmcsIGVudGl0eVR5cGU6ICdleHRlbnNpb24nIHwgJ21jcFNlcnZlcicpID0+IHZvaWQpOiB2b2lkIHtcblx0XHQvLyBJdGVyYXRlIG92ZXIgZXh0ZW5zaW9uc1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNRdWVyeSA9IG5ldyBBY2NvdW50RXh0ZW5zaW9uc1F1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHRcdGV4dGVuc2lvbnNRdWVyeS5mb3JFYWNoKGV4dGVuc2lvblF1ZXJ5ID0+IHtcblx0XHRcdGNhbGxiYWNrKGV4dGVuc2lvblF1ZXJ5LmV4dGVuc2lvbklkLCAnZXh0ZW5zaW9uJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBJdGVyYXRlIG92ZXIgTUNQIHNlcnZlcnNcblx0XHRjb25zdCBtY3BTZXJ2ZXJzUXVlcnkgPSBuZXcgQWNjb3VudE1jcFNlcnZlcnNRdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0XHRtY3BTZXJ2ZXJzUXVlcnkuZm9yRWFjaChtY3BTZXJ2ZXJRdWVyeSA9PiB7XG5cdFx0XHRjYWxsYmFjayhtY3BTZXJ2ZXJRdWVyeS5tY3BTZXJ2ZXJJZCwgJ21jcFNlcnZlcicpO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgYWNjb3VudCBxdWVyeSBvcGVyYXRpb25zXG4gKi9cbmNsYXNzIEFjY291bnRRdWVyeSBleHRlbmRzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElBY2NvdW50UXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFjY291bnROYW1lOiBzdHJpbmcsXG5cdFx0cXVlcnlTZXJ2aWNlOiBBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihwcm92aWRlcklkLCBxdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0ZXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBJQWNjb3VudEV4dGVuc2lvblF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IEFjY291bnRFeHRlbnNpb25RdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIGV4dGVuc2lvbklkLCB0aGlzLnF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRtY3BTZXJ2ZXIobWNwU2VydmVySWQ6IHN0cmluZyk6IElBY2NvdW50TWNwU2VydmVyUXVlcnkge1xuXHRcdHJldHVybiBuZXcgQWNjb3VudE1jcFNlcnZlclF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgbWNwU2VydmVySWQsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGV4dGVuc2lvbnMoKTogSUFjY291bnRFeHRlbnNpb25zUXVlcnkge1xuXHRcdHJldHVybiBuZXcgQWNjb3VudEV4dGVuc2lvbnNRdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdG1jcFNlcnZlcnMoKTogSUFjY291bnRNY3BTZXJ2ZXJzUXVlcnkge1xuXHRcdHJldHVybiBuZXcgQWNjb3VudE1jcFNlcnZlcnNRdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGVudGl0aWVzKCk6IElBY2NvdW50RW50aXRpZXNRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBBY2NvdW50RW50aXRpZXNRdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdHJlbW92ZSgpOiB2b2lkIHtcblx0XHQvLyBSZW1vdmUgYWxsIGV4dGVuc2lvbiBhY2Nlc3MgYW5kIHVzYWdlIGRhdGFcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZEV4dGVuc2lvbnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5yZW1vdmVBY2NvdW50VXNhZ2UodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblxuXHRcdC8vIFJlbW92ZSBhbGwgTUNQIHNlcnZlciBhY2Nlc3MgYW5kIHVzYWdlIGRhdGFcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZE1jcFNlcnZlcnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZW1vdmVBY2NvdW50VXNhZ2UodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIHByb3ZpZGVyLWV4dGVuc2lvbiBxdWVyeSBvcGVyYXRpb25zXG4gKi9cbmNsYXNzIFByb3ZpZGVyRXh0ZW5zaW9uUXVlcnkgZXh0ZW5kcyBCYXNlUXVlcnkgaW1wbGVtZW50cyBJUHJvdmlkZXJFeHRlbnNpb25RdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZyxcblx0XHRxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHByb3ZpZGVySWQsIHF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRnZXRQcmVmZXJyZWRBY2NvdW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UuZ2V0QWNjb3VudFByZWZlcmVuY2UodGhpcy5leHRlbnNpb25JZCwgdGhpcy5wcm92aWRlcklkKTtcblx0fVxuXG5cdHNldFByZWZlcnJlZEFjY291bnQoYWNjb3VudDogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UudXBkYXRlQWNjb3VudFByZWZlcmVuY2UodGhpcy5leHRlbnNpb25JZCwgdGhpcy5wcm92aWRlcklkLCBhY2NvdW50KTtcblx0fVxuXG5cdHJlbW92ZUFjY291bnRQcmVmZXJlbmNlKCk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UucmVtb3ZlQWNjb3VudFByZWZlcmVuY2UodGhpcy5leHRlbnNpb25JZCwgdGhpcy5wcm92aWRlcklkKTtcblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIHByb3ZpZGVyLU1DUCBzZXJ2ZXIgcXVlcnkgb3BlcmF0aW9uc1xuICovXG5jbGFzcyBQcm92aWRlck1jcFNlcnZlclF1ZXJ5IGV4dGVuZHMgQmFzZVF1ZXJ5IGltcGxlbWVudHMgSVByb3ZpZGVyTWNwU2VydmVyUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1jcFNlcnZlcklkOiBzdHJpbmcsXG5cdFx0cXVlcnlTZXJ2aWNlOiBBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihwcm92aWRlcklkLCBxdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TGFzdFVzZWRBY2NvdW50KCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY291bnRzID0gYXdhaXQgdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHRoaXMucHJvdmlkZXJJZCk7XG5cdFx0XHRsZXQgbGFzdFVzZWRBY2NvdW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbGFzdFVzZWRUaW1lID0gMDtcblxuXHRcdFx0Zm9yIChjb25zdCBhY2NvdW50IG9mIGFjY291bnRzKSB7XG5cdFx0XHRcdGNvbnN0IHVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCk7XG5cdFx0XHRcdGNvbnN0IG1jcFNlcnZlclVzYWdlcyA9IHVzYWdlcy5maWx0ZXIodXNhZ2UgPT4gdXNhZ2UubWNwU2VydmVySWQgPT09IHRoaXMubWNwU2VydmVySWQpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgdXNhZ2Ugb2YgbWNwU2VydmVyVXNhZ2VzKSB7XG5cdFx0XHRcdFx0aWYgKHVzYWdlLmxhc3RVc2VkID4gbGFzdFVzZWRUaW1lKSB7XG5cdFx0XHRcdFx0XHRsYXN0VXNlZFRpbWUgPSB1c2FnZS5sYXN0VXNlZDtcblx0XHRcdFx0XHRcdGxhc3RVc2VkQWNjb3VudCA9IGFjY291bnQubGFiZWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsYXN0VXNlZEFjY291bnQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldFByZWZlcnJlZEFjY291bnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKHRoaXMubWNwU2VydmVySWQsIHRoaXMucHJvdmlkZXJJZCk7XG5cdH1cblxuXHRzZXRQcmVmZXJyZWRBY2NvdW50KGFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQpOiB2b2lkIHtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UudXBkYXRlQWNjb3VudFByZWZlcmVuY2UodGhpcy5tY3BTZXJ2ZXJJZCwgdGhpcy5wcm92aWRlcklkLCBhY2NvdW50KTtcblx0fVxuXG5cdHJlbW92ZUFjY291bnRQcmVmZXJlbmNlKCk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwU2VydmljZS5yZW1vdmVBY2NvdW50UHJlZmVyZW5jZSh0aGlzLm1jcFNlcnZlcklkLCB0aGlzLnByb3ZpZGVySWQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VXNlZEFjY291bnRzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHModGhpcy5wcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IHVzZWRBY2NvdW50czogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBhY2NvdW50IG9mIGFjY291bnRzKSB7XG5cdFx0XHRcdGNvbnN0IHVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCk7XG5cdFx0XHRcdGlmICh1c2FnZXMuc29tZSh1c2FnZSA9PiB1c2FnZS5tY3BTZXJ2ZXJJZCA9PT0gdGhpcy5tY3BTZXJ2ZXJJZCkpIHtcblx0XHRcdFx0XHR1c2VkQWNjb3VudHMucHVzaChhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdXNlZEFjY291bnRzO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIHByb3ZpZGVyIHF1ZXJ5IG9wZXJhdGlvbnNcbiAqL1xuY2xhc3MgUHJvdmlkZXJRdWVyeSBleHRlbmRzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElQcm92aWRlclF1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocHJvdmlkZXJJZCwgcXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGFjY291bnQoYWNjb3VudE5hbWU6IHN0cmluZyk6IElBY2NvdW50UXVlcnkge1xuXHRcdHJldHVybiBuZXcgQWNjb3VudFF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgYWNjb3VudE5hbWUsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGV4dGVuc2lvbihleHRlbnNpb25JZDogc3RyaW5nKTogSVByb3ZpZGVyRXh0ZW5zaW9uUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUHJvdmlkZXJFeHRlbnNpb25RdWVyeSh0aGlzLnByb3ZpZGVySWQsIGV4dGVuc2lvbklkLCB0aGlzLnF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRtY3BTZXJ2ZXIobWNwU2VydmVySWQ6IHN0cmluZyk6IElQcm92aWRlck1jcFNlcnZlclF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFByb3ZpZGVyTWNwU2VydmVyUXVlcnkodGhpcy5wcm92aWRlcklkLCBtY3BTZXJ2ZXJJZCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWN0aXZlRW50aXRpZXMoKTogUHJvbWlzZTxJQWN0aXZlRW50aXRpZXM+IHtcblx0XHRjb25zdCBleHRlbnNpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG1jcFNlcnZlcnM6IHN0cmluZ1tdID0gW107XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHModGhpcy5wcm92aWRlcklkKTtcblxuXHRcdFx0Zm9yIChjb25zdCBhY2NvdW50IG9mIGFjY291bnRzKSB7XG5cdFx0XHRcdC8vIEdldCBleHRlbnNpb24gdXNhZ2VzXG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCk7XG5cdFx0XHRcdGZvciAoY29uc3QgdXNhZ2Ugb2YgZXh0ZW5zaW9uVXNhZ2VzKSB7XG5cdFx0XHRcdFx0aWYgKCFleHRlbnNpb25zLmluY2x1ZGVzKHVzYWdlLmV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHVzYWdlLmV4dGVuc2lvbklkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBHZXQgTUNQIHNlcnZlciB1c2FnZXNcblx0XHRcdFx0Y29uc3QgbWNwVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0Zm9yIChjb25zdCB1c2FnZSBvZiBtY3BVc2FnZXMpIHtcblx0XHRcdFx0XHRpZiAoIW1jcFNlcnZlcnMuaW5jbHVkZXModXNhZ2UubWNwU2VydmVySWQpKSB7XG5cdFx0XHRcdFx0XHRtY3BTZXJ2ZXJzLnB1c2godXNhZ2UubWNwU2VydmVySWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gUmV0dXJuIGVtcHR5IGFycmF5cyBpZiB0aGVyZSdzIGFuIGVycm9yXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZXh0ZW5zaW9ucywgbWNwU2VydmVycyB9O1xuXHR9XG5cblx0YXN5bmMgZ2V0QWNjb3VudE5hbWVzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHModGhpcy5wcm92aWRlcklkKTtcblx0XHRcdHJldHVybiBhY2NvdW50cy5tYXAoYWNjb3VudCA9PiBhY2NvdW50LmxhYmVsKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRVc2FnZVN0YXRzKCk6IFByb21pc2U8SUF1dGhlbnRpY2F0aW9uVXNhZ2VTdGF0cz4ge1xuXHRcdGNvbnN0IHJlY2VudEFjdGl2aXR5OiB7IGFjY291bnROYW1lOiBzdHJpbmc7IGxhc3RVc2VkOiBudW1iZXI7IHVzYWdlQ291bnQ6IG51bWJlciB9W10gPSBbXTtcblx0XHRsZXQgdG90YWxTZXNzaW9ucyA9IDA7XG5cdFx0bGV0IHRvdGFsQWNjb3VudHMgPSAwO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY291bnRzID0gYXdhaXQgdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHRoaXMucHJvdmlkZXJJZCk7XG5cdFx0XHR0b3RhbEFjY291bnRzID0gYWNjb3VudHMubGVuZ3RoO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYWNjb3VudHMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0Y29uc3QgbWNwVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblxuXHRcdFx0XHRjb25zdCBhbGxVc2FnZXMgPSBbLi4uZXh0ZW5zaW9uVXNhZ2VzLCAuLi5tY3BVc2FnZXNdO1xuXHRcdFx0XHRjb25zdCB1c2FnZUNvdW50ID0gYWxsVXNhZ2VzLmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgbGFzdFVzZWQgPSBNYXRoLm1heCguLi5hbGxVc2FnZXMubWFwKHUgPT4gdS5sYXN0VXNlZCksIDApO1xuXG5cdFx0XHRcdGlmICh1c2FnZUNvdW50ID4gMCkge1xuXHRcdFx0XHRcdHJlY2VudEFjdGl2aXR5LnB1c2goeyBhY2NvdW50TmFtZTogYWNjb3VudC5sYWJlbCwgbGFzdFVzZWQsIHVzYWdlQ291bnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gU29ydCBieSBtb3N0IHJlY2VudCBhY3Rpdml0eVxuXHRcdFx0cmVjZW50QWN0aXZpdHkuc29ydCgoYSwgYikgPT4gYi5sYXN0VXNlZCAtIGEubGFzdFVzZWQpO1xuXG5cdFx0XHQvLyBDb3VudCB0b3RhbCBzZXNzaW9ucyAoYXBwcm94aW1hdGUpXG5cdFx0XHR0b3RhbFNlc3Npb25zID0gcmVjZW50QWN0aXZpdHkucmVkdWNlKChzdW0sIGFjdGl2aXR5KSA9PiBzdW0gKyBhY3Rpdml0eS51c2FnZUNvdW50LCAwKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFJldHVybiBkZWZhdWx0IHN0YXRzIGlmIHRoZXJlJ3MgYW4gZXJyb3Jcblx0XHR9XG5cblx0XHRyZXR1cm4geyB0b3RhbFNlc3Npb25zLCB0b3RhbEFjY291bnRzLCByZWNlbnRBY3Rpdml0eSB9O1xuXHR9XG5cblx0YXN5bmMgZm9yRWFjaEFjY291bnQoY2FsbGJhY2s6IChhY2NvdW50UXVlcnk6IElBY2NvdW50UXVlcnkpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHModGhpcy5wcm92aWRlcklkKTtcblx0XHRcdGZvciAoY29uc3QgYWNjb3VudCBvZiBhY2NvdW50cykge1xuXHRcdFx0XHRjb25zdCBhY2NvdW50UXVlcnkgPSBuZXcgQWNjb3VudFF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHRcdFx0XHRjYWxsYmFjayhhY2NvdW50UXVlcnkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gU2lsZW50bHkgaGFuZGxlIGVycm9ycyBpbiBlbnVtZXJhdGlvblxuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIGV4dGVuc2lvbiBxdWVyeSBvcGVyYXRpb25zIChjcm9zcy1wcm92aWRlcilcbiAqL1xuY2xhc3MgRXh0ZW5zaW9uUXVlcnkgaW1wbGVtZW50cyBJRXh0ZW5zaW9uUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBnZXRQcm92aWRlcnNXaXRoQWNjZXNzKGluY2x1ZGVJbnRlcm5hbD86IGJvb2xlYW4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzV2l0aEFjY2Vzczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlcklkcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcklkcygpO1xuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHByb3ZpZGVySWRzKSB7XG5cdFx0XHQvLyBTa2lwIGludGVybmFsIHByb3ZpZGVycyB1bmxlc3MgZXhwbGljaXRseSByZXF1ZXN0ZWRcblx0XHRcdGlmICghaW5jbHVkZUludGVybmFsICYmIHByb3ZpZGVySWQuc3RhcnRzV2l0aChJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFjY291bnRzID0gYXdhaXQgdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHByb3ZpZGVySWQpO1xuXHRcdFx0XHRjb25zdCBoYXNBY2Nlc3MgPSBhY2NvdW50cy5zb21lKGFjY291bnQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjY2Vzc0FsbG93ZWQgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKHByb3ZpZGVySWQsIGFjY291bnQubGFiZWwsIHRoaXMuZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdHJldHVybiBhY2Nlc3NBbGxvd2VkID09PSB0cnVlO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoaGFzQWNjZXNzKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJzV2l0aEFjY2Vzcy5wdXNoKHByb3ZpZGVySWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gU2tpcCBwcm92aWRlcnMgdGhhdCBlcnJvclxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlcnNXaXRoQWNjZXNzO1xuXHR9XG5cblx0Z2V0QWxsQWNjb3VudFByZWZlcmVuY2VzKGluY2x1ZGVJbnRlcm5hbD86IGJvb2xlYW4pOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRjb25zdCBwcmVmZXJlbmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZHMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXJJZHMoKTtcblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXJJZCBvZiBwcm92aWRlcklkcykge1xuXHRcdFx0Ly8gU2tpcCBpbnRlcm5hbCBwcm92aWRlcnMgdW5sZXNzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG5cdFx0XHRpZiAoIWluY2x1ZGVJbnRlcm5hbCAmJiBwcm92aWRlcklkLnN0YXJ0c1dpdGgoSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmVmZXJyZWRBY2NvdW50ID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZSh0aGlzLmV4dGVuc2lvbklkLCBwcm92aWRlcklkKTtcblx0XHRcdGlmIChwcmVmZXJyZWRBY2NvdW50KSB7XG5cdFx0XHRcdHByZWZlcmVuY2VzLnNldChwcm92aWRlcklkLCBwcmVmZXJyZWRBY2NvdW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcHJlZmVyZW5jZXM7XG5cdH1cblxuXHRwcm92aWRlcihwcm92aWRlcklkOiBzdHJpbmcpOiBJUHJvdmlkZXJFeHRlbnNpb25RdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBQcm92aWRlckV4dGVuc2lvblF1ZXJ5KHByb3ZpZGVySWQsIHRoaXMuZXh0ZW5zaW9uSWQsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIE1DUCBzZXJ2ZXIgcXVlcnkgb3BlcmF0aW9ucyAoY3Jvc3MtcHJvdmlkZXIpXG4gKi9cbmNsYXNzIE1jcFNlcnZlclF1ZXJ5IGltcGxlbWVudHMgSU1jcFNlcnZlclF1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1jcFNlcnZlcklkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgZ2V0UHJvdmlkZXJzV2l0aEFjY2VzcyhpbmNsdWRlSW50ZXJuYWw/OiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1dpdGhBY2Nlc3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXJJZHMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXJJZHMoKTtcblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXJJZCBvZiBwcm92aWRlcklkcykge1xuXHRcdFx0Ly8gU2tpcCBpbnRlcm5hbCBwcm92aWRlcnMgdW5sZXNzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG5cdFx0XHRpZiAoIWluY2x1ZGVJbnRlcm5hbCAmJiBwcm92aWRlcklkLnN0YXJ0c1dpdGgoSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyhwcm92aWRlcklkKTtcblx0XHRcdFx0Y29uc3QgaGFzQWNjZXNzID0gYWNjb3VudHMuc29tZShhY2NvdW50ID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY2Nlc3NBbGxvd2VkID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZChwcm92aWRlcklkLCBhY2NvdW50LmxhYmVsLCB0aGlzLm1jcFNlcnZlcklkKTtcblx0XHRcdFx0XHRyZXR1cm4gYWNjZXNzQWxsb3dlZCA9PT0gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGhhc0FjY2Vzcykge1xuXHRcdFx0XHRcdHByb3ZpZGVyc1dpdGhBY2Nlc3MucHVzaChwcm92aWRlcklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFNraXAgcHJvdmlkZXJzIHRoYXQgZXJyb3Jcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvdmlkZXJzV2l0aEFjY2Vzcztcblx0fVxuXG5cdGdldEFsbEFjY291bnRQcmVmZXJlbmNlcyhpbmNsdWRlSW50ZXJuYWw/OiBib29sZWFuKTogTWFwPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IHByb3ZpZGVySWRzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCk7XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVySWQgb2YgcHJvdmlkZXJJZHMpIHtcblx0XHRcdC8vIFNraXAgaW50ZXJuYWwgcHJvdmlkZXJzIHVubGVzcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuXHRcdFx0aWYgKCFpbmNsdWRlSW50ZXJuYWwgJiYgcHJvdmlkZXJJZC5zdGFydHNXaXRoKElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJlZmVycmVkQWNjb3VudCA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZSh0aGlzLm1jcFNlcnZlcklkLCBwcm92aWRlcklkKTtcblx0XHRcdGlmIChwcmVmZXJyZWRBY2NvdW50KSB7XG5cdFx0XHRcdHByZWZlcmVuY2VzLnNldChwcm92aWRlcklkLCBwcmVmZXJyZWRBY2NvdW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcHJlZmVyZW5jZXM7XG5cdH1cblxuXHRwcm92aWRlcihwcm92aWRlcklkOiBzdHJpbmcpOiBJUHJvdmlkZXJNY3BTZXJ2ZXJRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBQcm92aWRlck1jcFNlcnZlclF1ZXJ5KHByb3ZpZGVySWQsIHRoaXMubWNwU2VydmVySWQsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxufVxuXG4vKipcbiAqIE1haW4gaW1wbGVtZW50YXRpb24gb2YgdGhlIGF1dGhlbnRpY2F0aW9uIHF1ZXJ5IHNlcnZpY2VcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJlZmVyZW5jZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGVudGl0eVR5cGU6ICdleHRlbnNpb24nIHwgJ21jcFNlcnZlcic7XG5cdFx0cmVhZG9ubHkgZW50aXR5SWRzOiBzdHJpbmdbXTtcblx0fT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJlZmVyZW5jZXMgPSB0aGlzLl9vbkRpZENoYW5nZVByZWZlcmVuY2VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWNjZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8e1xuXHRcdHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBhY2NvdW50TmFtZTogc3RyaW5nO1xuXHR9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY2Nlc3MgPSB0aGlzLl9vbkRpZENoYW5nZUFjY2Vzcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgcHVibGljIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEZvcndhcmQgZXZlbnRzIGZyb20gdW5kZXJseWluZyBzZXJ2aWNlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5vbkRpZENoYW5nZUFjY291bnRQcmVmZXJlbmNlKGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcmVmZXJlbmNlcy5maXJlKHtcblx0XHRcdFx0cHJvdmlkZXJJZDogZS5wcm92aWRlcklkLFxuXHRcdFx0XHRlbnRpdHlUeXBlOiAnZXh0ZW5zaW9uJyxcblx0XHRcdFx0ZW50aXR5SWRzOiBlLmV4dGVuc2lvbklkc1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvbk1jcFNlcnZpY2Uub25EaWRDaGFuZ2VBY2NvdW50UHJlZmVyZW5jZShlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJlZmVyZW5jZXMuZmlyZSh7XG5cdFx0XHRcdHByb3ZpZGVySWQ6IGUucHJvdmlkZXJJZCxcblx0XHRcdFx0ZW50aXR5VHlwZTogJ21jcFNlcnZlcicsXG5cdFx0XHRcdGVudGl0eUlkczogZS5tY3BTZXJ2ZXJJZHNcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uU2Vzc2lvbkFjY2VzcyhlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWNjZXNzLmZpcmUoe1xuXHRcdFx0XHRwcm92aWRlcklkOiBlLnByb3ZpZGVySWQsXG5cdFx0XHRcdGFjY291bnROYW1lOiBlLmFjY291bnROYW1lXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5vbkRpZENoYW5nZU1jcFNlc3Npb25BY2Nlc3MoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjY2Vzcy5maXJlKHtcblx0XHRcdFx0cHJvdmlkZXJJZDogZS5wcm92aWRlcklkLFxuXHRcdFx0XHRhY2NvdW50TmFtZTogZS5hY2NvdW50TmFtZVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdmlkZXIocHJvdmlkZXJJZDogc3RyaW5nKTogSVByb3ZpZGVyUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUHJvdmlkZXJRdWVyeShwcm92aWRlcklkLCB0aGlzKTtcblx0fVxuXG5cdGV4dGVuc2lvbihleHRlbnNpb25JZDogc3RyaW5nKTogSUV4dGVuc2lvblF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvblF1ZXJ5KGV4dGVuc2lvbklkLCB0aGlzKTtcblx0fVxuXG5cdG1jcFNlcnZlcihtY3BTZXJ2ZXJJZDogc3RyaW5nKTogSU1jcFNlcnZlclF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IE1jcFNlcnZlclF1ZXJ5KG1jcFNlcnZlcklkLCB0aGlzKTtcblx0fVxuXG5cdGdldFByb3ZpZGVySWRzKGluY2x1ZGVJbnRlcm5hbD86IGJvb2xlYW4pOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCkuZmlsdGVyKHByb3ZpZGVySWQgPT4ge1xuXHRcdFx0Ly8gRmlsdGVyIG91dCBpbnRlcm5hbCBwcm92aWRlcnMgdW5sZXNzIGV4cGxpY2l0bHkgaW5jbHVkZWRcblx0XHRcdHJldHVybiBpbmNsdWRlSW50ZXJuYWwgfHwgIXByb3ZpZGVySWQuc3RhcnRzV2l0aChJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBjbGVhckFsbERhdGEoY29uZmlybWF0aW9uOiAnQ0xFQVJfQUxMX0FVVEhfREFUQScsIGluY2x1ZGVJbnRlcm5hbDogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29uZmlybWF0aW9uICE9PSAnQ0xFQVJfQUxMX0FVVEhfREFUQScpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTXVzdCBwcm92aWRlIGNvbmZpcm1hdGlvbiBzdHJpbmcgdG8gY2xlYXIgYWxsIGF1dGhlbnRpY2F0aW9uIGRhdGEnKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlcklkcyA9IHRoaXMuZ2V0UHJvdmlkZXJJZHMoaW5jbHVkZUludGVybmFsKTtcblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXJJZCBvZiBwcm92aWRlcklkcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyhwcm92aWRlcklkKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYWNjb3VudHMpIHtcblx0XHRcdFx0XHQvLyBDbGVhciBleHRlbnNpb24gZGF0YVxuXHRcdFx0XHRcdHRoaXMuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlbW92ZUFsbG93ZWRFeHRlbnNpb25zKHByb3ZpZGVySWQsIGFjY291bnQubGFiZWwpO1xuXHRcdFx0XHRcdHRoaXMuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVtb3ZlQWNjb3VudFVzYWdlKHByb3ZpZGVySWQsIGFjY291bnQubGFiZWwpO1xuXG5cdFx0XHRcdFx0Ly8gQ2xlYXIgTUNQIHNlcnZlciBkYXRhXG5cdFx0XHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZE1jcFNlcnZlcnMocHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCk7XG5cdFx0XHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZW1vdmVBY2NvdW50VXNhZ2UocHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3IgY2xlYXJpbmcgZGF0YSBmb3IgcHJvdmlkZXIgJHtwcm92aWRlcklkfTpgLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0FsbCBhdXRoZW50aWNhdGlvbiBkYXRhIGNsZWFyZWQnKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UsIEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlLCBJbnN0YW50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
