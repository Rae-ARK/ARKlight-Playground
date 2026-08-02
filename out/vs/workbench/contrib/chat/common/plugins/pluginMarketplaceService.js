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
import { runWhenGlobalIdle } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { parse as parseJSONC } from "../../../../../base/common/json.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { isEqual, isEqualOrParent, joinPath, normalizePath, relativePath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { observableMemento } from "../../../../../platform/observable/common/observableMemento.js";
import { asJson, IRequestService } from "../../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { AutoUpdateConfigurationKey, IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { ChatConfiguration } from "../constants.js";
import { IAgentPluginRepositoryService } from "./agentPluginRepositoryService.js";
import { FileBackedInstalledPluginsStore } from "./fileBackedInstalledPluginsStore.js";
import { IWorkspacePluginSettingsService } from "./workspacePluginSettingsService.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { readAgentPluginManifest } from "../../../../../platform/agentPlugins/common/agentPluginParser.js";
import { deduplicateMarketplaceReferences, MarketplaceReferenceKind, parseMarketplaceObjectEntry, parseMarketplaceReference, parseMarketplaceReferences, readConfiguredMarketplaces } from "./marketplaceReference.js";
import { getStrictKnownMarketplaces, isMarketplaceReferenceAllowed } from "./strictKnownMarketplaces.js";
import { deduplicateMarketplaceReferences as deduplicateMarketplaceReferences2, extraKnownMarketplacesToConfigDict, MarketplaceReferenceKind as MarketplaceReferenceKind2, parseMarketplaceReference as parseMarketplaceReference2, parseMarketplaceReferences as parseMarketplaceReferences2, readConfiguredMarketplaces as readConfiguredMarketplaces2 } from "./marketplaceReference.js";
var MarketplaceType = /* @__PURE__ */ ((MarketplaceType2) => {
  MarketplaceType2["Copilot"] = "copilot";
  MarketplaceType2["Claude"] = "claude";
  MarketplaceType2["OpenPlugin"] = "openPlugin";
  return MarketplaceType2;
})(MarketplaceType || {});
var PluginSourceKind = /* @__PURE__ */ ((PluginSourceKind2) => {
  PluginSourceKind2["RelativePath"] = "relativePath";
  PluginSourceKind2["GitHub"] = "github";
  PluginSourceKind2["GitUrl"] = "url";
  PluginSourceKind2["Npm"] = "npm";
  PluginSourceKind2["Pip"] = "pip";
  return PluginSourceKind2;
})(PluginSourceKind || {});
const IPluginMarketplaceService = createDecorator("pluginMarketplaceService");
const MARKETPLACE_DEFINITIONS = [
  { type: "openPlugin" /* OpenPlugin */, path: "marketplace.json" },
  { type: "openPlugin" /* OpenPlugin */, path: ".plugin/marketplace.json" },
  { type: "copilot" /* Copilot */, path: ".github/plugin/marketplace.json" },
  { type: "claude" /* Claude */, path: ".claude-plugin/marketplace.json" }
];
const SINGLE_PLUGIN_MANIFEST_DEFINITIONS = [
  { type: "openPlugin" /* OpenPlugin */, path: ".plugin/plugin.json" },
  { type: "claude" /* Claude */, path: ".claude-plugin/plugin.json" },
  { type: "copilot" /* Copilot */, path: "plugin.json" }
];
const GITHUB_MARKETPLACE_CACHE_TTL_MS = 8 * 60 * 60 * 1e3;
const GITHUB_MARKETPLACE_CACHE_STORAGE_KEY = "chat.plugins.marketplaces.githubCache.v1";
const PLUGIN_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1e3;
const PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY = "chat.plugins.lastUpdateCheck.v1";
function ensureSourceDescriptor(plugin) {
  if (plugin.sourceDescriptor) {
    return plugin;
  }
  return {
    ...plugin,
    sourceDescriptor: { kind: "relativePath" /* RelativePath */, path: plugin.source }
  };
}
const trustedMarketplacesMemento = observableMemento({
  defaultValue: [],
  key: "chat.plugins.trustedMarketplaces.v1",
  toStorage: (value) => JSON.stringify(value),
  fromStorage: (value) => {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
});
const lastFetchedPluginsMemento = observableMemento({
  defaultValue: { plugins: [], fetchedAt: 0 },
  key: "chat.plugins.lastFetchedPlugins.v2",
  toStorage: (value) => JSON.stringify(value),
  fromStorage: (value) => {
    const parsed = JSON.parse(value);
    if (parsed && Array.isArray(parsed.plugins)) {
      return parsed;
    }
    return { plugins: [], fetchedAt: 0 };
  }
});
let PluginMarketplaceService = class extends Disposable {
  constructor(_configurationService, _requestService, environmentService, _fileService, _pluginRepositoryService, _logService, _storageService, _workspacePluginSettingsService, _workspaceTrustService, _extensionsWorkbenchService) {
    super();
    this._configurationService = _configurationService;
    this._requestService = _requestService;
    this._fileService = _fileService;
    this._pluginRepositoryService = _pluginRepositoryService;
    this._logService = _logService;
    this._storageService = _storageService;
    this._workspacePluginSettingsService = _workspacePluginSettingsService;
    this._workspaceTrustService = _workspaceTrustService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._gitHubMarketplaceCache = new Lazy(() => this._loadPersistedGitHubMarketplaceCache());
    this._pluginMetadata = /* @__PURE__ */ new Map();
    this._marketplacesWithUpdates = observableValue("marketplacesWithUpdates", /* @__PURE__ */ new Set());
    this.marketplacesWithUpdates = this._marketplacesWithUpdates;
    const oldCacheRoot = joinPath(environmentService.cacheHome, "agentPlugins");
    this._installedPluginsStore = this._register(
      new FileBackedInstalledPluginsStore(
        _pluginRepositoryService.agentPluginsHome,
        oldCacheRoot,
        _fileService,
        _logService,
        _storageService
      )
    );
    this._trustedMarketplacesStore = this._register(
      trustedMarketplacesMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, _storageService)
    );
    this._lastFetchedPluginsStore = this._register(
      lastFetchedPluginsMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, _storageService)
    );
    this.lastFetchedPlugins = this._lastFetchedPluginsStore.map((s) => {
      const revived = revive(s);
      return revived.plugins.map(ensureSourceDescriptor);
    });
    this.installedPlugins = this._installedPluginsStore.value.map((entries) => {
      const result = [];
      for (const e of entries) {
        const plugin = this._pluginMetadata.get(e.pluginUri.toString());
        if (plugin) {
          result.push({ pluginUri: e.pluginUri, plugin });
        }
      }
      return result;
    });
    const workspaceTrusted = observableFromEvent(this, this._workspaceTrustService.onDidChangeTrust, () => this._workspaceTrustService.isWorkspaceTrusted());
    this.recommendedPlugins = derived((reader) => {
      if (!workspaceTrusted.read(reader)) {
        return /* @__PURE__ */ new Set();
      }
      const enabledMap = this._workspacePluginSettingsService.enabledPlugins.read(reader);
      const keys = /* @__PURE__ */ new Set();
      for (const [key, value] of enabledMap) {
        if (value) {
          keys.add(key);
        }
      }
      return keys;
    });
    this.onDidChangeMarketplaces = Event.any(
      Event.filter(
        _configurationService.onDidChangeConfiguration,
        (e) => e.affectsConfiguration(ChatConfiguration.PluginsEnabled) || e.affectsConfiguration(ChatConfiguration.PluginMarketplaces) || e.affectsConfiguration(ChatConfiguration.ExtraMarketplaces)
      ),
      Event.fromObservableLight(this._workspacePluginSettingsService.extraMarketplaces),
      Event.map(this._workspaceTrustService.onDidChangeTrust, () => {
      })
    );
    this._register(runWhenGlobalIdle(() => {
      this._scheduleUpdateCheck();
      this._register(Event.filter(
        _configurationService.onDidChangeConfiguration,
        (e) => e.affectsConfiguration(AutoUpdateConfigurationKey) || e.affectsConfiguration(ChatConfiguration.ExtraMarketplaces) || e.affectsConfiguration(ChatConfiguration.StrictMarketplaces)
      )(() => {
        this.clearUpdatesAvailable();
        this._scheduleUpdateCheck();
      }));
    }));
    this._register(autorun((reader) => {
      const entries = this._installedPluginsStore.value.read(reader);
      const unhydrated = entries.filter((e) => !this._pluginMetadata.has(e.pluginUri.toString()));
      if (unhydrated.length > 0) {
        this._hydratePluginMetadata(unhydrated);
      }
    }));
  }
  dispose() {
    if (this._updateCheckTimer !== void 0) {
      clearTimeout(this._updateCheckTimer);
      this._updateCheckTimer = void 0;
    }
    super.dispose();
  }
  clearUpdatesAvailable(marketplaceIds) {
    if (!marketplaceIds) {
      this._marketplacesWithUpdates.set(/* @__PURE__ */ new Set(), void 0);
      return;
    }
    const remaining = new Set([...this._marketplacesWithUpdates.get()].filter((id) => !marketplaceIds.has(id)));
    this._marketplacesWithUpdates.set(remaining, void 0);
  }
  async fetchMarketplacePlugins(token, marketplaceIds) {
    if (!this._configurationService.getValue(ChatConfiguration.PluginsEnabled)) {
      return [];
    }
    const { effectiveValues } = readConfiguredMarketplaces(this._configurationService);
    const configRefs = parseMarketplaceReferences(effectiveValues);
    let allRefs;
    if (this._workspaceTrustService.isWorkspaceTrusted()) {
      const workspaceEntries = this._workspacePluginSettingsService.extraMarketplaces.get();
      allRefs = deduplicateMarketplaceReferences(workspaceEntries.map((e) => e.reference), configRefs);
    } else {
      allRefs = configRefs;
    }
    for (const value of effectiveValues) {
      const parsed = typeof value === "string" ? parseMarketplaceReference(value) : value && typeof value === "object" ? parseMarketplaceObjectEntry(value) : void 0;
      if (!parsed) {
        this._logService.debug(`[PluginMarketplaceService] Ignoring invalid marketplace entry: ${String(value)}`);
      }
    }
    const refsToFetch = allRefs.filter(
      (ref) => (!marketplaceIds || marketplaceIds.has(ref.canonicalId)) && this._isMarketplaceAllowedByStrictPolicy(ref)
    );
    const results = await Promise.all(
      refsToFetch.map((ref) => {
        if (ref.kind === MarketplaceReferenceKind.GitHubShorthand && ref.githubRepo) {
          return this._fetchFromGitHubRepo(ref, ref.githubRepo, token);
        }
        return this._fetchFromClonedRepo(ref, token);
      })
    );
    const plugins = results.flat();
    const storedPlugins = marketplaceIds ? [...this.lastFetchedPlugins.get().filter((plugin) => !marketplaceIds.has(plugin.marketplaceReference.canonicalId)), ...plugins] : plugins;
    this._lastFetchedPluginsStore.set({ plugins: storedPlugins, fetchedAt: Date.now() }, void 0);
    return plugins;
  }
  async _fetchFromGitHubRepo(reference, repo, token) {
    const cache = this._gitHubMarketplaceCache.value;
    const cached = this._getCachedGitHubMarketplacePlugins(cache, reference.canonicalId);
    if (cached) {
      return cached.map((c) => ({
        ...c,
        marketplace: reference.displayLabel,
        marketplaceReference: reference
      }));
    }
    let repoMayBePrivate = true;
    const plugins = await this._readPluginsFromDefinitions(reference, async (defPath) => {
      if (token.isCancellationRequested) {
        return void 0;
      }
      const ref = encodeURIComponent(reference.ref ?? "main");
      const url = `https://raw.githubusercontent.com/${repo}/${ref}/${defPath}`;
      try {
        const context = await this._requestService.request({ type: "GET", url, callSite: "pluginMarketplaceService.fetchPluginList" }, token);
        const statusCode = context.res.statusCode;
        if (statusCode !== 200) {
          repoMayBePrivate &&= statusCode !== void 0 && statusCode >= 400 && statusCode < 500;
          this._logService.debug(`[PluginMarketplaceService] ${url} returned status ${statusCode}, skipping`);
          return void 0;
        }
        return await asJson(context) ?? void 0;
      } catch (err) {
        this._logService.debug(`[PluginMarketplaceService] Failed to fetch marketplace.json from ${url}:`, err);
        return void 0;
      }
    });
    if (plugins.length > 0) {
      cache.set(reference.canonicalId, {
        plugins,
        expiresAt: Date.now() + GITHUB_MARKETPLACE_CACHE_TTL_MS,
        referenceRawValue: reference.rawValue
      });
      this._savePersistedGitHubMarketplaceCache(cache);
      return plugins;
    }
    if (repoMayBePrivate) {
      this._logService.debug(`[PluginMarketplaceService] ${repo} may be private, attempting clone-based marketplace discovery`);
      return this._fetchFromClonedRepo(reference, token);
    }
    this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${repo}`);
    return [];
  }
  _getCachedGitHubMarketplacePlugins(cache, cacheKey) {
    const cached = cache.get(cacheKey);
    if (!cached) {
      return void 0;
    }
    if (cached.expiresAt <= Date.now()) {
      cache.delete(cacheKey);
      this._savePersistedGitHubMarketplaceCache(cache);
      return void 0;
    }
    return [...cached.plugins];
  }
  _loadPersistedGitHubMarketplaceCache() {
    const cache = /* @__PURE__ */ new Map();
    const now = Date.now();
    const stored = this._storageService.getObject(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
    if (!stored) {
      return cache;
    }
    const revived = revive(stored);
    for (const [cacheKey, entry] of Object.entries(revived)) {
      if (!entry || !Array.isArray(entry.plugins) || typeof entry.expiresAt !== "number" || entry.expiresAt <= now || typeof entry.referenceRawValue !== "string") {
        continue;
      }
      const reference = parseMarketplaceReference(entry.referenceRawValue);
      if (!reference) {
        continue;
      }
      const plugins = entry.plugins.map((plugin) => ensureSourceDescriptor({
        ...plugin,
        marketplace: reference.displayLabel,
        marketplaceReference: reference
      }));
      cache.set(cacheKey, {
        plugins,
        expiresAt: entry.expiresAt,
        referenceRawValue: entry.referenceRawValue
      });
    }
    return cache;
  }
  _savePersistedGitHubMarketplaceCache(cache) {
    const serialized = {};
    for (const [cacheKey, entry] of cache) {
      if (!entry.plugins.length || entry.expiresAt <= Date.now()) {
        continue;
      }
      serialized[cacheKey] = {
        expiresAt: entry.expiresAt,
        referenceRawValue: entry.referenceRawValue,
        plugins: entry.plugins
      };
    }
    if (Object.keys(serialized).length === 0) {
      this._storageService.remove(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
      return;
    }
    this._storageService.store(
      GITHUB_MARKETPLACE_CACHE_STORAGE_KEY,
      JSON.stringify(serialized),
      StorageScope.APPLICATION,
      StorageTarget.MACHINE
    );
  }
  getMarketplacePluginMetadata(pluginUri) {
    return this._pluginMetadata.get(pluginUri.toString()) ?? [...this._pluginMetadata.entries()].find(([key]) => isEqualOrParent(pluginUri, URI.parse(key)))?.[1];
  }
  addInstalledPlugin(pluginUri, plugin) {
    this._pluginMetadata.set(pluginUri.toString(), plugin);
    const entry = {
      pluginUri,
      marketplace: plugin.marketplaceReference.rawValue,
      name: plugin.name
    };
    const current = this._installedPluginsStore.get();
    const existing = current.find((e) => isEqual(e.pluginUri, pluginUri));
    if (existing) {
      this._installedPluginsStore.set(current.map((c) => c === existing ? entry : c), void 0);
    } else {
      this._installedPluginsStore.set([...current, entry], void 0);
    }
  }
  removeInstalledPlugin(pluginUri) {
    this._pluginMetadata.delete(pluginUri.toString());
    const current = this._installedPluginsStore.get();
    this._installedPluginsStore.set(current.filter((e) => !isEqual(e.pluginUri, pluginUri)), void 0);
  }
  isMarketplaceTrusted(ref) {
    const allowlist = getStrictKnownMarketplaces(this._configurationService.getValue(ChatConfiguration.StrictMarketplaces));
    if (allowlist !== void 0) {
      return isMarketplaceReferenceAllowed(allowlist, ref);
    }
    return this._trustedMarketplacesStore.get().includes(ref.canonicalId);
  }
  isStrictMarketplacePolicyActive() {
    return getStrictKnownMarketplaces(this._configurationService.getValue(ChatConfiguration.StrictMarketplaces)) !== void 0;
  }
  isMarketplaceAutoUpdateEnabled(ref) {
    const { extraValues } = readConfiguredMarketplaces(this._configurationService);
    const managedRef = parseMarketplaceReferences(extraValues).find((candidate) => candidate.canonicalId === ref.canonicalId);
    return managedRef?.autoUpdate ?? this._extensionsWorkbenchService.getAutoUpdateValue() !== "off";
  }
  _isMarketplaceAllowedByStrictPolicy(ref) {
    return !this.isStrictMarketplacePolicyActive() || this.isMarketplaceTrusted(ref);
  }
  // --- Plugin metadata hydration -----------------------------------------------
  /**
   * Hydrates installed entries from marketplace metadata. Entries written
   * by current builds include the marketplace plugin name, which is enough
   * to re-read the full plugin descriptor from the marketplace source. Old
   * entries without a name fall back to matching by install URI.
   *
   * After hydration completes the installed-plugins store is "touched" so
   * that the derived {@link installedPlugins} observable re-evaluates with
   * the newly available metadata.
   */
  async _hydratePluginMetadata(entries) {
    let hydrated = 0;
    for (const entry of entries) {
      const key = entry.pluginUri.toString();
      if (this._pluginMetadata.has(key)) {
        continue;
      }
      const reference = parseMarketplaceReference(entry.marketplace);
      if (!reference) {
        this._logService.debug(`[PluginMarketplaceService] Cannot parse marketplace reference '${entry.marketplace}' for ${key}`);
        continue;
      }
      try {
        const plugins = await this._readPluginsForInstalledEntry(reference, CancellationToken.None);
        const match = plugins.find((p) => entry.name ? p.name === entry.name : isEqual(this._pluginRepositoryService.getPluginInstallUri(p), entry.pluginUri));
        if (match) {
          this._pluginMetadata.set(key, match);
          hydrated++;
        }
      } catch (err) {
        this._logService.debug(`[PluginMarketplaceService] Failed to hydrate metadata for ${key}:`, err);
      }
    }
    if (hydrated > 0) {
      const current = this._installedPluginsStore.get();
      this._installedPluginsStore.set([...current], void 0);
    }
  }
  async _readPluginsForInstalledEntry(reference, token) {
    if (reference.kind === MarketplaceReferenceKind.GitHubShorthand && reference.githubRepo) {
      return this._fetchFromGitHubRepo(reference, reference.githubRepo, token);
    }
    const repoDir = this._pluginRepositoryService.getRepositoryUri(reference);
    let plugins = await this._readPluginsFromDirectory(repoDir, reference, token);
    if (plugins.length === 0) {
      const single = await this.readSinglePluginManifest(repoDir, reference);
      if (single) {
        plugins = [single];
      }
    }
    return plugins;
  }
  /**
   * Shared logic to parse a marketplace.json into {@link IMarketplacePlugin}
   * objects. Used by both fetch and hydration paths.
   */
  _parseMarketplacePlugins(json, reference, marketplaceType, repoDir) {
    if (!json.plugins || !Array.isArray(json.plugins)) {
      return [];
    }
    return json.plugins.filter(
      (p) => typeof p.name === "string" && !!p.name
    ).flatMap((p) => {
      const sourceDescriptor = parsePluginSource(p.source, json.metadata?.pluginRoot, {
        pluginName: p.name,
        logService: this._logService,
        logPrefix: "[PluginMarketplaceService]"
      });
      if (!sourceDescriptor) {
        return [];
      }
      const source = sourceDescriptor.kind === "relativePath" /* RelativePath */ ? sourceDescriptor.path : "";
      return [{
        name: p.name,
        description: p.description ?? "",
        version: p.version ?? "",
        source,
        sourceDescriptor,
        marketplace: reference.displayLabel,
        marketplaceReference: reference,
        marketplaceType,
        readmeUri: repoDir ? getMarketplaceReadmeFileUri(repoDir, source) : getMarketplaceReadmeUri(reference.githubRepo ?? "", source)
      }];
    });
  }
  trustMarketplace(ref) {
    const current = this._trustedMarketplacesStore.get();
    if (!current.includes(ref.canonicalId)) {
      this._trustedMarketplacesStore.set([...current, ref.canonicalId], void 0);
    }
  }
  // --- Periodic update check ------------------------------------------------
  _hasAutoUpdateEnabledMarketplace() {
    if (this._extensionsWorkbenchService.getAutoUpdateValue() !== "off") {
      return true;
    }
    const { extraValues } = readConfiguredMarketplaces(this._configurationService);
    return parseMarketplaceReferences(extraValues).some((ref) => ref.autoUpdate === true);
  }
  /**
   * (Re-)schedules the next periodic update check. Called on
   * construction and whenever the auto-update config changes.
   */
  _scheduleUpdateCheck() {
    if (this._updateCheckTimer !== void 0) {
      clearTimeout(this._updateCheckTimer);
      this._updateCheckTimer = void 0;
    }
    if (!this._hasAutoUpdateEnabledMarketplace()) {
      return;
    }
    const lastCheck = this._storageService.getNumber(
      PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY,
      StorageScope.APPLICATION,
      0
    );
    const elapsed = Date.now() - lastCheck;
    const delay = Math.max(0, PLUGIN_UPDATE_CHECK_INTERVAL_MS - elapsed);
    this._updateCheckTimer = setTimeout(() => this._runUpdateCheck(), delay);
  }
  async _runUpdateCheck() {
    this._updateCheckTimer = void 0;
    try {
      const installed = this.installedPlugins.get();
      if (installed.length === 0) {
        return;
      }
      const seenMarketplaces = /* @__PURE__ */ new Set();
      const marketplacesWithUpdates = /* @__PURE__ */ new Set();
      for (const entry of installed) {
        const ref = entry.plugin.marketplaceReference;
        if (seenMarketplaces.has(ref.canonicalId) || !this.isMarketplaceAutoUpdateEnabled(ref) || !this._isMarketplaceAllowedByStrictPolicy(ref)) {
          continue;
        }
        seenMarketplaces.add(ref.canonicalId);
        try {
          const behind = await this._pluginRepositoryService.fetchRepository(ref);
          if (behind) {
            marketplacesWithUpdates.add(ref.canonicalId);
          }
        } catch (err) {
          this._logService.debug(`[PluginMarketplaceService] Update check failed for ${ref.displayLabel}:`, err);
        }
      }
      this._marketplacesWithUpdates.set(marketplacesWithUpdates, void 0);
      this._storageService.store(
        PLUGIN_UPDATE_LAST_CHECK_STORAGE_KEY,
        Date.now(),
        StorageScope.APPLICATION,
        StorageTarget.MACHINE
      );
    } catch (err) {
      this._logService.debug("[PluginMarketplaceService] Periodic update check failed:", err);
    } finally {
      if (this._hasAutoUpdateEnabledMarketplace()) {
        this._updateCheckTimer = setTimeout(() => this._runUpdateCheck(), PLUGIN_UPDATE_CHECK_INTERVAL_MS);
      }
    }
  }
  async _fetchFromClonedRepo(reference, token) {
    let repoDir;
    try {
      repoDir = await this._pluginRepositoryService.ensureRepository(reference);
    } catch (err) {
      this._logService.debug(`[PluginMarketplaceService] Failed to prepare marketplace repository ${reference.rawValue}:`, err);
      return [];
    }
    return this._readPluginsFromDirectory(repoDir, reference, token);
  }
  async readPluginsFromDirectory(repoDir, reference) {
    return this._readPluginsFromDirectory(repoDir, reference);
  }
  async readSinglePluginManifest(repoDir, reference) {
    if (reference.kind !== MarketplaceReferenceKind.GitHubShorthand && reference.kind !== MarketplaceReferenceKind.GitUri) {
      return void 0;
    }
    const sourceDescriptor = reference.kind === MarketplaceReferenceKind.GitHubShorthand ? { kind: "github" /* GitHub */, repo: reference.githubRepo } : { kind: "url" /* GitUrl */, url: reference.cloneUrl };
    const agentManifest = await readAgentPluginManifest(repoDir, this._fileService);
    if (agentManifest) {
      return {
        name: agentManifest.name ?? reference.displayLabel,
        description: agentManifest.description ?? "",
        version: agentManifest.version ?? "",
        source: "",
        sourceDescriptor,
        marketplace: reference.displayLabel,
        marketplaceReference: reference,
        marketplaceType: "openPlugin" /* OpenPlugin */
      };
    }
    for (const def of SINGLE_PLUGIN_MANIFEST_DEFINITIONS) {
      const manifestUri = joinPath(repoDir, def.path);
      let manifest;
      try {
        const contents = await this._fileService.readFile(manifestUri);
        const parsed = parseJSONC(contents.value.toString());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          manifest = parsed;
        }
      } catch {
        continue;
      }
      if (!manifest) {
        continue;
      }
      const manifestName = typeof manifest["name"] === "string" && manifest["name"] ? manifest["name"] : reference.displayLabel;
      const manifestDescription = typeof manifest["description"] === "string" ? manifest["description"] : "";
      const manifestVersion = typeof manifest["version"] === "string" ? manifest["version"] : "";
      return {
        name: manifestName,
        description: manifestDescription,
        version: manifestVersion,
        source: "",
        sourceDescriptor,
        marketplace: reference.displayLabel,
        marketplaceReference: reference,
        marketplaceType: def.type
      };
    }
    this._logService.debug(`[PluginMarketplaceService] No single-plugin manifest found in ${reference.rawValue}`);
    return void 0;
  }
  async isPluginDirectory(repoDir) {
    if (await readAgentPluginManifest(repoDir, this._fileService)) {
      return true;
    }
    for (const def of SINGLE_PLUGIN_MANIFEST_DEFINITIONS) {
      if (await this._fileService.exists(joinPath(repoDir, def.path))) {
        return true;
      }
    }
    return false;
  }
  async _readPluginsFromDirectory(repoDir, reference, token) {
    return this._readPluginsFromDefinitions(reference, async (defPath) => {
      if (token?.isCancellationRequested) {
        return void 0;
      }
      const definitionUri = joinPath(repoDir, defPath);
      try {
        const contents = await this._fileService.readFile(definitionUri);
        return parseJSONC(contents.value.toString());
      } catch {
        return void 0;
      }
    }, repoDir);
  }
  /**
   * Iterates over {@link MARKETPLACE_DEFINITIONS} paths, calling
   * {@link readJson} for each to obtain the parsed JSON. Returns the
   * plugins from the first definition that yields a valid result.
   */
  async _readPluginsFromDefinitions(reference, readJson, repoDir) {
    for (const def of MARKETPLACE_DEFINITIONS) {
      const json = await readJson(def.path);
      if (!json?.plugins || !Array.isArray(json.plugins)) {
        continue;
      }
      return this._parseMarketplacePlugins(json, reference, def.type, repoDir);
    }
    this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${reference.rawValue}`);
    return [];
  }
};
PluginMarketplaceService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IRequestService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IAgentPluginRepositoryService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkspacePluginSettingsService),
  __decorateParam(8, IWorkspaceTrustManagementService),
  __decorateParam(9, IExtensionsWorkbenchService)
], PluginMarketplaceService);
function normalizeMarketplacePath(value) {
  let normalized = value.trim().replace(/\\/g, "/");
  normalized = normalized.replace(/^\.?\/+/, "").replace(/\/+$/g, "");
  return normalized;
}
function resolvePluginSource(pluginRoot, source) {
  const normalizedRoot = pluginRoot ? normalizeMarketplacePath(pluginRoot) : "";
  const normalizedSource = normalizeMarketplacePath(source);
  const repoRoot = URI.file("/");
  const pluginRootUri = normalizedRoot ? normalizePath(joinPath(repoRoot, normalizedRoot)) : repoRoot;
  if (normalizedRoot && (normalizedSource === normalizedRoot || normalizedSource.startsWith(`${normalizedRoot}/`))) {
    return normalizedSource;
  }
  const resolvedUri = normalizePath(joinPath(pluginRootUri, normalizedSource));
  return relativePath(repoRoot, resolvedUri) ?? void 0;
}
function parsePluginSource(rawSource, pluginRoot, logContext) {
  if (rawSource === void 0 || rawSource === null) {
    const resolved = resolvePluginSource(pluginRoot, "");
    if (resolved === void 0) {
      return void 0;
    }
    return { kind: "relativePath" /* RelativePath */, path: resolved };
  }
  if (typeof rawSource === "string") {
    const resolved = resolvePluginSource(pluginRoot, rawSource);
    if (resolved === void 0) {
      return void 0;
    }
    return { kind: "relativePath" /* RelativePath */, path: resolved };
  }
  if (typeof rawSource !== "object" || typeof rawSource.source !== "string") {
    logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': source object is missing a 'source' discriminant`);
    return void 0;
  }
  switch (rawSource.source) {
    case "github": {
      if (typeof rawSource.repo !== "string" || !rawSource.repo) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source is missing required 'repo' field`);
        return void 0;
      }
      if (!isValidGitHubRepo(rawSource.repo)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source repo must be in 'owner/repo' format`);
        return void 0;
      }
      if (!isOptionalString(rawSource.ref)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source 'ref' must be a string when provided`);
        return void 0;
      }
      if (!isOptionalGitSha(rawSource.sha)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source 'sha' must be a full 40-character commit hash when provided`);
        return void 0;
      }
      if (!isOptionalString(rawSource.path)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': github source 'path' must be a string when provided`);
        return void 0;
      }
      return {
        kind: "github" /* GitHub */,
        repo: rawSource.repo,
        ref: rawSource.ref,
        sha: rawSource.sha,
        path: rawSource.path
      };
    }
    case "url":
    case "git-subdir": {
      if (typeof rawSource.url !== "string" || !rawSource.url) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': ${rawSource.source} source is missing required 'url' field`);
        return void 0;
      }
      if (rawSource.source === "url" && !rawSource.url.toLowerCase().endsWith(".git")) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': url source must end with '.git'`);
        return void 0;
      }
      if (!isOptionalString(rawSource.ref)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': ${rawSource.source} source 'ref' must be a string when provided`);
        return void 0;
      }
      if (!isOptionalGitSha(rawSource.sha)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': ${rawSource.source} source 'sha' must be a full 40-character commit hash when provided`);
        return void 0;
      }
      if (rawSource.source === "git-subdir") {
        if (typeof rawSource.path !== "string" || !rawSource.path) {
          logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': git-subdir source is missing required 'path' field`);
          return void 0;
        }
      } else if (!isOptionalString(rawSource.path)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': url source 'path' must be a string when provided`);
        return void 0;
      }
      return {
        kind: "url" /* GitUrl */,
        url: rawSource.url,
        ref: rawSource.ref,
        sha: rawSource.sha,
        path: rawSource.path
      };
    }
    case "npm": {
      if (typeof rawSource.package !== "string" || !rawSource.package) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': npm source is missing required 'package' field`);
        return void 0;
      }
      if (!isOptionalString(rawSource.version) || !isOptionalString(rawSource.registry)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': npm source 'version' and 'registry' must be strings when provided`);
        return void 0;
      }
      return {
        kind: "npm" /* Npm */,
        package: rawSource.package,
        version: rawSource.version,
        registry: rawSource.registry
      };
    }
    case "pip": {
      if (typeof rawSource.package !== "string" || !rawSource.package) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': pip source is missing required 'package' field`);
        return void 0;
      }
      if (!isOptionalString(rawSource.version) || !isOptionalString(rawSource.registry)) {
        logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': pip source 'version' and 'registry' must be strings when provided`);
        return void 0;
      }
      return {
        kind: "pip" /* Pip */,
        package: rawSource.package,
        version: rawSource.version,
        registry: rawSource.registry
      };
    }
    default:
      logContext.logService.warn(`${logContext.logPrefix} Skipping plugin '${logContext.pluginName}': unknown source kind '${rawSource.source}'`);
      return void 0;
  }
}
function isOptionalString(value) {
  return value === void 0 || typeof value === "string";
}
function isOptionalGitSha(value) {
  return value === void 0 || typeof value === "string" && /^[0-9a-fA-F]{40}$/.test(value);
}
function isValidGitHubRepo(repo) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}
function getPluginSourceLabel(descriptor) {
  switch (descriptor.kind) {
    case "relativePath" /* RelativePath */:
      return descriptor.path || ".";
    case "github" /* GitHub */:
      return descriptor.path ? `${descriptor.repo}/${descriptor.path}` : descriptor.repo;
    case "url" /* GitUrl */:
      return descriptor.path ? `${descriptor.url}/${descriptor.path}` : descriptor.url;
    case "npm" /* Npm */:
      return descriptor.version ? `${descriptor.package}@${descriptor.version}` : descriptor.package;
    case "pip" /* Pip */:
      return descriptor.version ? `${descriptor.package}==${descriptor.version}` : descriptor.package;
  }
}
function hasSourceChanged(installed, marketplace) {
  if (installed.kind !== marketplace.kind) {
    return true;
  }
  switch (installed.kind) {
    case "github" /* GitHub */:
      return installed.ref !== marketplace.ref || installed.sha !== marketplace.sha || installed.path !== marketplace.path;
    case "url" /* GitUrl */:
      return installed.ref !== marketplace.ref || installed.sha !== marketplace.sha || installed.path !== marketplace.path;
    case "npm" /* Npm */:
      return installed.version !== marketplace.version;
    case "pip" /* Pip */:
      return installed.version !== marketplace.version;
    default:
      return false;
  }
}
function getMarketplaceReadmeUri(repo, source) {
  const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, "");
  const readmePath = normalizedSource ? `${normalizedSource}/README.md` : "README.md";
  return URI.parse(`https://github.com/${repo}/blob/main/${readmePath}`);
}
function getMarketplaceReadmeFileUri(repoDir, source) {
  const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, "");
  return normalizedSource ? joinPath(repoDir, normalizedSource, "README.md") : joinPath(repoDir, "README.md");
}
export {
  IPluginMarketplaceService,
  MarketplaceReferenceKind2 as MarketplaceReferenceKind,
  MarketplaceType,
  PluginMarketplaceService,
  PluginSourceKind,
  deduplicateMarketplaceReferences2 as deduplicateMarketplaceReferences,
  extraKnownMarketplacesToConfigDict,
  getPluginSourceLabel,
  hasSourceChanged,
  parseMarketplaceReference2 as parseMarketplaceReference,
  parseMarketplaceReferences2 as parseMarketplaceReferences,
  parsePluginSource,
  readConfiguredMarketplaces2 as readConfiguredMarketplaces
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcnVuV2hlbkdsb2JhbElkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHBhcnNlIGFzIHBhcnNlSlNPTkMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgaXNFcXVhbE9yUGFyZW50LCBqb2luUGF0aCwgbm9ybWFsaXplUGF0aCwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlTWVtZW50bywgb2JzZXJ2YWJsZU1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9vYnNlcnZhYmxlTWVtZW50by5qcyc7XG5pbXBvcnQgeyBhc0pzb24sIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB0eXBlIHsgRHRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IEF1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5LCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVCYWNrZWRJbnN0YWxsZWRQbHVnaW5zU3RvcmUsIElTdG9yZWRJbnN0YWxsZWRQbHVnaW4gfSBmcm9tICcuL2ZpbGVCYWNrZWRJbnN0YWxsZWRQbHVnaW5zU3RvcmUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSB9IGZyb20gJy4vd29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyByZWFkQWdlbnRQbHVnaW5NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vYWdlbnRQbHVnaW5QYXJzZXIuanMnO1xuaW1wb3J0IHsgdHlwZSBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIGRlZHVwbGljYXRlTWFya2V0cGxhY2VSZWZlcmVuY2VzLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQsIHBhcnNlTWFya2V0cGxhY2VPYmplY3RFbnRyeSwgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSwgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMsIHJlYWRDb25maWd1cmVkTWFya2V0cGxhY2VzIH0gZnJvbSAnLi9tYXJrZXRwbGFjZVJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBnZXRTdHJpY3RLbm93bk1hcmtldHBsYWNlcywgaXNNYXJrZXRwbGFjZVJlZmVyZW5jZUFsbG93ZWQgfSBmcm9tICcuL3N0cmljdEtub3duTWFya2V0cGxhY2VzLmpzJztcblxuLy8gUmUtZXhwb3J0IG1hcmtldHBsYWNlIHJlZmVyZW5jZSB0eXBlcyBmb3IgZG93bnN0cmVhbSBjb25zdW1lcnMuXG5leHBvcnQgeyBkZWR1cGxpY2F0ZU1hcmtldHBsYWNlUmVmZXJlbmNlcywgZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcywgcmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXMgfSBmcm9tICcuL21hcmtldHBsYWNlUmVmZXJlbmNlLmpzJztcbmV4cG9ydCB0eXBlIHsgSUNvbmZpZ3VyZWRNYXJrZXRwbGFjZXMsIElNYXJrZXRwbGFjZVJlZmVyZW5jZSB9IGZyb20gJy4vbWFya2V0cGxhY2VSZWZlcmVuY2UuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBNYXJrZXRwbGFjZVR5cGUge1xuXHRDb3BpbG90ID0gJ2NvcGlsb3QnLFxuXHRDbGF1ZGUgPSAnY2xhdWRlJyxcblx0T3BlblBsdWdpbiA9ICdvcGVuUGx1Z2luJyxcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUGx1Z2luU291cmNlS2luZCB7XG5cdFJlbGF0aXZlUGF0aCA9ICdyZWxhdGl2ZVBhdGgnLFxuXHRHaXRIdWIgPSAnZ2l0aHViJyxcblx0R2l0VXJsID0gJ3VybCcsXG5cdE5wbSA9ICducG0nLFxuXHRQaXAgPSAncGlwJyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVsYXRpdmVQYXRoUGx1Z2luU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGg7XG5cdC8qKiBSZXNvbHZlZCByZWxhdGl2ZSBwYXRoIHdpdGhpbiB0aGUgbWFya2V0cGxhY2UgcmVwb3NpdG9yeS4gKi9cblx0cmVhZG9ubHkgcGF0aDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHaXRIdWJQbHVnaW5Tb3VyY2Uge1xuXHRyZWFkb25seSBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1Yjtcblx0cmVhZG9ubHkgcmVwbzogc3RyaW5nO1xuXHRyZWFkb25seSByZWY/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNoYT86IHN0cmluZztcblx0cmVhZG9ubHkgcGF0aD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2l0VXJsUGx1Z2luU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmw7XG5cdC8qKiBGdWxsIGdpdCByZXBvc2l0b3J5IFVSTCAobXVzdCBlbmQgd2l0aCAuZ2l0KS4gKi9cblx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlZj86IHN0cmluZztcblx0cmVhZG9ubHkgc2hhPzogc3RyaW5nO1xuXHQvKiogU3ViZGlyZWN0b3J5IHdpdGhpbiB0aGUgcmVwb3NpdG9yeSB3aGVyZSB0aGUgcGx1Z2luIGxpdmVzIChmb3IgYGdpdC1zdWJkaXJgIHNvdXJjZXMpLiAqL1xuXHRyZWFkb25seSBwYXRoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOcG1QbHVnaW5Tb3VyY2Uge1xuXHRyZWFkb25seSBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbTtcblx0cmVhZG9ubHkgcGFja2FnZTogc3RyaW5nO1xuXHRyZWFkb25seSB2ZXJzaW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSByZWdpc3RyeT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGlwUGx1Z2luU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogUGx1Z2luU291cmNlS2luZC5QaXA7XG5cdHJlYWRvbmx5IHBhY2thZ2U6IHN0cmluZztcblx0cmVhZG9ubHkgdmVyc2lvbj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVnaXN0cnk/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yID1cblx0fCBJUmVsYXRpdmVQYXRoUGx1Z2luU291cmNlXG5cdHwgSUdpdEh1YlBsdWdpblNvdXJjZVxuXHR8IElHaXRVcmxQbHVnaW5Tb3VyY2Vcblx0fCBJTnBtUGx1Z2luU291cmNlXG5cdHwgSVBpcFBsdWdpblNvdXJjZTtcblxuZXhwb3J0IGludGVyZmFjZSBJTWFya2V0cGxhY2VQbHVnaW4ge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0LyoqIFN1YmRpcmVjdG9yeSB3aXRoaW4gdGhlIHJlcG9zaXRvcnkgd2hlcmUgdGhlIHBsdWdpbiBsaXZlcyAoZm9yIHJlbGF0aXZlLXBhdGggc291cmNlcykuICovXG5cdHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nO1xuXHQvKiogU3RydWN0dXJlZCBzb3VyY2UgZGVzY3JpcHRvciBpbmRpY2F0aW5nIGhvdyB0aGUgcGx1Z2luIHNob3VsZCBiZSBmZXRjaGVkL2luc3RhbGxlZC4gKi9cblx0cmVhZG9ubHkgc291cmNlRGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3I7XG5cdC8qKiBNYXJrZXRwbGFjZSBsYWJlbCBzaG93biBpbiBVSSBhbmQgcGx1Z2luIHByb3ZlbmFuY2UuICovXG5cdHJlYWRvbmx5IG1hcmtldHBsYWNlOiBzdHJpbmc7XG5cdC8qKiBDYW5vbmljYWwgcmVmZXJlbmNlIGZvciBjbG9uZS91cGRhdGUvaW5zdGFsbCBsb2NhdGlvbiByZXNvbHV0aW9uLiAqL1xuXHRyZWFkb25seSBtYXJrZXRwbGFjZVJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlO1xuXHQvKiogVGhlIHR5cGUgb2YgbWFya2V0cGxhY2UgdGhpcyBwbHVnaW4gY29tZXMgZnJvbS4gKi9cblx0cmVhZG9ubHkgbWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGU7XG5cdHJlYWRvbmx5IHJlYWRtZVVyaT86IFVSSTtcbn1cblxuLyoqIFJhdyBKU09OIHNoYXBlIG9mIGEgcmVtb3RlIHBsdWdpbiBzb3VyY2Ugb2JqZWN0IGluIG1hcmtldHBsYWNlLmpzb24uICovXG5pbnRlcmZhY2UgSUpzb25QbHVnaW5Tb3VyY2Uge1xuXHRyZWFkb25seSBzb3VyY2U6IHN0cmluZztcblx0cmVhZG9ubHkgcmVwbz86IHN0cmluZztcblx0cmVhZG9ubHkgdXJsPzogc3RyaW5nO1xuXHRyZWFkb25seSBwYWNrYWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSByZWY/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNoYT86IHN0cmluZztcblx0cmVhZG9ubHkgcGF0aD86IHN0cmluZztcblx0cmVhZG9ubHkgdmVyc2lvbj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVnaXN0cnk/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJTWFya2V0cGxhY2VKc29uIHtcblx0cmVhZG9ubHkgbWV0YWRhdGE/OiB7XG5cdFx0cmVhZG9ubHkgcGx1Z2luUm9vdD86IHN0cmluZztcblx0fTtcblx0cmVhZG9ubHkgcGx1Z2lucz86IHJlYWRvbmx5IHtcblx0XHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHZlcnNpb24/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc291cmNlPzogc3RyaW5nIHwgSUpzb25QbHVnaW5Tb3VyY2U7XG5cdH1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWFya2V0cGxhY2VJbnN0YWxsZWRQbHVnaW4ge1xuXHRyZWFkb25seSBwbHVnaW5Vcmk6IFVSSTtcblx0cmVhZG9ubHkgcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW47XG59XG5cbmV4cG9ydCBjb25zdCBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U+KCdwbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1hcmtldHBsYWNlczogRXZlbnQ8dm9pZD47XG5cdC8qKiBJbnN0YWxsZWQgbWFya2V0cGxhY2UgcGx1Z2lucywgYmFja2VkIGJ5IHN0b3JhZ2UuICovXG5cdHJlYWRvbmx5IGluc3RhbGxlZFBsdWdpbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElNYXJrZXRwbGFjZUluc3RhbGxlZFBsdWdpbltdPjtcblx0LyoqIENhbm9uaWNhbCBJRHMgb2YgbWFya2V0cGxhY2VzIHdpdGggdXBkYXRlcyBkZXRlY3RlZCBieSB0aGUgcGVyaW9kaWMgY2hlY2suICovXG5cdHJlYWRvbmx5IG1hcmtldHBsYWNlc1dpdGhVcGRhdGVzOiBJT2JzZXJ2YWJsZTxSZWFkb25seVNldDxzdHJpbmc+Pjtcblx0LyoqXG5cdCAqIE9ic2VydmFibGUgc25hcHNob3Qgb2YgdGhlIGxhc3Qge0BsaW5rIGZldGNoTWFya2V0cGxhY2VQbHVnaW5zfSByZXN1bHQuXG5cdCAqIEVtcHR5IHVudGlsIHRoZSBmaXJzdCBmZXRjaCBjb21wbGV0ZXMuIFZpZXdzIHNob3VsZCB1c2UgdGhpcyBmb3Jcblx0ICogc3luY2hyb25vdXMgb3V0ZGF0ZWQtZGV0ZWN0aW9uIGluc3RlYWQgb2YgY2FsbGluZyBmZXRjaE1hcmtldHBsYWNlUGx1Z2lucy5cblx0ICovXG5cdHJlYWRvbmx5IGxhc3RGZXRjaGVkUGx1Z2luczogSU9ic2VydmFibGU8cmVhZG9ubHkgSU1hcmtldHBsYWNlUGx1Z2luW10+O1xuXHQvKipcblx0ICogU2V0IG9mIHJlY29tbWVuZGVkIHBsdWdpbiBrZXlzIChgXCJwbHVnaW5OYW1lQG1hcmtldHBsYWNlTmFtZVwiYCkgYWdncmVnYXRlZFxuXHQgKiBmcm9tIHdvcmtzcGFjZS1kZWZpbmVkIHNldHRpbmdzIChlLmcuIGAuY2xhdWRlL3NldHRpbmdzLmpzb25gKS4gUHJvdmlkZXJzXG5cdCAqIG1heSBiZSBhZGRlZCBvdmVyIHRpbWU7IGNvbnN1bWVycyBzaG91bGQgbm90IGFzc3VtZSBhIHNwZWNpZmljIHNvdXJjZS5cblx0ICovXG5cdHJlYWRvbmx5IHJlY29tbWVuZGVkUGx1Z2luczogSU9ic2VydmFibGU8UmVhZG9ubHlTZXQ8c3RyaW5nPj47XG5cdC8qKiBDbGVhcnMgYWxsIHJlcG9ydGVkIG1hcmtldHBsYWNlcywgb3Igb25seSB0aGUgcHJvdmlkZWQgY2Fub25pY2FsIElEcy4gKi9cblx0Y2xlYXJVcGRhdGVzQXZhaWxhYmxlKG1hcmtldHBsYWNlSWRzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHZvaWQ7XG5cdGZldGNoTWFya2V0cGxhY2VQbHVnaW5zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgbWFya2V0cGxhY2VJZHM/OiBSZWFkb25seVNldDxzdHJpbmc+KTogUHJvbWlzZTxJTWFya2V0cGxhY2VQbHVnaW5bXT47XG5cdGdldE1hcmtldHBsYWNlUGx1Z2luTWV0YWRhdGEocGx1Z2luVXJpOiBVUkkpOiBJTWFya2V0cGxhY2VQbHVnaW4gfCB1bmRlZmluZWQ7XG5cdGFkZEluc3RhbGxlZFBsdWdpbihwbHVnaW5Vcmk6IFVSSSwgcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pOiB2b2lkO1xuXHRyZW1vdmVJbnN0YWxsZWRQbHVnaW4ocGx1Z2luVXJpOiBVUkkpOiB2b2lkO1xuXHQvKiogUmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBtYXJrZXRwbGFjZSBpcyB0cnVzdGVkIFx1MjAxNCBlaXRoZXIgZXhwbGljaXRseSB0cnVzdGVkIGJ5IHRoZSB1c2VyLCBvciBhbGxvd2VkIGJ5IHRoZSBlbnRlcnByaXNlIGFsbG93bGlzdCB3aGVuIHN0cmljdCBtb2RlIGlzIGFjdGl2ZS4gKi9cblx0aXNNYXJrZXRwbGFjZVRydXN0ZWQocmVmOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpOiBib29sZWFuO1xuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBzdHJpY3QtbWFya2V0cGxhY2UgZW50ZXJwcmlzZSBwb2xpY3lcblx0ICogKGBjaGF0LnBsdWdpbnMuc3RyaWN0TWFya2V0cGxhY2VzYCkgaXMgYWN0aXZlIFx1MjAxNCBpLmUuIGFuIGFsbG93bGlzdCBpc1xuXHQgKiBjb25maWd1cmVkLiBXaGVuIGFjdGl2ZSwgYmxvY2tlZCBtYXJrZXRwbGFjZXMgY2Fubm90IGJlIHRydXN0ZWQgYnkgdGhlIHVzZXIuXG5cdCAqL1xuXHRpc1N0cmljdE1hcmtldHBsYWNlUG9saWN5QWN0aXZlKCk6IGJvb2xlYW47XG5cdC8qKiBSZXR1cm5zIHRoZSBlZmZlY3RpdmUgYXV0b21hdGljLXVwZGF0ZSBwb2xpY3kgZm9yIGEgbWFya2V0cGxhY2UuICovXG5cdGlzTWFya2V0cGxhY2VBdXRvVXBkYXRlRW5hYmxlZChyZWY6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSk6IGJvb2xlYW47XG5cdC8qKiBSZWNvcmRzIHRoYXQgdGhlIHVzZXIgdHJ1c3RzIHRoZSBnaXZlbiBtYXJrZXRwbGFjZSwgcGVyc2lzdGVkIHBlcm1hbmVudGx5LiAqL1xuXHR0cnVzdE1hcmtldHBsYWNlKHJlZjogSU1hcmtldHBsYWNlUmVmZXJlbmNlKTogdm9pZDtcblx0LyoqXG5cdCAqIFJlYWRzIG1hcmtldHBsYWNlIGRlZmluaXRpb24gZmlsZXMgZnJvbSBhbiBhbHJlYWR5LWNsb25lZCByZXBvc2l0b3J5XG5cdCAqIGRpcmVjdG9yeSBhbmQgcmV0dXJucyB0aGUgZGVjbGFyZWQgcGx1Z2lucy4gVXNlZCBieSBkaXJlY3QtaW5zdGFsbCBmbG93c1xuXHQgKiB0aGF0IGNsb25lIGEgcmVwbyBmaXJzdCwgdGhlbiBuZWVkIHRvIGRpc2NvdmVyIGl0cyBwbHVnaW5zLlxuXHQgKi9cblx0cmVhZFBsdWdpbnNGcm9tRGlyZWN0b3J5KHJlcG9EaXI6IFVSSSwgcmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpOiBQcm9taXNlPElNYXJrZXRwbGFjZVBsdWdpbltdPjtcblx0LyoqXG5cdCAqIFJlYWRzIGEgc2luZ2xlLXBsdWdpbiBtYW5pZmVzdCAoZS5nLiBgLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb25gKSBhdCB0aGVcblx0ICogcm9vdCBvZiBhbiBhbHJlYWR5LWNsb25lZCByZXBvc2l0b3J5IGRpcmVjdG9yeSBhbmQgcmV0dXJucyBhIHN5bnRoZXNpc2VkXG5cdCAqIHtAbGluayBJTWFya2V0cGxhY2VQbHVnaW59IGRlc2NyaWJpbmcgdGhlIHJlcG9zaXRvcnkgYXMgYSBzaW5nbGUgcGx1Z2luLlxuXHQgKiBVc2VkIGJ5IGRpcmVjdC1pbnN0YWxsIGZsb3dzIHdoZW4ge0BsaW5rIHJlYWRQbHVnaW5zRnJvbURpcmVjdG9yeX0gZmluZHNcblx0ICogbm8gbWFya2V0cGxhY2UgaW5kZXguXG5cdCAqXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBubyByZWNvZ25pc2VkIG1hbmlmZXN0IGlzIHByZXNlbnQgYXQgdGhlIHJlcG9cblx0ICogcm9vdC5cblx0ICovXG5cdHJlYWRTaW5nbGVQbHVnaW5NYW5pZmVzdChyZXBvRGlyOiBVUkksIHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlKTogUHJvbWlzZTxJTWFya2V0cGxhY2VQbHVnaW4gfCB1bmRlZmluZWQ+O1xuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBkaXJlY3RvcnkgaXMgYSBzdGFuZGFsb25lIHBsdWdpbiBcdTIwMTQgaS5lLiBpdFxuXHQgKiBjb250YWlucyBhIHNpbmdsZS1wbHVnaW4gbWFuaWZlc3QgKGUuZy4gYC5wbHVnaW4vcGx1Z2luLmpzb25gLFxuXHQgKiBgLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb25gLCBvciBgcGx1Z2luLmpzb25gKSBhdCBpdHMgcm9vdCBidXQgaXMgbm90IGFcblx0ICogbWFya2V0cGxhY2UuIFVzZWQgYnkgZGlyZWN0LWluc3RhbGwgZmxvd3MgdG8gcm91dGUgYSBsb2NhbCBmb2xkZXIgdG8gdGhlXG5cdCAqIGFwcHJvcHJpYXRlIGNvbmZpZ3VyYXRpb24uXG5cdCAqL1xuXHRpc1BsdWdpbkRpcmVjdG9yeShyZXBvRGlyOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG4vKipcbiAqIE1hcmtldHBsYWNlIGRlZmluaXRpb24gZmlsZXMgYnkgdHlwZSwgY2hlY2tlZCBpbiBvcmRlciBwZXIgcmVwb3NpdG9yeS5cbiAqIFRoZSBmaXJzdCBtYXRjaCBkZXRlcm1pbmVzIHRoZSBtYXJrZXRwbGFjZSB0eXBlLlxuICovXG5jb25zdCBNQVJLRVRQTEFDRV9ERUZJTklUSU9OUzogeyB0eXBlOiBNYXJrZXRwbGFjZVR5cGU7IHBhdGg6IHN0cmluZyB9W10gPSBbXG5cdHsgdHlwZTogTWFya2V0cGxhY2VUeXBlLk9wZW5QbHVnaW4sIHBhdGg6ICdtYXJrZXRwbGFjZS5qc29uJyB9LFxuXHR7IHR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLCBwYXRoOiAnLnBsdWdpbi9tYXJrZXRwbGFjZS5qc29uJyB9LFxuXHR7IHR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LCBwYXRoOiAnLmdpdGh1Yi9wbHVnaW4vbWFya2V0cGxhY2UuanNvbicgfSxcblx0eyB0eXBlOiBNYXJrZXRwbGFjZVR5cGUuQ2xhdWRlLCBwYXRoOiAnLmNsYXVkZS1wbHVnaW4vbWFya2V0cGxhY2UuanNvbicgfSxcbl07XG5cbi8qKlxuICogU2luZ2xlLXBsdWdpbiBtYW5pZmVzdCBmaWxlcyBieSB0eXBlLCBjaGVja2VkIGluIG9yZGVyLiBVc2VkIHdoZW4gYSBjbG9uZWRcbiAqIHNvdXJjZSByZXBvc2l0b3J5IGhhcyBubyBtYXJrZXRwbGFjZSBpbmRleCBcdTIwMTQgdGhlIHJlcG9zaXRvcnkgaXRzZWxmIGlzIHRoZVxuICogcGx1Z2luLiBPcmRlciBtYXRjaGVzIHtAbGluayBkZXRlY3RQbHVnaW5Gb3JtYXR9IHNvIHRoYXQgcnVudGltZSBmb3JtYXRcbiAqIGRldGVjdGlvbiBsYXRlciBhZ3JlZXMgd2l0aCB0aGUgbWFya2V0cGxhY2UgdHlwZSBjaG9zZW4gaGVyZS5cbiAqL1xuY29uc3QgU0lOR0xFX1BMVUdJTl9NQU5JRkVTVF9ERUZJTklUSU9OUzogeyB0eXBlOiBNYXJrZXRwbGFjZVR5cGU7IHBhdGg6IHN0cmluZyB9W10gPSBbXG5cdHsgdHlwZTogTWFya2V0cGxhY2VUeXBlLk9wZW5QbHVnaW4sIHBhdGg6ICcucGx1Z2luL3BsdWdpbi5qc29uJyB9LFxuXHR7IHR5cGU6IE1hcmtldHBsYWNlVHlwZS5DbGF1ZGUsIHBhdGg6ICcuY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbicgfSxcblx0eyB0eXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCwgcGF0aDogJ3BsdWdpbi5qc29uJyB9LFxuXTtcblxuY29uc3QgR0lUSFVCX01BUktFVFBMQUNFX0NBQ0hFX1RUTF9NUyA9IDggKiA2MCAqIDYwICogMTAwMDtcbmNvbnN0IEdJVEhVQl9NQVJLRVRQTEFDRV9DQUNIRV9TVE9SQUdFX0tFWSA9ICdjaGF0LnBsdWdpbnMubWFya2V0cGxhY2VzLmdpdGh1YkNhY2hlLnYxJztcblxuLyoqIEludGVydmFsIGJldHdlZW4gcGVyaW9kaWMgcGx1Z2luIHVwZGF0ZSBjaGVja3MgKDI0IGhvdXJzKS4gKi9cbmNvbnN0IFBMVUdJTl9VUERBVEVfQ0hFQ0tfSU5URVJWQUxfTVMgPSAyNCAqIDYwICogNjAgKiAxMDAwO1xuXG5jb25zdCBQTFVHSU5fVVBEQVRFX0xBU1RfQ0hFQ0tfU1RPUkFHRV9LRVkgPSAnY2hhdC5wbHVnaW5zLmxhc3RVcGRhdGVDaGVjay52MSc7XG5cbmludGVyZmFjZSBJR2l0SHViTWFya2V0cGxhY2VDYWNoZUVudHJ5IHtcblx0cmVhZG9ubHkgcGx1Z2luczogcmVhZG9ubHkgSU1hcmtldHBsYWNlUGx1Z2luW107XG5cdHJlYWRvbmx5IGV4cGlyZXNBdDogbnVtYmVyO1xuXHRyZWFkb25seSByZWZlcmVuY2VSYXdWYWx1ZTogc3RyaW5nO1xufVxuXG50eXBlIElTdG9yZWRHaXRIdWJNYXJrZXRwbGFjZUNhY2hlID0gRHRvPFJlY29yZDxzdHJpbmcsIElHaXRIdWJNYXJrZXRwbGFjZUNhY2hlRW50cnk+PjtcblxuLyoqXG4gKiBFbnN1cmVzIHRoYXQgYW4ge0BsaW5rIElNYXJrZXRwbGFjZVBsdWdpbn0gbG9hZGVkIGZyb20gc3RvcmFnZSBoYXMgYVxuICoge0BsaW5rIElNYXJrZXRwbGFjZVBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yIHNvdXJjZURlc2NyaXB0b3J9LiBQbHVnaW5zXG4gKiBwZXJzaXN0ZWQgYmVmb3JlIHRoZSBzb3VyY2VEZXNjcmlwdG9yIGZpZWxkIHdhcyBpbnRyb2R1Y2VkIHdpbGwgb25seVxuICogaGF2ZSB0aGUgbGVnYWN5IGBzb3VyY2VgIHN0cmluZyBcdTIwMTQgdGhpcyBmdW5jdGlvbiBzeW50aGVzaXNlcyBhXG4gKiB7QGxpbmsgUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGh9IGRlc2NyaXB0b3IgZnJvbSBpdC5cbiAqL1xuZnVuY3Rpb24gZW5zdXJlU291cmNlRGVzY3JpcHRvcihwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IElNYXJrZXRwbGFjZVBsdWdpbiB7XG5cdGlmIChwbHVnaW4uc291cmNlRGVzY3JpcHRvcikge1xuXHRcdHJldHVybiBwbHVnaW47XG5cdH1cblx0cmV0dXJuIHtcblx0XHQuLi5wbHVnaW4sXG5cdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogcGx1Z2luLnNvdXJjZSB9LFxuXHR9O1xufVxuXG5jb25zdCB0cnVzdGVkTWFya2V0cGxhY2VzTWVtZW50byA9IG9ic2VydmFibGVNZW1lbnRvPHJlYWRvbmx5IHN0cmluZ1tdPih7XG5cdGRlZmF1bHRWYWx1ZTogW10sXG5cdGtleTogJ2NoYXQucGx1Z2lucy50cnVzdGVkTWFya2V0cGxhY2VzLnYxJyxcblx0dG9TdG9yYWdlOiB2YWx1ZSA9PiBKU09OLnN0cmluZ2lmeSh2YWx1ZSksXG5cdGZyb21TdG9yYWdlOiB2YWx1ZSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh2YWx1ZSk7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZCA6IFtdO1xuXHR9LFxufSk7XG5cbmludGVyZmFjZSBJU3RvcmVkTGFzdEZldGNoZWRQbHVnaW5zIHtcblx0cmVhZG9ubHkgcGx1Z2luczogcmVhZG9ubHkgSU1hcmtldHBsYWNlUGx1Z2luW107XG5cdHJlYWRvbmx5IGZldGNoZWRBdDogbnVtYmVyO1xufVxuXG5jb25zdCBsYXN0RmV0Y2hlZFBsdWdpbnNNZW1lbnRvID0gb2JzZXJ2YWJsZU1lbWVudG88SVN0b3JlZExhc3RGZXRjaGVkUGx1Z2lucz4oe1xuXHRkZWZhdWx0VmFsdWU6IHsgcGx1Z2luczogW10sIGZldGNoZWRBdDogMCB9LFxuXHRrZXk6ICdjaGF0LnBsdWdpbnMubGFzdEZldGNoZWRQbHVnaW5zLnYyJyxcblx0dG9TdG9yYWdlOiB2YWx1ZSA9PiBKU09OLnN0cmluZ2lmeSh2YWx1ZSksXG5cdGZyb21TdG9yYWdlOiB2YWx1ZSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh2YWx1ZSk7XG5cdFx0aWYgKHBhcnNlZCAmJiBBcnJheS5pc0FycmF5KHBhcnNlZC5wbHVnaW5zKSkge1xuXHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcGx1Z2luczogW10sIGZldGNoZWRBdDogMCB9O1xuXHR9LFxufSk7XG5cbmV4cG9ydCBjbGFzcyBQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJNYXJrZXRwbGFjZUNhY2hlID0gbmV3IExhenk8TWFwPHN0cmluZywgSUdpdEh1Yk1hcmtldHBsYWNlQ2FjaGVFbnRyeT4+KCgpID0+IHRoaXMuX2xvYWRQZXJzaXN0ZWRHaXRIdWJNYXJrZXRwbGFjZUNhY2hlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YWxsZWRQbHVnaW5zU3RvcmU6IEZpbGVCYWNrZWRJbnN0YWxsZWRQbHVnaW5zU3RvcmU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BsdWdpbk1ldGFkYXRhID0gbmV3IE1hcDxzdHJpbmcsIElNYXJrZXRwbGFjZVBsdWdpbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJ1c3RlZE1hcmtldHBsYWNlc1N0b3JlOiBPYnNlcnZhYmxlTWVtZW50bzxyZWFkb25seSBzdHJpbmdbXT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhc3RGZXRjaGVkUGx1Z2luc1N0b3JlOiBPYnNlcnZhYmxlTWVtZW50bzxJU3RvcmVkTGFzdEZldGNoZWRQbHVnaW5zPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFya2V0cGxhY2VzV2l0aFVwZGF0ZXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj4oJ21hcmtldHBsYWNlc1dpdGhVcGRhdGVzJywgbmV3IFNldCgpKTtcblx0cHJpdmF0ZSBfdXBkYXRlQ2hlY2tUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNYXJrZXRwbGFjZXM6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IGluc3RhbGxlZFBsdWdpbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElNYXJrZXRwbGFjZUluc3RhbGxlZFBsdWdpbltdPjtcblx0cmVhZG9ubHkgbWFya2V0cGxhY2VzV2l0aFVwZGF0ZXM6IElPYnNlcnZhYmxlPFJlYWRvbmx5U2V0PHN0cmluZz4+ID0gdGhpcy5fbWFya2V0cGxhY2VzV2l0aFVwZGF0ZXM7XG5cdHJlYWRvbmx5IGxhc3RGZXRjaGVkUGx1Z2luczogSU9ic2VydmFibGU8cmVhZG9ubHkgSU1hcmtldHBsYWNlUGx1Z2luW10+O1xuXHRyZWFkb25seSByZWNvbW1lbmRlZFBsdWdpbnM6IElPYnNlcnZhYmxlPFJlYWRvbmx5U2V0PHN0cmluZz4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2U6IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlOiBJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEZpbGUtYmFja2VkIHN0b3JlIGZvciBpbnN0YWxsZWQgcGx1Z2lucy4gVGhlIG9sZCBjYWNoZSBsb2NhdGlvblxuXHRcdC8vIGlzIHBhc3NlZCBzbyB0aGUgc3RvcmUgY2FuIHJlYmFzZSBVUklzIGR1cmluZyBtaWdyYXRpb24uXG5cdFx0Y29uc3Qgb2xkQ2FjaGVSb290ID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmNhY2hlSG9tZSwgJ2FnZW50UGx1Z2lucycpO1xuXHRcdHRoaXMuX2luc3RhbGxlZFBsdWdpbnNTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0bmV3IEZpbGVCYWNrZWRJbnN0YWxsZWRQbHVnaW5zU3RvcmUoXG5cdFx0XHRcdF9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5hZ2VudFBsdWdpbnNIb21lLFxuXHRcdFx0XHRvbGRDYWNoZVJvb3QsXG5cdFx0XHRcdF9maWxlU2VydmljZSxcblx0XHRcdFx0X2xvZ1NlcnZpY2UsXG5cdFx0XHRcdF9zdG9yYWdlU2VydmljZSxcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0dGhpcy5fdHJ1c3RlZE1hcmtldHBsYWNlc1N0b3JlID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHR0cnVzdGVkTWFya2V0cGxhY2VzTWVtZW50byhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgX3N0b3JhZ2VTZXJ2aWNlKVxuXHRcdCk7XG5cblx0XHR0aGlzLl9sYXN0RmV0Y2hlZFBsdWdpbnNTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0bGFzdEZldGNoZWRQbHVnaW5zTWVtZW50byhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgX3N0b3JhZ2VTZXJ2aWNlKVxuXHRcdCk7XG5cblx0XHR0aGlzLmxhc3RGZXRjaGVkUGx1Z2lucyA9IHRoaXMuX2xhc3RGZXRjaGVkUGx1Z2luc1N0b3JlLm1hcChzID0+IHtcblx0XHRcdGNvbnN0IHJldml2ZWQgPSByZXZpdmUocykgYXMgSVN0b3JlZExhc3RGZXRjaGVkUGx1Z2lucztcblx0XHRcdHJldHVybiByZXZpdmVkLnBsdWdpbnMubWFwKGVuc3VyZVNvdXJjZURlc2NyaXB0b3IpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5pbnN0YWxsZWRQbHVnaW5zID0gdGhpcy5faW5zdGFsbGVkUGx1Z2luc1N0b3JlLnZhbHVlLm1hcChlbnRyaWVzID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSU1hcmtldHBsYWNlSW5zdGFsbGVkUGx1Z2luW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IHBsdWdpbiA9IHRoaXMuX3BsdWdpbk1ldGFkYXRhLmdldChlLnBsdWdpblVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKHBsdWdpbikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgcGx1Z2luVXJpOiBlLnBsdWdpblVyaSwgcGx1Z2luIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWdncmVnYXRlIHJlY29tbWVuZGVkIHBsdWdpbiBrZXlzIGZyb20gYWxsIHByb3ZpZGVycy5cblx0XHQvLyBDdXJyZW50bHkgc291cmNlZCBmcm9tIENsYXVkZSB3b3Jrc3BhY2Ugc2V0dGluZ3M7IG1vcmUgcHJvdmlkZXJzIGNhbiBiZVxuXHRcdC8vIGFkZGVkIGhlcmUgdmlhIGFkZGl0aW9uYWwgb2JzZXJ2YWJsZXMgaW4gdGhlIGRlcml2ZWQgY29tcHV0YXRpb24uXG5cdFx0Ly8gT25seSBleHBvc2UgcmVjb21tZW5kYXRpb25zIHdoZW4gdGhlIHdvcmtzcGFjZSBpcyB0cnVzdGVkLlxuXHRcdGNvbnN0IHdvcmtzcGFjZVRydXN0ZWQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX3dvcmtzcGFjZVRydXN0U2VydmljZS5vbkRpZENoYW5nZVRydXN0LCAoKSA9PiB0aGlzLl93b3Jrc3BhY2VUcnVzdFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpO1xuXHRcdHRoaXMucmVjb21tZW5kZWRQbHVnaW5zID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCF3b3Jrc3BhY2VUcnVzdGVkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbmFibGVkTWFwID0gdGhpcy5fd29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIGVuYWJsZWRNYXApIHtcblx0XHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdFx0a2V5cy5hZGQoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGtleXM7XG5cdFx0fSk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlTWFya2V0cGxhY2VzID0gRXZlbnQuYW55KFxuXHRcdFx0RXZlbnQuZmlsdGVyKFxuXHRcdFx0XHRfY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLFxuXHRcdFx0XHRlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkV4dHJhTWFya2V0cGxhY2VzKSxcblx0XHRcdCkgYXMgRXZlbnQ8dW5rbm93bj4gYXMgRXZlbnQ8dm9pZD4sXG5cdFx0XHRFdmVudC5mcm9tT2JzZXJ2YWJsZUxpZ2h0KHRoaXMuX3dvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZS5leHRyYU1hcmtldHBsYWNlcyksXG5cdFx0XHRFdmVudC5tYXAodGhpcy5fd29ya3NwYWNlVHJ1c3RTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QsICgpID0+IHsgfSksXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bldoZW5HbG9iYWxJZGxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlVXBkYXRlQ2hlY2soKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihcblx0XHRcdFx0X2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbixcblx0XHRcdFx0ZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKEF1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5KVxuXHRcdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRXh0cmFNYXJrZXRwbGFjZXMpXG5cdFx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5TdHJpY3RNYXJrZXRwbGFjZXMpLFxuXHRcdFx0KSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYXJVcGRhdGVzQXZhaWxhYmxlKCk7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlVXBkYXRlQ2hlY2soKTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIeWRyYXRlIHBsdWdpbiBtZXRhZGF0YSBmb3IgaW5zdGFsbGVkIGVudHJpZXMgdGhhdCBhcmUgbm90IHlldCBpblxuXHRcdC8vIHRoZSBpbi1tZW1vcnkgY2FjaGUgKGUuZy4gYWZ0ZXIgcmVzdGFydCB3aGVuIGluc3RhbGxlZC5qc29uIGlzIHJlYWRcblx0XHQvLyBidXQgdGhlIG1ldGFkYXRhIG1hcCBpcyBlbXB0eSkuIE1vZGVybiBlbnRyaWVzIG1hdGNoIGJ5IHBsdWdpbiBuYW1lO1xuXHRcdC8vIG9sZGVyIGVudHJpZXMgd2l0aG91dCBuYW1lcyBmYWxsIGJhY2sgdG8gbWF0Y2hpbmcgYnkgaW5zdGFsbCBVUkkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2luc3RhbGxlZFBsdWdpbnNTdG9yZS52YWx1ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB1bmh5ZHJhdGVkID0gZW50cmllcy5maWx0ZXIoZSA9PiAhdGhpcy5fcGx1Z2luTWV0YWRhdGEuaGFzKGUucGx1Z2luVXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdGlmICh1bmh5ZHJhdGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5faHlkcmF0ZVBsdWdpbk1ldGFkYXRhKHVuaHlkcmF0ZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3VwZGF0ZUNoZWNrVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3VwZGF0ZUNoZWNrVGltZXIpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ2hlY2tUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Y2xlYXJVcGRhdGVzQXZhaWxhYmxlKG1hcmtldHBsYWNlSWRzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHZvaWQge1xuXHRcdGlmICghbWFya2V0cGxhY2VJZHMpIHtcblx0XHRcdHRoaXMuX21hcmtldHBsYWNlc1dpdGhVcGRhdGVzLnNldChuZXcgU2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbWFpbmluZyA9IG5ldyBTZXQoWy4uLnRoaXMuX21hcmtldHBsYWNlc1dpdGhVcGRhdGVzLmdldCgpXS5maWx0ZXIoaWQgPT4gIW1hcmtldHBsYWNlSWRzLmhhcyhpZCkpKTtcblx0XHR0aGlzLl9tYXJrZXRwbGFjZXNXaXRoVXBkYXRlcy5zZXQocmVtYWluaW5nLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2hNYXJrZXRwbGFjZVBsdWdpbnModG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtYXJrZXRwbGFjZUlkcz86IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBQcm9taXNlPElNYXJrZXRwbGFjZVBsdWdpbltdPiB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBFZmZlY3RpdmUgc2V0OiB1c2VyLWZhY2luZyBgY2hhdC5wbHVnaW5zLm1hcmtldHBsYWNlc2AgKGRlZmF1bHQgKyB1c2VyKVxuXHRcdC8vIHVuaW9uZWQgd2l0aCB0aGUgZW50ZXJwcmlzZSBwb2xpY3ktb25seSBgY2hhdC5wbHVnaW5zLmV4dHJhTWFya2V0cGxhY2VzYC5cblx0XHQvLyBgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXNgIGRlZHVwZXMgYnkgY2Fub25pY2FsIGlkLlxuXHRcdGNvbnN0IHsgZWZmZWN0aXZlVmFsdWVzIH0gPSByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlnUmVmcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKGVmZmVjdGl2ZVZhbHVlcyk7XG5cblx0XHQvLyBNZXJnZSBtYXJrZXRwbGFjZSByZWZlcmVuY2VzIGZyb20gQ2xhdWRlIHdvcmtzcGFjZSBzZXR0aW5ncy5cblx0XHQvLyBXb3Jrc3BhY2UtZGVmaW5lZCByZWZzIHRha2UgcHJlY2VkZW5jZSAoYXJlIHByaW1hcnkpIHNvIHRoYXQgdGhlaXJcblx0XHQvLyBkaXNwbGF5TGFiZWwgb3ZlcnJpZGVzIGFueSBtYXRjaGluZyBnbG9iYWwgbWFya2V0cGxhY2UgZW50cnkuXG5cdFx0Ly8gT25seSBpbmNsdWRlIHdvcmtzcGFjZS1zb3VyY2VkIHJlZnMgd2hlbiB0aGUgd29ya3NwYWNlIGlzIHRydXN0ZWQuXG5cdFx0bGV0IGFsbFJlZnM6IElNYXJrZXRwbGFjZVJlZmVyZW5jZVtdO1xuXHRcdGlmICh0aGlzLl93b3Jrc3BhY2VUcnVzdFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUVudHJpZXMgPSB0aGlzLl93b3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UuZXh0cmFNYXJrZXRwbGFjZXMuZ2V0KCk7XG5cdFx0XHRhbGxSZWZzID0gZGVkdXBsaWNhdGVNYXJrZXRwbGFjZVJlZmVyZW5jZXMod29ya3NwYWNlRW50cmllcy5tYXAoZSA9PiBlLnJlZmVyZW5jZSksIGNvbmZpZ1JlZnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhbGxSZWZzID0gY29uZmlnUmVmcztcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIGVmZmVjdGl2ZVZhbHVlcykge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UodmFsdWUpXG5cdFx0XHRcdDogKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBwYXJzZU1hcmtldHBsYWNlT2JqZWN0RW50cnkodmFsdWUgYXMgUGFyYW1ldGVyczx0eXBlb2YgcGFyc2VNYXJrZXRwbGFjZU9iamVjdEVudHJ5PlswXSkgOiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1BsdWdpbk1hcmtldHBsYWNlU2VydmljZV0gSWdub3JpbmcgaW52YWxpZCBtYXJrZXRwbGFjZSBlbnRyeTogJHtTdHJpbmcodmFsdWUpfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlZnNUb0ZldGNoID0gYWxsUmVmcy5maWx0ZXIocmVmID0+XG5cdFx0XHQoIW1hcmtldHBsYWNlSWRzIHx8IG1hcmtldHBsYWNlSWRzLmhhcyhyZWYuY2Fub25pY2FsSWQpKVxuXHRcdFx0JiYgdGhpcy5faXNNYXJrZXRwbGFjZUFsbG93ZWRCeVN0cmljdFBvbGljeShyZWYpXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHRyZWZzVG9GZXRjaC5tYXAocmVmID0+IHtcblx0XHRcdFx0aWYgKHJlZi5raW5kID09PSBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0SHViU2hvcnRoYW5kICYmIHJlZi5naXRodWJSZXBvKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2ZldGNoRnJvbUdpdEh1YlJlcG8ocmVmLCByZWYuZ2l0aHViUmVwbywgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLl9mZXRjaEZyb21DbG9uZWRSZXBvKHJlZiwgdG9rZW4pO1xuXHRcdFx0fSlcblx0XHQpO1xuXHRcdGNvbnN0IHBsdWdpbnMgPSByZXN1bHRzLmZsYXQoKTtcblx0XHRjb25zdCBzdG9yZWRQbHVnaW5zID0gbWFya2V0cGxhY2VJZHNcblx0XHRcdD8gWy4uLnRoaXMubGFzdEZldGNoZWRQbHVnaW5zLmdldCgpLmZpbHRlcihwbHVnaW4gPT4gIW1hcmtldHBsYWNlSWRzLmhhcyhwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWQpKSwgLi4ucGx1Z2luc11cblx0XHRcdDogcGx1Z2lucztcblx0XHR0aGlzLl9sYXN0RmV0Y2hlZFBsdWdpbnNTdG9yZS5zZXQoeyBwbHVnaW5zOiBzdG9yZWRQbHVnaW5zLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfSwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gcGx1Z2lucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoRnJvbUdpdEh1YlJlcG8ocmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIHJlcG86IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWFya2V0cGxhY2VQbHVnaW5bXT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gdGhpcy5fZ2l0SHViTWFya2V0cGxhY2VDYWNoZS52YWx1ZTtcblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX2dldENhY2hlZEdpdEh1Yk1hcmtldHBsYWNlUGx1Z2lucyhjYWNoZSwgcmVmZXJlbmNlLmNhbm9uaWNhbElkKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkLm1hcChjID0+ICh7XG5cdFx0XHRcdC4uLmMsXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWZlcmVuY2UuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmZXJlbmNlLFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGxldCByZXBvTWF5QmVQcml2YXRlID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLl9yZWFkUGx1Z2luc0Zyb21EZWZpbml0aW9ucyhyZWZlcmVuY2UsIGFzeW5jIChkZWZQYXRoKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlZiA9IGVuY29kZVVSSUNvbXBvbmVudChyZWZlcmVuY2UucmVmID8/ICdtYWluJyk7XG5cdFx0XHRjb25zdCB1cmwgPSBgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLyR7cmVwb30vJHtyZWZ9LyR7ZGVmUGF0aH1gO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3JlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB0eXBlOiAnR0VUJywgdXJsLCBjYWxsU2l0ZTogJ3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5mZXRjaFBsdWdpbkxpc3QnIH0sIHRva2VuKTtcblx0XHRcdFx0Y29uc3Qgc3RhdHVzQ29kZSA9IGNvbnRleHQucmVzLnN0YXR1c0NvZGU7XG5cdFx0XHRcdGlmIChzdGF0dXNDb2RlICE9PSAyMDApIHtcblx0XHRcdFx0XHRyZXBvTWF5QmVQcml2YXRlICYmPSBzdGF0dXNDb2RlICE9PSB1bmRlZmluZWQgJiYgc3RhdHVzQ29kZSA+PSA0MDAgJiYgc3RhdHVzQ29kZSA8IDUwMDtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlXSAke3VybH0gcmV0dXJuZWQgc3RhdHVzICR7c3RhdHVzQ29kZX0sIHNraXBwaW5nYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgYXNKc29uPElNYXJrZXRwbGFjZUpzb24+KGNvbnRleHQpID8/IHVuZGVmaW5lZDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlXSBGYWlsZWQgdG8gZmV0Y2ggbWFya2V0cGxhY2UuanNvbiBmcm9tICR7dXJsfTpgLCBlcnIpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHBsdWdpbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y2FjaGUuc2V0KHJlZmVyZW5jZS5jYW5vbmljYWxJZCwge1xuXHRcdFx0XHRwbHVnaW5zLFxuXHRcdFx0XHRleHBpcmVzQXQ6IERhdGUubm93KCkgKyBHSVRIVUJfTUFSS0VUUExBQ0VfQ0FDSEVfVFRMX01TLFxuXHRcdFx0XHRyZWZlcmVuY2VSYXdWYWx1ZTogcmVmZXJlbmNlLnJhd1ZhbHVlLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9zYXZlUGVyc2lzdGVkR2l0SHViTWFya2V0cGxhY2VDYWNoZShjYWNoZSk7XG5cdFx0XHRyZXR1cm4gcGx1Z2lucztcblx0XHR9XG5cblx0XHRpZiAocmVwb01heUJlUHJpdmF0ZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1BsdWdpbk1hcmtldHBsYWNlU2VydmljZV0gJHtyZXBvfSBtYXkgYmUgcHJpdmF0ZSwgYXR0ZW1wdGluZyBjbG9uZS1iYXNlZCBtYXJrZXRwbGFjZSBkaXNjb3ZlcnlgKTtcblx0XHRcdHJldHVybiB0aGlzLl9mZXRjaEZyb21DbG9uZWRSZXBvKHJlZmVyZW5jZSwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2VdIE5vIG1hcmtldHBsYWNlLmpzb24gZm91bmQgaW4gJHtyZXBvfWApO1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENhY2hlZEdpdEh1Yk1hcmtldHBsYWNlUGx1Z2lucyhjYWNoZTogTWFwPHN0cmluZywgSUdpdEh1Yk1hcmtldHBsYWNlQ2FjaGVFbnRyeT4sIGNhY2hlS2V5OiBzdHJpbmcpOiBJTWFya2V0cGxhY2VQbHVnaW5bXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FjaGVkID0gY2FjaGUuZ2V0KGNhY2hlS2V5KTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoY2FjaGVkLmV4cGlyZXNBdCA8PSBEYXRlLm5vdygpKSB7XG5cdFx0XHRjYWNoZS5kZWxldGUoY2FjaGVLZXkpO1xuXHRcdFx0dGhpcy5fc2F2ZVBlcnNpc3RlZEdpdEh1Yk1hcmtldHBsYWNlQ2FjaGUoY2FjaGUpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gWy4uLmNhY2hlZC5wbHVnaW5zXTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRQZXJzaXN0ZWRHaXRIdWJNYXJrZXRwbGFjZUNhY2hlKCk6IE1hcDxzdHJpbmcsIElHaXRIdWJNYXJrZXRwbGFjZUNhY2hlRW50cnk+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJR2l0SHViTWFya2V0cGxhY2VDYWNoZUVudHJ5PigpO1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3Qgc3RvcmVkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PElTdG9yZWRHaXRIdWJNYXJrZXRwbGFjZUNhY2hlPihHSVRIVUJfTUFSS0VUUExBQ0VfQ0FDSEVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFzdG9yZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZTtcblx0XHR9XG5cblx0XHRjb25zdCByZXZpdmVkID0gcmV2aXZlPElTdG9yZWRHaXRIdWJNYXJrZXRwbGFjZUNhY2hlPihzdG9yZWQpO1xuXG5cdFx0Zm9yIChjb25zdCBbY2FjaGVLZXksIGVudHJ5XSBvZiBPYmplY3QuZW50cmllcyhyZXZpdmVkKSkge1xuXHRcdFx0aWYgKCFlbnRyeSB8fCAhQXJyYXkuaXNBcnJheShlbnRyeS5wbHVnaW5zKSB8fCB0eXBlb2YgZW50cnkuZXhwaXJlc0F0ICE9PSAnbnVtYmVyJyB8fCBlbnRyeS5leHBpcmVzQXQgPD0gbm93IHx8IHR5cGVvZiBlbnRyeS5yZWZlcmVuY2VSYXdWYWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoZW50cnkucmVmZXJlbmNlUmF3VmFsdWUpO1xuXHRcdFx0aWYgKCFyZWZlcmVuY2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBsdWdpbnMgPSBlbnRyeS5wbHVnaW5zLm1hcChwbHVnaW4gPT4gZW5zdXJlU291cmNlRGVzY3JpcHRvcih7XG5cdFx0XHRcdC4uLnBsdWdpbixcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWZlcmVuY2UsXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNhY2hlLnNldChjYWNoZUtleSwge1xuXHRcdFx0XHRwbHVnaW5zLFxuXHRcdFx0XHRleHBpcmVzQXQ6IGVudHJ5LmV4cGlyZXNBdCxcblx0XHRcdFx0cmVmZXJlbmNlUmF3VmFsdWU6IGVudHJ5LnJlZmVyZW5jZVJhd1ZhbHVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhY2hlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVBlcnNpc3RlZEdpdEh1Yk1hcmtldHBsYWNlQ2FjaGUoY2FjaGU6IE1hcDxzdHJpbmcsIElHaXRIdWJNYXJrZXRwbGFjZUNhY2hlRW50cnk+KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZDogSVN0b3JlZEdpdEh1Yk1hcmtldHBsYWNlQ2FjaGUgPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtjYWNoZUtleSwgZW50cnldIG9mIGNhY2hlKSB7XG5cdFx0XHRpZiAoIWVudHJ5LnBsdWdpbnMubGVuZ3RoIHx8IGVudHJ5LmV4cGlyZXNBdCA8PSBEYXRlLm5vdygpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXJpYWxpemVkW2NhY2hlS2V5XSA9IHtcblx0XHRcdFx0ZXhwaXJlc0F0OiBlbnRyeS5leHBpcmVzQXQsXG5cdFx0XHRcdHJlZmVyZW5jZVJhd1ZhbHVlOiBlbnRyeS5yZWZlcmVuY2VSYXdWYWx1ZSxcblx0XHRcdFx0cGx1Z2luczogZW50cnkucGx1Z2lucyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKE9iamVjdC5rZXlzKHNlcmlhbGl6ZWQpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEdJVEhVQl9NQVJLRVRQTEFDRV9DQUNIRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdEdJVEhVQl9NQVJLRVRQTEFDRV9DQUNIRV9TVE9SQUdFX0tFWSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWQpLFxuXHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5NQUNISU5FLFxuXHRcdCk7XG5cdH1cblxuXHRnZXRNYXJrZXRwbGFjZVBsdWdpbk1ldGFkYXRhKHBsdWdpblVyaTogVVJJKTogSU1hcmtldHBsYWNlUGx1Z2luIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcGx1Z2luTWV0YWRhdGEuZ2V0KHBsdWdpblVyaS50b1N0cmluZygpKVxuXHRcdFx0Pz8gWy4uLnRoaXMuX3BsdWdpbk1ldGFkYXRhLmVudHJpZXMoKV0uZmluZCgoW2tleV0pID0+IGlzRXF1YWxPclBhcmVudChwbHVnaW5VcmksIFVSSS5wYXJzZShrZXkpKSk/LlsxXTtcblx0fVxuXG5cdGFkZEluc3RhbGxlZFBsdWdpbihwbHVnaW5Vcmk6IFVSSSwgcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pOiB2b2lkIHtcblx0XHR0aGlzLl9wbHVnaW5NZXRhZGF0YS5zZXQocGx1Z2luVXJpLnRvU3RyaW5nKCksIHBsdWdpbik7XG5cdFx0Y29uc3QgZW50cnk6IElTdG9yZWRJbnN0YWxsZWRQbHVnaW4gPSB7XG5cdFx0XHRwbHVnaW5VcmksXG5cdFx0XHRtYXJrZXRwbGFjZTogcGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLnJhd1ZhbHVlLFxuXHRcdFx0bmFtZTogcGx1Z2luLm5hbWUsXG5cdFx0fTtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5faW5zdGFsbGVkUGx1Z2luc1N0b3JlLmdldCgpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gY3VycmVudC5maW5kKGUgPT4gaXNFcXVhbChlLnBsdWdpblVyaSwgcGx1Z2luVXJpKSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHQvLyBTdGlsbCB1cGRhdGUgdG8gdHJpZ2dlciB3YXRjaGVycyB0byByZS1jaGVjaywgc29tZXRoaW5nIG1pZ2h0IGhhdmUgaGFwcGVuZWQgdGhhdCB3ZSB3YW50IHRvIGtub3cgYWJvdXRcblx0XHRcdHRoaXMuX2luc3RhbGxlZFBsdWdpbnNTdG9yZS5zZXQoY3VycmVudC5tYXAoYyA9PiBjID09PSBleGlzdGluZyA/IGVudHJ5IDogYyksIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2luc3RhbGxlZFBsdWdpbnNTdG9yZS5zZXQoWy4uLmN1cnJlbnQsIGVudHJ5XSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVJbnN0YWxsZWRQbHVnaW4ocGx1Z2luVXJpOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9wbHVnaW5NZXRhZGF0YS5kZWxldGUocGx1Z2luVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9pbnN0YWxsZWRQbHVnaW5zU3RvcmUuZ2V0KCk7XG5cdFx0dGhpcy5faW5zdGFsbGVkUGx1Z2luc1N0b3JlLnNldChjdXJyZW50LmZpbHRlcihlID0+ICFpc0VxdWFsKGUucGx1Z2luVXJpLCBwbHVnaW5VcmkpKSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGlzTWFya2V0cGxhY2VUcnVzdGVkKHJlZjogSU1hcmtldHBsYWNlUmVmZXJlbmNlKTogYm9vbGVhbiB7XG5cdFx0Ly8gSW4gc3RyaWN0IG1vZGUgKGBjaGF0LnBsdWdpbnMuc3RyaWN0TWFya2V0cGxhY2VzYCwgdHlwaWNhbGx5IGRlbGl2ZXJlZCB2aWEgdGhlXG5cdFx0Ly8gYENoYXRTdHJpY3RNYXJrZXRwbGFjZXNgIGVudGVycHJpc2UgcG9saWN5KSwgdHJ1c3QgaXMgZ292ZXJuZWQgZW50aXJlbHkgYnkgdGhlXG5cdFx0Ly8gYWxsb3dsaXN0OiBhIG1hcmtldHBsYWNlIGlzIHRydXN0ZWQgb25seSBpZiBpdCBtYXRjaGVzIG9uZSBvZiB0aGUgY29uZmlndXJlZFxuXHRcdC8vIHNvdXJjZSBlbnRyaWVzLiBUaGUgdXNlci10cnVzdGVkIHN0b3JlIGlzIGJ5cGFzc2VkIFx1MjAxNCB0aGF0J3MgdGhlIHdob2xlIHBvaW50IG9mXG5cdFx0Ly8gXCJzdHJpY3RcIjogdGhlIGVudGVycHJpc2UgZnVsbHkgY29udHJvbHMgdGhlIGFsbG93ZWQgbWFya2V0cGxhY2VzLlxuXHRcdGNvbnN0IGFsbG93bGlzdCA9IGdldFN0cmljdEtub3duTWFya2V0cGxhY2VzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENoYXRDb25maWd1cmF0aW9uLlN0cmljdE1hcmtldHBsYWNlcykpO1xuXHRcdGlmIChhbGxvd2xpc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGlzTWFya2V0cGxhY2VSZWZlcmVuY2VBbGxvd2VkKGFsbG93bGlzdCwgcmVmKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RydXN0ZWRNYXJrZXRwbGFjZXNTdG9yZS5nZXQoKS5pbmNsdWRlcyhyZWYuY2Fub25pY2FsSWQpO1xuXHR9XG5cblx0aXNTdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZ2V0U3RyaWN0S25vd25NYXJrZXRwbGFjZXModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uU3RyaWN0TWFya2V0cGxhY2VzKSkgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzTWFya2V0cGxhY2VBdXRvVXBkYXRlRW5hYmxlZChyZWY6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHsgZXh0cmFWYWx1ZXMgfSA9IHJlYWRDb25maWd1cmVkTWFya2V0cGxhY2VzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBtYW5hZ2VkUmVmID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMoZXh0cmFWYWx1ZXMpLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5jYW5vbmljYWxJZCA9PT0gcmVmLmNhbm9uaWNhbElkKTtcblx0XHRyZXR1cm4gbWFuYWdlZFJlZj8uYXV0b1VwZGF0ZSA/PyB0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRBdXRvVXBkYXRlVmFsdWUoKSAhPT0gJ29mZic7XG5cdH1cblxuXHRwcml2YXRlIF9pc01hcmtldHBsYWNlQWxsb3dlZEJ5U3RyaWN0UG9saWN5KHJlZjogSU1hcmtldHBsYWNlUmVmZXJlbmNlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmlzU3RyaWN0TWFya2V0cGxhY2VQb2xpY3lBY3RpdmUoKSB8fCB0aGlzLmlzTWFya2V0cGxhY2VUcnVzdGVkKHJlZik7XG5cdH1cblxuXHQvLyAtLS0gUGx1Z2luIG1ldGFkYXRhIGh5ZHJhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBIeWRyYXRlcyBpbnN0YWxsZWQgZW50cmllcyBmcm9tIG1hcmtldHBsYWNlIG1ldGFkYXRhLiBFbnRyaWVzIHdyaXR0ZW5cblx0ICogYnkgY3VycmVudCBidWlsZHMgaW5jbHVkZSB0aGUgbWFya2V0cGxhY2UgcGx1Z2luIG5hbWUsIHdoaWNoIGlzIGVub3VnaFxuXHQgKiB0byByZS1yZWFkIHRoZSBmdWxsIHBsdWdpbiBkZXNjcmlwdG9yIGZyb20gdGhlIG1hcmtldHBsYWNlIHNvdXJjZS4gT2xkXG5cdCAqIGVudHJpZXMgd2l0aG91dCBhIG5hbWUgZmFsbCBiYWNrIHRvIG1hdGNoaW5nIGJ5IGluc3RhbGwgVVJJLlxuXHQgKlxuXHQgKiBBZnRlciBoeWRyYXRpb24gY29tcGxldGVzIHRoZSBpbnN0YWxsZWQtcGx1Z2lucyBzdG9yZSBpcyBcInRvdWNoZWRcIiBzb1xuXHQgKiB0aGF0IHRoZSBkZXJpdmVkIHtAbGluayBpbnN0YWxsZWRQbHVnaW5zfSBvYnNlcnZhYmxlIHJlLWV2YWx1YXRlcyB3aXRoXG5cdCAqIHRoZSBuZXdseSBhdmFpbGFibGUgbWV0YWRhdGEuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oeWRyYXRlUGx1Z2luTWV0YWRhdGEoZW50cmllczogcmVhZG9ubHkgSVN0b3JlZEluc3RhbGxlZFBsdWdpbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGh5ZHJhdGVkID0gMDtcblxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gZW50cnkucGx1Z2luVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAodGhpcy5fcGx1Z2luTWV0YWRhdGEuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoZW50cnkubWFya2V0cGxhY2UpO1xuXHRcdFx0aWYgKCFyZWZlcmVuY2UpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1BsdWdpbk1hcmtldHBsYWNlU2VydmljZV0gQ2Fubm90IHBhcnNlIG1hcmtldHBsYWNlIHJlZmVyZW5jZSAnJHtlbnRyeS5tYXJrZXRwbGFjZX0nIGZvciAke2tleX1gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLl9yZWFkUGx1Z2luc0Zvckluc3RhbGxlZEVudHJ5KHJlZmVyZW5jZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gcGx1Z2lucy5maW5kKHAgPT4gZW50cnkubmFtZSA/IHAubmFtZSA9PT0gZW50cnkubmFtZSA6IGlzRXF1YWwodGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwKSwgZW50cnkucGx1Z2luVXJpKSk7XG5cdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdHRoaXMuX3BsdWdpbk1ldGFkYXRhLnNldChrZXksIG1hdGNoKTtcblx0XHRcdFx0XHRoeWRyYXRlZCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1BsdWdpbk1hcmtldHBsYWNlU2VydmljZV0gRmFpbGVkIHRvIGh5ZHJhdGUgbWV0YWRhdGEgZm9yICR7a2V5fTpgLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChoeWRyYXRlZCA+IDApIHtcblx0XHRcdC8vIFRvdWNoIHRoZSBzdG9yZSB0byB0cmlnZ2VyIHRoZSBkZXJpdmVkIG9ic2VydmFibGUgdG8gcmUtZXZhbHVhdGVcblx0XHRcdC8vIG5vdyB0aGF0IF9wbHVnaW5NZXRhZGF0YSBoYXMgbmV3IGVudHJpZXMuXG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5faW5zdGFsbGVkUGx1Z2luc1N0b3JlLmdldCgpO1xuXHRcdFx0dGhpcy5faW5zdGFsbGVkUGx1Z2luc1N0b3JlLnNldChbLi4uY3VycmVudF0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFBsdWdpbnNGb3JJbnN0YWxsZWRFbnRyeShyZWZlcmVuY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWFya2V0cGxhY2VQbHVnaW5bXT4ge1xuXHRcdGlmIChyZWZlcmVuY2Uua2luZCA9PT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCAmJiByZWZlcmVuY2UuZ2l0aHViUmVwbykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZldGNoRnJvbUdpdEh1YlJlcG8ocmVmZXJlbmNlLCByZWZlcmVuY2UuZ2l0aHViUmVwbywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9EaXIgPSB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5nZXRSZXBvc2l0b3J5VXJpKHJlZmVyZW5jZSk7XG5cdFx0bGV0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLl9yZWFkUGx1Z2luc0Zyb21EaXJlY3RvcnkocmVwb0RpciwgcmVmZXJlbmNlLCB0b2tlbik7XG5cdFx0aWYgKHBsdWdpbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBUaGUgZW50cnkgbWF5IGhhdmUgY29tZSBmcm9tIGEgc2luZ2xlLXBsdWdpbiByZXBvIGluc3RhbGxlZFxuXHRcdFx0Ly8gdmlhIGBpbnN0YWxsUGx1Z2luRnJvbVNvdXJjZWAgKG5vIG1hcmtldHBsYWNlLmpzb24pLiBUcnkgdGhlXG5cdFx0XHQvLyBwbHVnaW4gbWFuaWZlc3QgYXQgdGhlIHJlcG8gcm9vdC5cblx0XHRcdGNvbnN0IHNpbmdsZSA9IGF3YWl0IHRoaXMucmVhZFNpbmdsZVBsdWdpbk1hbmlmZXN0KHJlcG9EaXIsIHJlZmVyZW5jZSk7XG5cdFx0XHRpZiAoc2luZ2xlKSB7XG5cdFx0XHRcdHBsdWdpbnMgPSBbc2luZ2xlXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHBsdWdpbnM7XG5cdH1cblxuXHQvKipcblx0ICogU2hhcmVkIGxvZ2ljIHRvIHBhcnNlIGEgbWFya2V0cGxhY2UuanNvbiBpbnRvIHtAbGluayBJTWFya2V0cGxhY2VQbHVnaW59XG5cdCAqIG9iamVjdHMuIFVzZWQgYnkgYm90aCBmZXRjaCBhbmQgaHlkcmF0aW9uIHBhdGhzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGFyc2VNYXJrZXRwbGFjZVBsdWdpbnMoanNvbjogSU1hcmtldHBsYWNlSnNvbiwgcmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLCByZXBvRGlyPzogVVJJKTogSU1hcmtldHBsYWNlUGx1Z2luW10ge1xuXHRcdGlmICghanNvbi5wbHVnaW5zIHx8ICFBcnJheS5pc0FycmF5KGpzb24ucGx1Z2lucykpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4ganNvbi5wbHVnaW5zXG5cdFx0XHQuZmlsdGVyKChwKTogcCBpcyB7IG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmc7IHZlcnNpb24/OiBzdHJpbmc7IHNvdXJjZT86IHN0cmluZyB8IElKc29uUGx1Z2luU291cmNlIH0gPT5cblx0XHRcdFx0dHlwZW9mIHAubmFtZSA9PT0gJ3N0cmluZycgJiYgISFwLm5hbWVcblx0XHRcdClcblx0XHRcdC5mbGF0TWFwKHAgPT4ge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VEZXNjcmlwdG9yID0gcGFyc2VQbHVnaW5Tb3VyY2UocC5zb3VyY2UsIGpzb24ubWV0YWRhdGE/LnBsdWdpblJvb3QsIHtcblx0XHRcdFx0XHRwbHVnaW5OYW1lOiBwLm5hbWUsXG5cdFx0XHRcdFx0bG9nU2VydmljZTogdGhpcy5fbG9nU2VydmljZSxcblx0XHRcdFx0XHRsb2dQcmVmaXg6ICdbUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlXScsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIXNvdXJjZURlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBzb3VyY2VEZXNjcmlwdG9yLmtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoID8gc291cmNlRGVzY3JpcHRvci5wYXRoIDogJyc7XG5cblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0bmFtZTogcC5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBwLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHRcdHZlcnNpb246IHAudmVyc2lvbiA/PyAnJyxcblx0XHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcixcblx0XHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmZXJlbmNlLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlVHlwZSxcblx0XHRcdFx0XHRyZWFkbWVVcmk6IHJlcG9EaXIgPyBnZXRNYXJrZXRwbGFjZVJlYWRtZUZpbGVVcmkocmVwb0Rpciwgc291cmNlKSA6IGdldE1hcmtldHBsYWNlUmVhZG1lVXJpKHJlZmVyZW5jZS5naXRodWJSZXBvID8/ICcnLCBzb3VyY2UpLFxuXHRcdFx0XHR9XTtcblx0XHRcdH0pO1xuXHR9XG5cblx0dHJ1c3RNYXJrZXRwbGFjZShyZWY6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl90cnVzdGVkTWFya2V0cGxhY2VzU3RvcmUuZ2V0KCk7XG5cdFx0aWYgKCFjdXJyZW50LmluY2x1ZGVzKHJlZi5jYW5vbmljYWxJZCkpIHtcblx0XHRcdHRoaXMuX3RydXN0ZWRNYXJrZXRwbGFjZXNTdG9yZS5zZXQoWy4uLmN1cnJlbnQsIHJlZi5jYW5vbmljYWxJZF0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFBlcmlvZGljIHVwZGF0ZSBjaGVjayAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9oYXNBdXRvVXBkYXRlRW5hYmxlZE1hcmtldHBsYWNlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRBdXRvVXBkYXRlVmFsdWUoKSAhPT0gJ29mZicpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCB7IGV4dHJhVmFsdWVzIH0gPSByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKGV4dHJhVmFsdWVzKS5zb21lKHJlZiA9PiByZWYuYXV0b1VwZGF0ZSA9PT0gdHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogKFJlLSlzY2hlZHVsZXMgdGhlIG5leHQgcGVyaW9kaWMgdXBkYXRlIGNoZWNrLiBDYWxsZWQgb25cblx0ICogY29uc3RydWN0aW9uIGFuZCB3aGVuZXZlciB0aGUgYXV0by11cGRhdGUgY29uZmlnIGNoYW5nZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9zY2hlZHVsZVVwZGF0ZUNoZWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl91cGRhdGVDaGVja1RpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl91cGRhdGVDaGVja1RpbWVyKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUNoZWNrVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9oYXNBdXRvVXBkYXRlRW5hYmxlZE1hcmtldHBsYWNlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYXN0Q2hlY2sgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoXG5cdFx0XHRQTFVHSU5fVVBEQVRFX0xBU1RfQ0hFQ0tfU1RPUkFHRV9LRVksXG5cdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHQwLFxuXHRcdCk7XG5cdFx0Y29uc3QgZWxhcHNlZCA9IERhdGUubm93KCkgLSBsYXN0Q2hlY2s7XG5cdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1heCgwLCBQTFVHSU5fVVBEQVRFX0NIRUNLX0lOVEVSVkFMX01TIC0gZWxhcHNlZCk7XG5cblx0XHR0aGlzLl91cGRhdGVDaGVja1RpbWVyID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLl9ydW5VcGRhdGVDaGVjaygpLCBkZWxheSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5VcGRhdGVDaGVjaygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl91cGRhdGVDaGVja1RpbWVyID0gdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IHRoaXMuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKTtcblx0XHRcdGlmIChpbnN0YWxsZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vlbk1hcmtldHBsYWNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgbWFya2V0cGxhY2VzV2l0aFVwZGF0ZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVmID0gZW50cnkucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlO1xuXHRcdFx0XHRpZiAoc2Vlbk1hcmtldHBsYWNlcy5oYXMocmVmLmNhbm9uaWNhbElkKVxuXHRcdFx0XHRcdHx8ICF0aGlzLmlzTWFya2V0cGxhY2VBdXRvVXBkYXRlRW5hYmxlZChyZWYpXG5cdFx0XHRcdFx0fHwgIXRoaXMuX2lzTWFya2V0cGxhY2VBbGxvd2VkQnlTdHJpY3RQb2xpY3kocmVmKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW5NYXJrZXRwbGFjZXMuYWRkKHJlZi5jYW5vbmljYWxJZCk7XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBiZWhpbmQgPSBhd2FpdCB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5mZXRjaFJlcG9zaXRvcnkocmVmKTtcblx0XHRcdFx0XHRpZiAoYmVoaW5kKSB7XG5cdFx0XHRcdFx0XHRtYXJrZXRwbGFjZXNXaXRoVXBkYXRlcy5hZGQocmVmLmNhbm9uaWNhbElkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2VdIFVwZGF0ZSBjaGVjayBmYWlsZWQgZm9yICR7cmVmLmRpc3BsYXlMYWJlbH06YCwgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9tYXJrZXRwbGFjZXNXaXRoVXBkYXRlcy5zZXQobWFya2V0cGxhY2VzV2l0aFVwZGF0ZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0UExVR0lOX1VQREFURV9MQVNUX0NIRUNLX1NUT1JBR0VfS0VZLFxuXHRcdFx0XHREYXRlLm5vdygpLFxuXHRcdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdFN0b3JhZ2VUYXJnZXQuTUFDSElORSxcblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdbUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlXSBQZXJpb2RpYyB1cGRhdGUgY2hlY2sgZmFpbGVkOicsIGVycik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIFJlc2NoZWR1bGUgZm9yIHRoZSBuZXh0IGNoZWNrXG5cdFx0XHRpZiAodGhpcy5faGFzQXV0b1VwZGF0ZUVuYWJsZWRNYXJrZXRwbGFjZSgpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNoZWNrVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuX3J1blVwZGF0ZUNoZWNrKCksIFBMVUdJTl9VUERBVEVfQ0hFQ0tfSU5URVJWQUxfTVMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoRnJvbUNsb25lZFJlcG8ocmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1hcmtldHBsYWNlUGx1Z2luW10+IHtcblx0XHRsZXQgcmVwb0RpcjogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXBvRGlyID0gYXdhaXQgdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShyZWZlcmVuY2UpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1BsdWdpbk1hcmtldHBsYWNlU2VydmljZV0gRmFpbGVkIHRvIHByZXBhcmUgbWFya2V0cGxhY2UgcmVwb3NpdG9yeSAke3JlZmVyZW5jZS5yYXdWYWx1ZX06YCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVhZFBsdWdpbnNGcm9tRGlyZWN0b3J5KHJlcG9EaXIsIHJlZmVyZW5jZSwgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgcmVhZFBsdWdpbnNGcm9tRGlyZWN0b3J5KHJlcG9EaXI6IFVSSSwgcmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpOiBQcm9taXNlPElNYXJrZXRwbGFjZVBsdWdpbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlYWRQbHVnaW5zRnJvbURpcmVjdG9yeShyZXBvRGlyLCByZWZlcmVuY2UpO1xuXHR9XG5cblx0YXN5bmMgcmVhZFNpbmdsZVBsdWdpbk1hbmlmZXN0KHJlcG9EaXI6IFVSSSwgcmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpOiBQcm9taXNlPElNYXJrZXRwbGFjZVBsdWdpbiB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFNpbmdsZS1wbHVnaW4gcmVwb3MgYXJlIG9ubHkgbWVhbmluZ2Z1bCBmb3IgZGlyZWN0IGdpdCBjbG9uZXMgXHUyMDE0XG5cdFx0Ly8gdGhlcmUncyBubyBzeW50aGV0aWMgcmVsYXRpdmUtcGF0aCBzb3VyY2UgdG8gZmFsbCBiYWNrIG9uLlxuXHRcdGlmIChyZWZlcmVuY2Uua2luZCAhPT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCAmJiByZWZlcmVuY2Uua2luZCAhPT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VEZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvciA9IHJlZmVyZW5jZS5raW5kID09PSBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0SHViU2hvcnRoYW5kXG5cdFx0XHQ/IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86IHJlZmVyZW5jZS5naXRodWJSZXBvISB9XG5cdFx0XHQ6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogcmVmZXJlbmNlLmNsb25lVXJsIH07XG5cdFx0Y29uc3QgYWdlbnRNYW5pZmVzdCA9IGF3YWl0IHJlYWRBZ2VudFBsdWdpbk1hbmlmZXN0KHJlcG9EaXIsIHRoaXMuX2ZpbGVTZXJ2aWNlKTtcblx0XHRpZiAoYWdlbnRNYW5pZmVzdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bmFtZTogYWdlbnRNYW5pZmVzdC5uYW1lID8/IHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudE1hbmlmZXN0LmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHR2ZXJzaW9uOiBhZ2VudE1hbmlmZXN0LnZlcnNpb24gPz8gJycsXG5cdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3IsXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWZlcmVuY2UuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmZXJlbmNlLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRlZiBvZiBTSU5HTEVfUExVR0lOX01BTklGRVNUX0RFRklOSVRJT05TKSB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdFVyaSA9IGpvaW5QYXRoKHJlcG9EaXIsIGRlZi5wYXRoKTtcblx0XHRcdGxldCBtYW5pZmVzdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1hbmlmZXN0VXJpKTtcblx0XHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VKU09OQyhjb250ZW50cy52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdFx0bWFuaWZlc3QgPSBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hbmlmZXN0TmFtZSA9IHR5cGVvZiBtYW5pZmVzdFsnbmFtZSddID09PSAnc3RyaW5nJyAmJiBtYW5pZmVzdFsnbmFtZSddID8gbWFuaWZlc3RbJ25hbWUnXSBhcyBzdHJpbmcgOiByZWZlcmVuY2UuZGlzcGxheUxhYmVsO1xuXHRcdFx0Y29uc3QgbWFuaWZlc3REZXNjcmlwdGlvbiA9IHR5cGVvZiBtYW5pZmVzdFsnZGVzY3JpcHRpb24nXSA9PT0gJ3N0cmluZycgPyBtYW5pZmVzdFsnZGVzY3JpcHRpb24nXSBhcyBzdHJpbmcgOiAnJztcblx0XHRcdGNvbnN0IG1hbmlmZXN0VmVyc2lvbiA9IHR5cGVvZiBtYW5pZmVzdFsndmVyc2lvbiddID09PSAnc3RyaW5nJyA/IG1hbmlmZXN0Wyd2ZXJzaW9uJ10gYXMgc3RyaW5nIDogJyc7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG5hbWU6IG1hbmlmZXN0TmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG1hbmlmZXN0RGVzY3JpcHRpb24sXG5cdFx0XHRcdHZlcnNpb246IG1hbmlmZXN0VmVyc2lvbixcblx0XHRcdFx0c291cmNlOiAnJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcixcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWZlcmVuY2UsXG5cdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogZGVmLnR5cGUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2VdIE5vIHNpbmdsZS1wbHVnaW4gbWFuaWZlc3QgZm91bmQgaW4gJHtyZWZlcmVuY2UucmF3VmFsdWV9YCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGlzUGx1Z2luRGlyZWN0b3J5KHJlcG9EaXI6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChhd2FpdCByZWFkQWdlbnRQbHVnaW5NYW5pZmVzdChyZXBvRGlyLCB0aGlzLl9maWxlU2VydmljZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGRlZiBvZiBTSU5HTEVfUExVR0lOX01BTklGRVNUX0RFRklOSVRJT05TKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKGpvaW5QYXRoKHJlcG9EaXIsIGRlZi5wYXRoKSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRQbHVnaW5zRnJvbURpcmVjdG9yeShyZXBvRGlyOiBVUkksIHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWFya2V0cGxhY2VQbHVnaW5bXT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkUGx1Z2luc0Zyb21EZWZpbml0aW9ucyhyZWZlcmVuY2UsIGFzeW5jIChkZWZQYXRoKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZWZpbml0aW9uVXJpID0gam9pblBhdGgocmVwb0RpciwgZGVmUGF0aCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGRlZmluaXRpb25VcmkpO1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VKU09OQyhjb250ZW50cy52YWx1ZS50b1N0cmluZygpKSBhcyBJTWFya2V0cGxhY2VKc29uIHwgdW5kZWZpbmVkO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSwgcmVwb0Rpcik7XG5cdH1cblxuXHQvKipcblx0ICogSXRlcmF0ZXMgb3ZlciB7QGxpbmsgTUFSS0VUUExBQ0VfREVGSU5JVElPTlN9IHBhdGhzLCBjYWxsaW5nXG5cdCAqIHtAbGluayByZWFkSnNvbn0gZm9yIGVhY2ggdG8gb2J0YWluIHRoZSBwYXJzZWQgSlNPTi4gUmV0dXJucyB0aGVcblx0ICogcGx1Z2lucyBmcm9tIHRoZSBmaXJzdCBkZWZpbml0aW9uIHRoYXQgeWllbGRzIGEgdmFsaWQgcmVzdWx0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFBsdWdpbnNGcm9tRGVmaW5pdGlvbnMoXG5cdFx0cmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsXG5cdFx0cmVhZEpzb246IChkZWZQYXRoOiBzdHJpbmcpID0+IFByb21pc2U8SU1hcmtldHBsYWNlSnNvbiB8IHVuZGVmaW5lZD4sXG5cdFx0cmVwb0Rpcj86IFVSSSxcblx0KTogUHJvbWlzZTxJTWFya2V0cGxhY2VQbHVnaW5bXT4ge1xuXHRcdGZvciAoY29uc3QgZGVmIG9mIE1BUktFVFBMQUNFX0RFRklOSVRJT05TKSB7XG5cdFx0XHRjb25zdCBqc29uID0gYXdhaXQgcmVhZEpzb24oZGVmLnBhdGgpO1xuXHRcdFx0aWYgKCFqc29uPy5wbHVnaW5zIHx8ICFBcnJheS5pc0FycmF5KGpzb24ucGx1Z2lucykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFyc2VNYXJrZXRwbGFjZVBsdWdpbnMoanNvbiwgcmVmZXJlbmNlLCBkZWYudHlwZSwgcmVwb0Rpcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1BsdWdpbk1hcmtldHBsYWNlU2VydmljZV0gTm8gbWFya2V0cGxhY2UuanNvbiBmb3VuZCBpbiAke3JlZmVyZW5jZS5yYXdWYWx1ZX1gKTtcblx0XHRyZXR1cm4gW107XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplTWFya2V0cGxhY2VQYXRoKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgbm9ybWFsaXplZCA9IHZhbHVlLnRyaW0oKS5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG5cdG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkLnJlcGxhY2UoL15cXC4/XFwvKy8sICcnKS5yZXBsYWNlKC9cXC8rJC9nLCAnJyk7XG5cdHJldHVybiBub3JtYWxpemVkO1xufVxuXG4vKipcbiAqIFJlc29sdmUgcGx1Z2luIHNvdXJjZSBmcm9tIG1hcmtldHBsYWNlIG1ldGFkYXRhLlxuICogLSBJZiBwbHVnaW5Sb290IGV4aXN0cywgcGx1Z2luIHNvdXJjZSBpcyByZXNvbHZlZCByZWxhdGl2ZSB0byBpdC5cbiAqIC0gSWYgc291cmNlIGFscmVhZHkgaW5jbHVkZXMgcGx1Z2luUm9vdCwgaXQncyBwcmVzZXJ2ZWQuXG4gKiBWYWxpZGF0aW9uIG9mIHdoZXRoZXIgdGhlIGZpbmFsIHBhdGggaXMgYWxsb3dlZCBpcyBwZXJmb3JtZWQgYnkgdGhlIGluc3RhbGwgc2VydmljZS5cbiAqL1xuZnVuY3Rpb24gcmVzb2x2ZVBsdWdpblNvdXJjZShwbHVnaW5Sb290OiBzdHJpbmcgfCB1bmRlZmluZWQsIHNvdXJjZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZFJvb3QgPSBwbHVnaW5Sb290ID8gbm9ybWFsaXplTWFya2V0cGxhY2VQYXRoKHBsdWdpblJvb3QpIDogJyc7XG5cdGNvbnN0IG5vcm1hbGl6ZWRTb3VyY2UgPSBub3JtYWxpemVNYXJrZXRwbGFjZVBhdGgoc291cmNlKTtcblx0Y29uc3QgcmVwb1Jvb3QgPSBVUkkuZmlsZSgnLycpO1xuXHRjb25zdCBwbHVnaW5Sb290VXJpID0gbm9ybWFsaXplZFJvb3QgPyBub3JtYWxpemVQYXRoKGpvaW5QYXRoKHJlcG9Sb290LCBub3JtYWxpemVkUm9vdCkpIDogcmVwb1Jvb3Q7XG5cblx0aWYgKG5vcm1hbGl6ZWRSb290ICYmIChub3JtYWxpemVkU291cmNlID09PSBub3JtYWxpemVkUm9vdCB8fCBub3JtYWxpemVkU291cmNlLnN0YXJ0c1dpdGgoYCR7bm9ybWFsaXplZFJvb3R9L2ApKSkge1xuXHRcdHJldHVybiBub3JtYWxpemVkU291cmNlO1xuXHR9XG5cblx0Y29uc3QgcmVzb2x2ZWRVcmkgPSBub3JtYWxpemVQYXRoKGpvaW5QYXRoKHBsdWdpblJvb3RVcmksIG5vcm1hbGl6ZWRTb3VyY2UpKTtcblx0cmV0dXJuIHJlbGF0aXZlUGF0aChyZXBvUm9vdCwgcmVzb2x2ZWRVcmkpID8/IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBQYXJzZSBhIHJhdyBgc291cmNlYCBmaWVsZCBmcm9tIG1hcmtldHBsYWNlLmpzb24gaW50byBhIHN0cnVjdHVyZWRcbiAqIHtAbGluayBJUGx1Z2luU291cmNlRGVzY3JpcHRvcn0uIEFjY2VwdHMgZWl0aGVyIGEgcmVsYXRpdmUtcGF0aCBzdHJpbmdcbiAqIG9yIGEgSlNPTiBvYmplY3Qgd2l0aCBhIGBzb3VyY2VgIGRpc2NyaW1pbmFudCBpbmRpY2F0aW5nIHRoZSBraW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VQbHVnaW5Tb3VyY2UoXG5cdHJhd1NvdXJjZTogc3RyaW5nIHwgSUpzb25QbHVnaW5Tb3VyY2UgfCB1bmRlZmluZWQsXG5cdHBsdWdpblJvb3Q6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0bG9nQ29udGV4dDogeyBwbHVnaW5OYW1lOiBzdHJpbmc7IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlOyBsb2dQcmVmaXg6IHN0cmluZyB9LFxuKTogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IgfCB1bmRlZmluZWQge1xuXHRpZiAocmF3U291cmNlID09PSB1bmRlZmluZWQgfHwgcmF3U291cmNlID09PSBudWxsKSB7XG5cdFx0Ly8gVHJlYXQgbWlzc2luZyBzb3VyY2UgdGhlIHNhbWUgYXMgZW1wdHkgc3RyaW5nIFx1MjE5MiBwbHVnaW5Sb290IG9yIHJlcG8gcm9vdC5cblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVQbHVnaW5Tb3VyY2UocGx1Z2luUm9vdCwgJycpO1xuXHRcdGlmIChyZXNvbHZlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogcmVzb2x2ZWQgfTtcblx0fVxuXG5cdC8vIFN0cmluZyBzb3VyY2UgXHUyMTkyIGxlZ2FjeSByZWxhdGl2ZS1wYXRoIGJlaGF2aW91ci5cblx0aWYgKHR5cGVvZiByYXdTb3VyY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlUGx1Z2luU291cmNlKHBsdWdpblJvb3QsIHJhd1NvdXJjZSk7XG5cdFx0aWYgKHJlc29sdmVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiByZXNvbHZlZCB9O1xuXHR9XG5cblx0Ly8gT2JqZWN0IHNvdXJjZSBcdTIxOTIgZGlzY3JpbWluYXRlZCBieSBgcmF3U291cmNlLnNvdXJjZWAuXG5cdGlmICh0eXBlb2YgcmF3U291cmNlICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgcmF3U291cmNlLnNvdXJjZSAhPT0gJ3N0cmluZycpIHtcblx0XHRsb2dDb250ZXh0LmxvZ1NlcnZpY2Uud2FybihgJHtsb2dDb250ZXh0LmxvZ1ByZWZpeH0gU2tpcHBpbmcgcGx1Z2luICcke2xvZ0NvbnRleHQucGx1Z2luTmFtZX0nOiBzb3VyY2Ugb2JqZWN0IGlzIG1pc3NpbmcgYSAnc291cmNlJyBkaXNjcmltaW5hbnRgKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c3dpdGNoIChyYXdTb3VyY2Uuc291cmNlKSB7XG5cdFx0Y2FzZSAnZ2l0aHViJzoge1xuXHRcdFx0aWYgKHR5cGVvZiByYXdTb3VyY2UucmVwbyAhPT0gJ3N0cmluZycgfHwgIXJhd1NvdXJjZS5yZXBvKSB7XG5cdFx0XHRcdGxvZ0NvbnRleHQubG9nU2VydmljZS53YXJuKGAke2xvZ0NvbnRleHQubG9nUHJlZml4fSBTa2lwcGluZyBwbHVnaW4gJyR7bG9nQ29udGV4dC5wbHVnaW5OYW1lfSc6IGdpdGh1YiBzb3VyY2UgaXMgbWlzc2luZyByZXF1aXJlZCAncmVwbycgZmllbGRgKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICghaXNWYWxpZEdpdEh1YlJlcG8ocmF3U291cmNlLnJlcG8pKSB7XG5cdFx0XHRcdGxvZ0NvbnRleHQubG9nU2VydmljZS53YXJuKGAke2xvZ0NvbnRleHQubG9nUHJlZml4fSBTa2lwcGluZyBwbHVnaW4gJyR7bG9nQ29udGV4dC5wbHVnaW5OYW1lfSc6IGdpdGh1YiBzb3VyY2UgcmVwbyBtdXN0IGJlIGluICdvd25lci9yZXBvJyBmb3JtYXRgKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICghaXNPcHRpb25hbFN0cmluZyhyYXdTb3VyY2UucmVmKSkge1xuXHRcdFx0XHRsb2dDb250ZXh0LmxvZ1NlcnZpY2Uud2FybihgJHtsb2dDb250ZXh0LmxvZ1ByZWZpeH0gU2tpcHBpbmcgcGx1Z2luICcke2xvZ0NvbnRleHQucGx1Z2luTmFtZX0nOiBnaXRodWIgc291cmNlICdyZWYnIG11c3QgYmUgYSBzdHJpbmcgd2hlbiBwcm92aWRlZGApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc09wdGlvbmFsR2l0U2hhKHJhd1NvdXJjZS5zaGEpKSB7XG5cdFx0XHRcdGxvZ0NvbnRleHQubG9nU2VydmljZS53YXJuKGAke2xvZ0NvbnRleHQubG9nUHJlZml4fSBTa2lwcGluZyBwbHVnaW4gJyR7bG9nQ29udGV4dC5wbHVnaW5OYW1lfSc6IGdpdGh1YiBzb3VyY2UgJ3NoYScgbXVzdCBiZSBhIGZ1bGwgNDAtY2hhcmFjdGVyIGNvbW1pdCBoYXNoIHdoZW4gcHJvdmlkZWRgKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICghaXNPcHRpb25hbFN0cmluZyhyYXdTb3VyY2UucGF0aCkpIHtcblx0XHRcdFx0bG9nQ29udGV4dC5sb2dTZXJ2aWNlLndhcm4oYCR7bG9nQ29udGV4dC5sb2dQcmVmaXh9IFNraXBwaW5nIHBsdWdpbiAnJHtsb2dDb250ZXh0LnBsdWdpbk5hbWV9JzogZ2l0aHViIHNvdXJjZSAncGF0aCcgbXVzdCBiZSBhIHN0cmluZyB3aGVuIHByb3ZpZGVkYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1Yixcblx0XHRcdFx0cmVwbzogcmF3U291cmNlLnJlcG8sXG5cdFx0XHRcdHJlZjogcmF3U291cmNlLnJlZixcblx0XHRcdFx0c2hhOiByYXdTb3VyY2Uuc2hhLFxuXHRcdFx0XHRwYXRoOiByYXdTb3VyY2UucGF0aCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ3VybCc6XG5cdFx0Y2FzZSAnZ2l0LXN1YmRpcic6IHtcblx0XHRcdGlmICh0eXBlb2YgcmF3U291cmNlLnVybCAhPT0gJ3N0cmluZycgfHwgIXJhd1NvdXJjZS51cmwpIHtcblx0XHRcdFx0bG9nQ29udGV4dC5sb2dTZXJ2aWNlLndhcm4oYCR7bG9nQ29udGV4dC5sb2dQcmVmaXh9IFNraXBwaW5nIHBsdWdpbiAnJHtsb2dDb250ZXh0LnBsdWdpbk5hbWV9JzogJHtyYXdTb3VyY2Uuc291cmNlfSBzb3VyY2UgaXMgbWlzc2luZyByZXF1aXJlZCAndXJsJyBmaWVsZGApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJhd1NvdXJjZS5zb3VyY2UgPT09ICd1cmwnICYmICFyYXdTb3VyY2UudXJsLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoJy5naXQnKSkge1xuXHRcdFx0XHRsb2dDb250ZXh0LmxvZ1NlcnZpY2Uud2FybihgJHtsb2dDb250ZXh0LmxvZ1ByZWZpeH0gU2tpcHBpbmcgcGx1Z2luICcke2xvZ0NvbnRleHQucGx1Z2luTmFtZX0nOiB1cmwgc291cmNlIG11c3QgZW5kIHdpdGggJy5naXQnYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzT3B0aW9uYWxTdHJpbmcocmF3U291cmNlLnJlZikpIHtcblx0XHRcdFx0bG9nQ29udGV4dC5sb2dTZXJ2aWNlLndhcm4oYCR7bG9nQ29udGV4dC5sb2dQcmVmaXh9IFNraXBwaW5nIHBsdWdpbiAnJHtsb2dDb250ZXh0LnBsdWdpbk5hbWV9JzogJHtyYXdTb3VyY2Uuc291cmNlfSBzb3VyY2UgJ3JlZicgbXVzdCBiZSBhIHN0cmluZyB3aGVuIHByb3ZpZGVkYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzT3B0aW9uYWxHaXRTaGEocmF3U291cmNlLnNoYSkpIHtcblx0XHRcdFx0bG9nQ29udGV4dC5sb2dTZXJ2aWNlLndhcm4oYCR7bG9nQ29udGV4dC5sb2dQcmVmaXh9IFNraXBwaW5nIHBsdWdpbiAnJHtsb2dDb250ZXh0LnBsdWdpbk5hbWV9JzogJHtyYXdTb3VyY2Uuc291cmNlfSBzb3VyY2UgJ3NoYScgbXVzdCBiZSBhIGZ1bGwgNDAtY2hhcmFjdGVyIGNvbW1pdCBoYXNoIHdoZW4gcHJvdmlkZWRgKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChyYXdTb3VyY2Uuc291cmNlID09PSAnZ2l0LXN1YmRpcicpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiByYXdTb3VyY2UucGF0aCAhPT0gJ3N0cmluZycgfHwgIXJhd1NvdXJjZS5wYXRoKSB7XG5cdFx0XHRcdFx0bG9nQ29udGV4dC5sb2dTZXJ2aWNlLndhcm4oYCR7bG9nQ29udGV4dC5sb2dQcmVmaXh9IFNraXBwaW5nIHBsdWdpbiAnJHtsb2dDb250ZXh0LnBsdWdpbk5hbWV9JzogZ2l0LXN1YmRpciBzb3VyY2UgaXMgbWlzc2luZyByZXF1aXJlZCAncGF0aCcgZmllbGRgKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKCFpc09wdGlvbmFsU3RyaW5nKHJhd1NvdXJjZS5wYXRoKSkge1xuXHRcdFx0XHRsb2dDb250ZXh0LmxvZ1NlcnZpY2Uud2FybihgJHtsb2dDb250ZXh0LmxvZ1ByZWZpeH0gU2tpcHBpbmcgcGx1Z2luICcke2xvZ0NvbnRleHQucGx1Z2luTmFtZX0nOiB1cmwgc291cmNlICdwYXRoJyBtdXN0IGJlIGEgc3RyaW5nIHdoZW4gcHJvdmlkZWRgKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsLFxuXHRcdFx0XHR1cmw6IHJhd1NvdXJjZS51cmwsXG5cdFx0XHRcdHJlZjogcmF3U291cmNlLnJlZixcblx0XHRcdFx0c2hhOiByYXdTb3VyY2Uuc2hhLFxuXHRcdFx0XHRwYXRoOiByYXdTb3VyY2UucGF0aCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ25wbSc6IHtcblx0XHRcdGlmICh0eXBlb2YgcmF3U291cmNlLnBhY2thZ2UgIT09ICdzdHJpbmcnIHx8ICFyYXdTb3VyY2UucGFja2FnZSkge1xuXHRcdFx0XHRsb2dDb250ZXh0LmxvZ1NlcnZpY2Uud2FybihgJHtsb2dDb250ZXh0LmxvZ1ByZWZpeH0gU2tpcHBpbmcgcGx1Z2luICcke2xvZ0NvbnRleHQucGx1Z2luTmFtZX0nOiBucG0gc291cmNlIGlzIG1pc3NpbmcgcmVxdWlyZWQgJ3BhY2thZ2UnIGZpZWxkYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzT3B0aW9uYWxTdHJpbmcocmF3U291cmNlLnZlcnNpb24pIHx8ICFpc09wdGlvbmFsU3RyaW5nKHJhd1NvdXJjZS5yZWdpc3RyeSkpIHtcblx0XHRcdFx0bG9nQ29udGV4dC5sb2dTZXJ2aWNlLndhcm4oYCR7bG9nQ29udGV4dC5sb2dQcmVmaXh9IFNraXBwaW5nIHBsdWdpbiAnJHtsb2dDb250ZXh0LnBsdWdpbk5hbWV9JzogbnBtIHNvdXJjZSAndmVyc2lvbicgYW5kICdyZWdpc3RyeScgbXVzdCBiZSBzdHJpbmdzIHdoZW4gcHJvdmlkZWRgKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLFxuXHRcdFx0XHRwYWNrYWdlOiByYXdTb3VyY2UucGFja2FnZSxcblx0XHRcdFx0dmVyc2lvbjogcmF3U291cmNlLnZlcnNpb24sXG5cdFx0XHRcdHJlZ2lzdHJ5OiByYXdTb3VyY2UucmVnaXN0cnksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdwaXAnOiB7XG5cdFx0XHRpZiAodHlwZW9mIHJhd1NvdXJjZS5wYWNrYWdlICE9PSAnc3RyaW5nJyB8fCAhcmF3U291cmNlLnBhY2thZ2UpIHtcblx0XHRcdFx0bG9nQ29udGV4dC5sb2dTZXJ2aWNlLndhcm4oYCR7bG9nQ29udGV4dC5sb2dQcmVmaXh9IFNraXBwaW5nIHBsdWdpbiAnJHtsb2dDb250ZXh0LnBsdWdpbk5hbWV9JzogcGlwIHNvdXJjZSBpcyBtaXNzaW5nIHJlcXVpcmVkICdwYWNrYWdlJyBmaWVsZGApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc09wdGlvbmFsU3RyaW5nKHJhd1NvdXJjZS52ZXJzaW9uKSB8fCAhaXNPcHRpb25hbFN0cmluZyhyYXdTb3VyY2UucmVnaXN0cnkpKSB7XG5cdFx0XHRcdGxvZ0NvbnRleHQubG9nU2VydmljZS53YXJuKGAke2xvZ0NvbnRleHQubG9nUHJlZml4fSBTa2lwcGluZyBwbHVnaW4gJyR7bG9nQ29udGV4dC5wbHVnaW5OYW1lfSc6IHBpcCBzb3VyY2UgJ3ZlcnNpb24nIGFuZCAncmVnaXN0cnknIG11c3QgYmUgc3RyaW5ncyB3aGVuIHByb3ZpZGVkYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCxcblx0XHRcdFx0cGFja2FnZTogcmF3U291cmNlLnBhY2thZ2UsXG5cdFx0XHRcdHZlcnNpb246IHJhd1NvdXJjZS52ZXJzaW9uLFxuXHRcdFx0XHRyZWdpc3RyeTogcmF3U291cmNlLnJlZ2lzdHJ5LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGxvZ0NvbnRleHQubG9nU2VydmljZS53YXJuKGAke2xvZ0NvbnRleHQubG9nUHJlZml4fSBTa2lwcGluZyBwbHVnaW4gJyR7bG9nQ29udGV4dC5wbHVnaW5OYW1lfSc6IHVua25vd24gc291cmNlIGtpbmQgJyR7cmF3U291cmNlLnNvdXJjZX0nYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzT3B0aW9uYWxTdHJpbmcodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnO1xufVxuXG5mdW5jdGlvbiBpc09wdGlvbmFsR2l0U2hhKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgfHwgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgL15bMC05YS1mQS1GXXs0MH0kLy50ZXN0KHZhbHVlKSk7XG59XG5cbmZ1bmN0aW9uIGlzVmFsaWRHaXRIdWJSZXBvKHJlcG86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bQS1aYS16MC05Xy4tXStcXC9bQS1aYS16MC05Xy4tXSskLy50ZXN0KHJlcG8pO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBmb3IgYSBwbHVnaW4gc291cmNlIGRlc2NyaXB0b3IsXG4gKiBzdWl0YWJsZSBmb3IgZXJyb3IgbWVzc2FnZXMgYW5kIFVJIGRpc3BsYXkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRQbHVnaW5Tb3VyY2VMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdHN3aXRjaCAoZGVzY3JpcHRvci5raW5kKSB7XG5cdFx0Y2FzZSBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aDpcblx0XHRcdHJldHVybiBkZXNjcmlwdG9yLnBhdGggfHwgJy4nO1xuXHRcdGNhc2UgUGx1Z2luU291cmNlS2luZC5HaXRIdWI6XG5cdFx0XHRyZXR1cm4gZGVzY3JpcHRvci5wYXRoID8gYCR7ZGVzY3JpcHRvci5yZXBvfS8ke2Rlc2NyaXB0b3IucGF0aH1gIDogZGVzY3JpcHRvci5yZXBvO1xuXHRcdGNhc2UgUGx1Z2luU291cmNlS2luZC5HaXRVcmw6XG5cdFx0XHRyZXR1cm4gZGVzY3JpcHRvci5wYXRoID8gYCR7ZGVzY3JpcHRvci51cmx9LyR7ZGVzY3JpcHRvci5wYXRofWAgOiBkZXNjcmlwdG9yLnVybDtcblx0XHRjYXNlIFBsdWdpblNvdXJjZUtpbmQuTnBtOlxuXHRcdFx0cmV0dXJuIGRlc2NyaXB0b3IudmVyc2lvbiA/IGAke2Rlc2NyaXB0b3IucGFja2FnZX1AJHtkZXNjcmlwdG9yLnZlcnNpb259YCA6IGRlc2NyaXB0b3IucGFja2FnZTtcblx0XHRjYXNlIFBsdWdpblNvdXJjZUtpbmQuUGlwOlxuXHRcdFx0cmV0dXJuIGRlc2NyaXB0b3IudmVyc2lvbiA/IGAke2Rlc2NyaXB0b3IucGFja2FnZX09PSR7ZGVzY3JpcHRvci52ZXJzaW9ufWAgOiBkZXNjcmlwdG9yLnBhY2thZ2U7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIGB0cnVlYCB3aGVuIHRoZSBtYXJrZXRwbGFjZSBzb3VyY2UgZGVzY3JpcHRvciBkaWZmZXJzIGZyb20gdGhlXG4gKiBpbnN0YWxsZWQgb25lIFx1MjAxNCBtZWFuaW5nIGFuIHVwZGF0ZSBzaG91bGQgYmUgcGVyZm9ybWVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzU291cmNlQ2hhbmdlZChpbnN0YWxsZWQ6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yLCBtYXJrZXRwbGFjZTogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBib29sZWFuIHtcblx0aWYgKGluc3RhbGxlZC5raW5kICE9PSBtYXJrZXRwbGFjZS5raW5kKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzd2l0Y2ggKGluc3RhbGxlZC5raW5kKSB7XG5cdFx0Y2FzZSBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1Yjpcblx0XHRcdHJldHVybiBpbnN0YWxsZWQucmVmICE9PSAobWFya2V0cGxhY2UgYXMgdHlwZW9mIGluc3RhbGxlZCkucmVmXG5cdFx0XHRcdHx8IGluc3RhbGxlZC5zaGEgIT09IChtYXJrZXRwbGFjZSBhcyB0eXBlb2YgaW5zdGFsbGVkKS5zaGFcblx0XHRcdFx0fHwgaW5zdGFsbGVkLnBhdGggIT09IChtYXJrZXRwbGFjZSBhcyB0eXBlb2YgaW5zdGFsbGVkKS5wYXRoO1xuXHRcdGNhc2UgUGx1Z2luU291cmNlS2luZC5HaXRVcmw6XG5cdFx0XHRyZXR1cm4gaW5zdGFsbGVkLnJlZiAhPT0gKG1hcmtldHBsYWNlIGFzIHR5cGVvZiBpbnN0YWxsZWQpLnJlZlxuXHRcdFx0XHR8fCBpbnN0YWxsZWQuc2hhICE9PSAobWFya2V0cGxhY2UgYXMgdHlwZW9mIGluc3RhbGxlZCkuc2hhXG5cdFx0XHRcdHx8IGluc3RhbGxlZC5wYXRoICE9PSAobWFya2V0cGxhY2UgYXMgdHlwZW9mIGluc3RhbGxlZCkucGF0aDtcblx0XHRjYXNlIFBsdWdpblNvdXJjZUtpbmQuTnBtOlxuXHRcdFx0cmV0dXJuIGluc3RhbGxlZC52ZXJzaW9uICE9PSAobWFya2V0cGxhY2UgYXMgdHlwZW9mIGluc3RhbGxlZCkudmVyc2lvbjtcblx0XHRjYXNlIFBsdWdpblNvdXJjZUtpbmQuUGlwOlxuXHRcdFx0cmV0dXJuIGluc3RhbGxlZC52ZXJzaW9uICE9PSAobWFya2V0cGxhY2UgYXMgdHlwZW9mIGluc3RhbGxlZCkudmVyc2lvbjtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE1hcmtldHBsYWNlUmVhZG1lVXJpKHJlcG86IHN0cmluZywgc291cmNlOiBzdHJpbmcpOiBVUkkge1xuXHRjb25zdCBub3JtYWxpemVkU291cmNlID0gc291cmNlLnRyaW0oKS5yZXBsYWNlKC9eXFwuP1xcLyt8XFwvKyQvZywgJycpO1xuXHRjb25zdCByZWFkbWVQYXRoID0gbm9ybWFsaXplZFNvdXJjZSA/IGAke25vcm1hbGl6ZWRTb3VyY2V9L1JFQURNRS5tZGAgOiAnUkVBRE1FLm1kJztcblx0cmV0dXJuIFVSSS5wYXJzZShgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb30vYmxvYi9tYWluLyR7cmVhZG1lUGF0aH1gKTtcbn1cblxuZnVuY3Rpb24gZ2V0TWFya2V0cGxhY2VSZWFkbWVGaWxlVXJpKHJlcG9EaXI6IFVSSSwgc291cmNlOiBzdHJpbmcpOiBVUkkge1xuXHRjb25zdCBub3JtYWxpemVkU291cmNlID0gc291cmNlLnRyaW0oKS5yZXBsYWNlKC9eXFwuP1xcLyt8XFwvKyQvZywgJycpO1xuXHRyZXR1cm4gbm9ybWFsaXplZFNvdXJjZSA/IGpvaW5QYXRoKHJlcG9EaXIsIG5vcm1hbGl6ZWRTb3VyY2UsICdSRUFETUUubWQnKSA6IGpvaW5QYXRoKHJlcG9EaXIsICdSRUFETUUubWQnKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxrQkFBa0I7QUFDcEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsY0FBYztBQUN2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QVMsWUFBaUMsT0FDcEQsVUFBVSxTQUFVLFlBQWlDO0FBQUEsSUFDMUQsS0FBSztBQUNKLGFBQU8sVUFBVSxRQUFTLFlBQWlDLE9BQ3ZELFVBQVUsUUFBUyxZQUFpQyxPQUNwRCxVQUFVLFNBQVUsWUFBaUM7QUFBQSxJQUMxRCxLQUFLO0FBQ0osYUFBTyxVQUFVLFlBQWEsWUFBaUM7QUFBQSxJQUNoRSxLQUFLO0FBQ0osYUFBTyxVQUFVLFlBQWEsWUFBaUM7QUFBQSxJQUNoRTtBQUNDLGFBQU87QUFBQSxFQUNUO0FBQ0Q7QUFFQSxTQUFTLHdCQUF3QixNQUFjLFFBQXFCO0FBQ25FLFFBQU0sbUJBQW1CLE9BQU8sS0FBSyxFQUFFLFFBQVEsaUJBQWlCLEVBQUU7QUFDbEUsUUFBTSxhQUFhLG1CQUFtQixHQUFHLGdCQUFnQixlQUFlO0FBQ3hFLFNBQU8sSUFBSSxNQUFNLHNCQUFzQixJQUFJLGNBQWMsVUFBVSxFQUFFO0FBQ3RFO0FBRUEsU0FBUyw0QkFBNEIsU0FBYyxRQUFxQjtBQUN2RSxRQUFNLG1CQUFtQixPQUFPLEtBQUssRUFBRSxRQUFRLGlCQUFpQixFQUFFO0FBQ2xFLFNBQU8sbUJBQW1CLFNBQVMsU0FBUyxrQkFBa0IsV0FBVyxJQUFJLFNBQVMsU0FBUyxXQUFXO0FBQzNHOyIsCiAgIm5hbWVzIjogWyJkZWR1cGxpY2F0ZU1hcmtldHBsYWNlUmVmZXJlbmNlcyIsICJNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQiLCAicGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSIsICJwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyIsICJyZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyIsICJNYXJrZXRwbGFjZVR5cGUiLCAiUGx1Z2luU291cmNlS2luZCJdCn0K
