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
import { Action } from "../../../../base/common/actions.js";
import { SequencerByKey } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { revive } from "../../../../base/common/marshalling.js";
import { dirname, isEqual, isEqualOrParent, joinPath } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { MarketplaceReferenceKind, PluginSourceKind } from "../common/plugins/pluginMarketplaceService.js";
import { IPluginGitService } from "../common/plugins/pluginGitService.js";
import { GitHubPluginSource, GitUrlPluginSource, NpmPluginSource, PipPluginSource, RelativePathPluginSource } from "./pluginSources.js";
const MARKETPLACE_INDEX_STORAGE_KEY = "chat.plugins.marketplaces.index.v1";
let AgentPluginRepositoryService = class {
  constructor(_commandService, environmentService, _fileService, instantiationService, _logService, _notificationService, _pluginGit, _progressService, _storageService, userDataProfileService) {
    this._commandService = _commandService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._pluginGit = _pluginGit;
    this._progressService = _progressService;
    this._storageService = _storageService;
    this._marketplaceIndex = new Lazy(() => this._loadMarketplaceIndex());
    this._cloneSequencer = new SequencerByKey();
    this.agentPluginsHome = userDataProfileService.currentProfile.agentPluginsHome;
    const legacyCacheRoot = joinPath(environmentService.cacheHome, "agentPlugins");
    const oldCacheRoot = environmentService.cacheHome.scheme === "file" ? legacyCacheRoot : this.agentPluginsHome;
    this._cacheRoot = this.agentPluginsHome;
    if (!isEqual(oldCacheRoot, this.agentPluginsHome)) {
      this._migrationDone = this._migrateDirectory(oldCacheRoot);
    } else {
      this._migrationDone = Promise.resolve();
    }
    this._pluginSources = /* @__PURE__ */ new Map([
      [PluginSourceKind.RelativePath, new RelativePathPluginSource()],
      [PluginSourceKind.GitHub, instantiationService.createInstance(GitHubPluginSource)],
      [PluginSourceKind.GitUrl, instantiationService.createInstance(GitUrlPluginSource)],
      [PluginSourceKind.Npm, instantiationService.createInstance(NpmPluginSource)],
      [PluginSourceKind.Pip, instantiationService.createInstance(PipPluginSource)]
    ]);
  }
  getPluginSource(kind) {
    const repo = this._pluginSources.get(kind);
    if (!repo) {
      throw new Error(`No source repository registered for kind '${kind}'`);
    }
    return repo;
  }
  getRepositoryUri(marketplace, marketplaceType) {
    if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri && marketplace.localRepositoryUri) {
      return marketplace.localRepositoryUri;
    }
    const indexed = this._marketplaceIndex.value.get(marketplace.canonicalId);
    if (indexed?.repositoryUri) {
      return indexed.repositoryUri;
    }
    return this._getRepoCacheDirForReference(marketplace);
  }
  getPluginInstallUri(plugin) {
    if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
      return this.getPluginSourceInstallUri(plugin.sourceDescriptor);
    }
    const repoDir = this.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    const normalizedSource = plugin.source.trim().replace(/^\.?\/+|\/+$/g, "");
    const pluginDir = normalizedSource ? joinPath(repoDir, normalizedSource) : repoDir;
    if (!isEqualOrParent(pluginDir, repoDir)) {
      throw new Error(`Invalid plugin source path '${plugin.source}'`);
    }
    return pluginDir;
  }
  async ensureRepository(marketplace, options) {
    await this._migrationDone;
    const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
    return this._cloneSequencer.queue(repoDir.fsPath, async () => {
      const repoExists = await this._fileService.exists(repoDir);
      if (repoExists) {
        this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType);
        return repoDir;
      }
      if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
        throw new Error(`Local marketplace repository does not exist: ${repoDir.fsPath}`);
      }
      const progressTitle = options?.progressTitle ?? localize("preparingMarketplace", "Preparing plugin marketplace '{0}'...", marketplace.displayLabel);
      const failureLabel = options?.failureLabel ?? marketplace.displayLabel;
      await this._cloneRepository(repoDir, marketplace.cloneUrl, progressTitle, failureLabel, marketplace.ref);
      this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType);
      return repoDir;
    });
  }
  async pullRepository(marketplace, options) {
    const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      this._logService.warn(`[AgentPluginRepositoryService] Cannot update plugin '${options?.pluginName ?? marketplace.displayLabel}': repository not cloned`);
      return false;
    }
    const updateLabel = options?.pluginName ?? marketplace.displayLabel;
    try {
      if (options?.silent) {
        return await this._pluginGit.pull(repoDir);
      }
      const cts = new CancellationTokenSource();
      try {
        return await this._progressService.withProgress(
          {
            location: ProgressLocation.Notification,
            title: localize("updatingPlugin", "Updating plugin '{0}'...", updateLabel),
            cancellable: true
          },
          () => this._pluginGit.pull(repoDir, cts.token),
          () => cts.dispose(true)
        );
      } finally {
        cts.dispose();
      }
    } catch (err) {
      this._logService.error(`[AgentPluginRepositoryService] Failed to update ${marketplace.displayLabel}:`, err);
      if (!options?.silent) {
        const primaryActions = [new Action("showGitOutput", localize("showGitOutput", "Show Git Output"), void 0, true, () => this._commandService.executeCommand("git.showOutput"))];
        const failureLabel = options?.failureLabel ?? updateLabel;
        if (marketplace.kind !== MarketplaceReferenceKind.LocalFileUri) {
          primaryActions.push(new Action("purgeAndRecloneMarketplace", localize("purgeAndRecloneMarketplace", "Purge Marketplace Cache and Reclone"), void 0, true, () => this._purgeAndRecloneMarketplace(marketplace, options?.marketplaceType, failureLabel)));
        }
        this._notificationService.notify({
          severity: Severity.Error,
          message: localize("pullFailed", "Failed to update plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
          actions: {
            primary: primaryActions
          }
        });
      }
      throw err;
    }
  }
  async _purgeAndRecloneMarketplace(marketplace, marketplaceType, label) {
    if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
      return;
    }
    const repoDir = this.getRepositoryUri(marketplace, marketplaceType);
    try {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize("purgingMarketplace", "Purging plugin marketplace '{0}'...", marketplace.displayLabel),
          cancellable: false
        },
        async () => {
          const exists = await this._fileService.exists(repoDir);
          if (exists) {
            await this._fileService.del(repoDir, { recursive: true, useTrash: false });
          }
          await this.ensureRepository(marketplace, {
            marketplaceType,
            progressTitle: localize("recloningMarketplace", "Recloning plugin marketplace '{0}'...", marketplace.displayLabel),
            failureLabel: label
          });
        }
      );
      this._notificationService.info(localize("purgeMarketplaceSuccess", "Recloned plugin marketplace '{0}'. Try updating plugins again.", marketplace.displayLabel));
    } catch (err) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("purgeMarketplaceFailed", "Failed to purge plugin marketplace '{0}': {1}", marketplace.displayLabel, err?.message ?? String(err)),
        actions: {
          primary: [new Action("showGitOutput", localize("showGitOutput", "Show Git Output"), void 0, true, () => {
            return this._commandService.executeCommand("git.showOutput");
          })]
        }
      });
    }
  }
  _getRepoCacheDirForReference(reference) {
    return joinPath(this._cacheRoot, ...reference.cacheSegments);
  }
  _loadMarketplaceIndex() {
    const result = /* @__PURE__ */ new Map();
    const stored = this._storageService.getObject(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
    if (!stored) {
      return result;
    }
    const revived = revive(stored);
    for (const [canonicalId, entry] of Object.entries(revived)) {
      if (!entry || !entry.repositoryUri) {
        continue;
      }
      result.set(canonicalId, {
        repositoryUri: entry.repositoryUri,
        marketplaceType: entry.marketplaceType
      });
    }
    return result;
  }
  _updateMarketplaceIndex(marketplace, repositoryUri, marketplaceType) {
    if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
      return;
    }
    const previous = this._marketplaceIndex.value.get(marketplace.canonicalId);
    if (previous && previous.repositoryUri.toString() === repositoryUri.toString() && previous.marketplaceType === marketplaceType) {
      return;
    }
    this._marketplaceIndex.value.set(marketplace.canonicalId, { repositoryUri, marketplaceType });
    this._saveMarketplaceIndex();
  }
  _saveMarketplaceIndex() {
    const serialized = {};
    for (const [canonicalId, entry] of this._marketplaceIndex.value) {
      serialized[canonicalId] = JSON.parse(JSON.stringify({
        repositoryUri: entry.repositoryUri,
        marketplaceType: entry.marketplaceType
      }));
    }
    if (Object.keys(serialized).length === 0) {
      this._storageService.remove(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
      return;
    }
    this._storageService.store(MARKETPLACE_INDEX_STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  async _cloneRepository(repoDir, cloneUrl, progressTitle, failureLabel, ref) {
    const cts = new CancellationTokenSource();
    try {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: progressTitle,
          cancellable: true
        },
        async () => {
          await this._fileService.createFolder(dirname(repoDir));
          await this._pluginGit.cloneRepository(cloneUrl, repoDir, ref, cts.token);
        },
        () => cts.dispose(true)
      );
    } catch (err) {
      this._logService.error(`[AgentPluginRepositoryService] Failed to clone ${cloneUrl}:`, err);
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("cloneFailed", "Failed to install plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
        actions: {
          primary: [new Action("showGitOutput", localize("showGitOutput", "Show Git Output"), void 0, true, () => {
            this._commandService.executeCommand("git.showOutput");
          })]
        }
      });
      throw err;
    } finally {
      cts.dispose();
    }
  }
  getPluginSourceInstallUri(sourceDescriptor) {
    return this.getPluginSource(sourceDescriptor.kind).getInstallUri(this._cacheRoot, sourceDescriptor);
  }
  async ensurePluginSource(plugin, options) {
    await this._migrationDone;
    const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
    if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
      return this.ensureRepository(plugin.marketplaceReference, options);
    }
    return repo.ensure(this._cacheRoot, plugin, options);
  }
  async updatePluginSource(plugin, options) {
    const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
    if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
      return this.pullRepository(plugin.marketplaceReference, options);
    }
    return repo.update(this._cacheRoot, plugin, options);
  }
  async fetchRepository(marketplace) {
    const repoDir = this.getRepositoryUri(marketplace);
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      return false;
    }
    try {
      await this._pluginGit.fetchRepository(repoDir);
      const behindCount = await this._pluginGit.revListCount(repoDir, "HEAD", "@{u}");
      return behindCount > 0;
    } catch (err) {
      this._logService.debug(`[AgentPluginRepositoryService] Silent fetch failed for ${marketplace.displayLabel}:`, err);
      return false;
    }
  }
  async cleanupPluginSource(plugin, otherInstalledDescriptors) {
    const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
    const cleanupDir = repo.getCleanupTarget(this._cacheRoot, plugin.sourceDescriptor);
    if (!cleanupDir) {
      return;
    }
    if (otherInstalledDescriptors) {
      const shared = otherInstalledDescriptors.some((other) => {
        const otherRepo = this.getPluginSource(other.kind);
        const otherTarget = otherRepo.getCleanupTarget(this._cacheRoot, other);
        return otherTarget && isEqual(otherTarget, cleanupDir);
      });
      if (shared) {
        this._logService.info(`[${plugin.sourceDescriptor.kind}] Skipping cleanup of shared cache: ${cleanupDir.toString()}`);
        return;
      }
    }
    try {
      const exists = await this._fileService.exists(cleanupDir);
      if (exists) {
        await this._fileService.del(cleanupDir, { recursive: true });
        this._logService.info(`[${plugin.sourceDescriptor.kind}] Removed plugin cache: ${cleanupDir.toString()}`);
      }
    } catch (err) {
      this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to remove plugin cache '${cleanupDir.toString()}':`, err);
    }
    try {
      await this._pruneEmptyParents(cleanupDir);
    } catch (err) {
      this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to cleanup plugin source:`, err);
    }
  }
  /**
   * Walk from {@link child}'s parent toward {@link _cacheRoot}, removing
   * each directory that is empty. Stops as soon as a non-empty directory
   * is found or the cache root is reached. Only operates on descendants
   * of the cache root — returns immediately for paths outside it.
   */
  async _pruneEmptyParents(child) {
    if (!isEqualOrParent(child, this._cacheRoot)) {
      return;
    }
    let current = dirname(child);
    while (isEqualOrParent(current, this._cacheRoot) && !isEqual(current, this._cacheRoot)) {
      try {
        const stat = await this._fileService.resolve(current);
        if (stat.children && stat.children.length > 0) {
          break;
        }
        await this._fileService.del(current);
      } catch {
        break;
      }
      current = dirname(current);
    }
  }
  /**
   * One-time migration of plugin files from the old internal cache
   * directory (`{cacheHome}/agentPlugins/`) to the new well-known
   * location (`~/{dataFolderName}/agent-plugins/`).
   */
  async _migrateDirectory(oldCacheRoot) {
    try {
      const oldExists = await this._fileService.exists(oldCacheRoot);
      if (!oldExists) {
        return;
      }
      const newExists = await this._fileService.exists(this.agentPluginsHome);
      if (newExists) {
        this._logService.info("[AgentPluginRepositoryService] Both old and new agent-plugins directories exist; skipping directory migration");
        return;
      }
      this._logService.info(`[AgentPluginRepositoryService] Migrating agent plugins from ${oldCacheRoot.toString()} to ${this.agentPluginsHome.toString()}`);
      await this._fileService.move(oldCacheRoot, this.agentPluginsHome, false);
      this._storageService.remove(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
      this._marketplaceIndex.value.clear();
    } catch (error) {
      this._logService.error("[AgentPluginRepositoryService] Directory migration failed", error);
    }
  }
};
AgentPluginRepositoryService = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IPluginGitService),
  __decorateParam(7, IProgressService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IUserDataProfileService)
], AgentPluginRepositoryService);
export {
  AgentPluginRepositoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXJCeUtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgdHlwZSB7IER0byB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwgSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zLCBJUHVsbFJlcG9zaXRvcnlPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2V0cGxhY2VQbHVnaW4sIElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgSVBsdWdpblNvdXJjZURlc2NyaXB0b3IsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZCwgTWFya2V0cGxhY2VUeXBlLCBQbHVnaW5Tb3VyY2VLaW5kIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQbHVnaW5Tb3VyY2UgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5Tb3VyY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpbkdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5HaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YlBsdWdpblNvdXJjZSwgR2l0VXJsUGx1Z2luU291cmNlLCBOcG1QbHVnaW5Tb3VyY2UsIFBpcFBsdWdpblNvdXJjZSwgUmVsYXRpdmVQYXRoUGx1Z2luU291cmNlIH0gZnJvbSAnLi9wbHVnaW5Tb3VyY2VzLmpzJztcblxuY29uc3QgTUFSS0VUUExBQ0VfSU5ERVhfU1RPUkFHRV9LRVkgPSAnY2hhdC5wbHVnaW5zLm1hcmtldHBsYWNlcy5pbmRleC52MSc7XG5cbmludGVyZmFjZSBJTWFya2V0cGxhY2VJbmRleEVudHJ5IHtcblx0cmVwb3NpdG9yeVVyaTogVVJJO1xuXHRtYXJrZXRwbGFjZVR5cGU/OiBNYXJrZXRwbGFjZVR5cGU7XG59XG5cbnR5cGUgSVN0b3JlZE1hcmtldHBsYWNlSW5kZXggPSBEdG88UmVjb3JkPHN0cmluZywgSU1hcmtldHBsYWNlSW5kZXhFbnRyeT4+O1xuXG5leHBvcnQgY2xhc3MgQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgYWdlbnRQbHVnaW5zSG9tZTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZVJvb3Q6IFVSSTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFya2V0cGxhY2VJbmRleCA9IG5ldyBMYXp5PE1hcDxzdHJpbmcsIElNYXJrZXRwbGFjZUluZGV4RW50cnk+PigoKSA9PiB0aGlzLl9sb2FkTWFya2V0cGxhY2VJbmRleCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGx1Z2luU291cmNlczogUmVhZG9ubHlNYXA8UGx1Z2luU291cmNlS2luZCwgSVBsdWdpblNvdXJjZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb25lU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWlncmF0aW9uRG9uZTogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVBsdWdpbkdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGx1Z2luR2l0OiBJUGx1Z2luR2l0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0KSB7XG5cdFx0Ly8gT24gbmF0aXZlLCB1c2UgdGhlIHdlbGwta25vd24gfi97ZGF0YUZvbGRlck5hbWV9L2FnZW50LXBsdWdpbnMvIHBhdGhcblx0XHQvLyBzbyB0aGF0IGV4dGVybmFsIHRvb2xzIGNhbiBkaXNjb3ZlciBpdC4gT24gd2ViLCBmYWxsIGJhY2sgdG8gdGhlXG5cdFx0Ly8gaW50ZXJuYWwgY2FjaGUgbG9jYXRpb24uXG5cdFx0dGhpcy5hZ2VudFBsdWdpbnNIb21lID0gdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5hZ2VudFBsdWdpbnNIb21lO1xuXHRcdGNvbnN0IGxlZ2FjeUNhY2hlUm9vdCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5jYWNoZUhvbWUsICdhZ2VudFBsdWdpbnMnKTtcblx0XHRjb25zdCBvbGRDYWNoZVJvb3QgPSBlbnZpcm9ubWVudFNlcnZpY2UuY2FjaGVIb21lLnNjaGVtZSA9PT0gJ2ZpbGUnXG5cdFx0XHQ/IGxlZ2FjeUNhY2hlUm9vdFxuXHRcdFx0OiB0aGlzLmFnZW50UGx1Z2luc0hvbWU7XG5cdFx0dGhpcy5fY2FjaGVSb290ID0gdGhpcy5hZ2VudFBsdWdpbnNIb21lO1xuXG5cdFx0Ly8gTWlncmF0ZSBwbHVnaW4gZmlsZXMgZnJvbSB0aGUgb2xkIGludGVybmFsIGNhY2hlIGRpcmVjdG9yeSB0byB0aGVcblx0XHQvLyBuZXcgd2VsbC1rbm93biBsb2NhdGlvbi4gVGhpcyBpcyBhIG9uZS10aW1lIG9wZXJhdGlvbi5cblx0XHRpZiAoIWlzRXF1YWwob2xkQ2FjaGVSb290LCB0aGlzLmFnZW50UGx1Z2luc0hvbWUpKSB7XG5cdFx0XHR0aGlzLl9taWdyYXRpb25Eb25lID0gdGhpcy5fbWlncmF0ZURpcmVjdG9yeShvbGRDYWNoZVJvb3QpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9taWdyYXRpb25Eb25lID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgcGVyLWtpbmQgc291cmNlIHJlcG9zaXRvcnkgbWFwIHZpYSBpbnN0YW50aWF0aW9uIHNlcnZpY2Ugc29cblx0XHQvLyBlYWNoIHJlcG9zaXRvcnkgY2FuIGluamVjdCBpdHMgb3duIGRlcGVuZGVuY2llcy5cblx0XHR0aGlzLl9wbHVnaW5Tb3VyY2VzID0gbmV3IE1hcDxQbHVnaW5Tb3VyY2VLaW5kLCBJUGx1Z2luU291cmNlPihbXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIG5ldyBSZWxhdGl2ZVBhdGhQbHVnaW5Tb3VyY2UoKV0sXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdpdEh1YlBsdWdpblNvdXJjZSldLFxuXHRcdFx0W1BsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHaXRVcmxQbHVnaW5Tb3VyY2UpXSxcblx0XHRcdFtQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTnBtUGx1Z2luU291cmNlKV0sXG5cdFx0XHRbUGx1Z2luU291cmNlS2luZC5QaXAsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBpcFBsdWdpblNvdXJjZSldLFxuXHRcdF0pO1xuXHR9XG5cblx0Z2V0UGx1Z2luU291cmNlKGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQpOiBJUGx1Z2luU291cmNlIHtcblx0XHRjb25zdCByZXBvID0gdGhpcy5fcGx1Z2luU291cmNlcy5nZXQoa2luZCk7XG5cdFx0aWYgKCFyZXBvKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHNvdXJjZSByZXBvc2l0b3J5IHJlZ2lzdGVyZWQgZm9yIGtpbmQgJyR7a2luZH0nYCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXBvO1xuXHR9XG5cblx0Z2V0UmVwb3NpdG9yeVVyaShtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBtYXJrZXRwbGFjZVR5cGU/OiBNYXJrZXRwbGFjZVR5cGUpOiBVUkkge1xuXHRcdGlmIChtYXJrZXRwbGFjZS5raW5kID09PSBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuTG9jYWxGaWxlVXJpICYmIG1hcmtldHBsYWNlLmxvY2FsUmVwb3NpdG9yeVVyaSkge1xuXHRcdFx0cmV0dXJuIG1hcmtldHBsYWNlLmxvY2FsUmVwb3NpdG9yeVVyaTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleGVkID0gdGhpcy5fbWFya2V0cGxhY2VJbmRleC52YWx1ZS5nZXQobWFya2V0cGxhY2UuY2Fub25pY2FsSWQpO1xuXHRcdGlmIChpbmRleGVkPy5yZXBvc2l0b3J5VXJpKSB7XG5cdFx0XHRyZXR1cm4gaW5kZXhlZC5yZXBvc2l0b3J5VXJpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9nZXRSZXBvQ2FjaGVEaXJGb3JSZWZlcmVuY2UobWFya2V0cGxhY2UpO1xuXHR9XG5cblx0Z2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IFVSSSB7XG5cdFx0aWYgKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQgIT09IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVwb0RpciA9IHRoaXMuZ2V0UmVwb3NpdG9yeVVyaShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRTb3VyY2UgPSBwbHVnaW4uc291cmNlLnRyaW0oKS5yZXBsYWNlKC9eXFwuP1xcLyt8XFwvKyQvZywgJycpO1xuXHRcdGNvbnN0IHBsdWdpbkRpciA9IG5vcm1hbGl6ZWRTb3VyY2UgPyBqb2luUGF0aChyZXBvRGlyLCBub3JtYWxpemVkU291cmNlKSA6IHJlcG9EaXI7XG5cdFx0aWYgKCFpc0VxdWFsT3JQYXJlbnQocGx1Z2luRGlyLCByZXBvRGlyKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHBsdWdpbiBzb3VyY2UgcGF0aCAnJHtwbHVnaW4uc291cmNlfSdgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHBsdWdpbkRpcjtcblx0fVxuXG5cdGFzeW5jIGVuc3VyZVJlcG9zaXRvcnkobWFya2V0cGxhY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgb3B0aW9ucz86IElFbnN1cmVSZXBvc2l0b3J5T3B0aW9ucyk6IFByb21pc2U8VVJJPiB7XG5cdFx0YXdhaXQgdGhpcy5fbWlncmF0aW9uRG9uZTtcblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5nZXRSZXBvc2l0b3J5VXJpKG1hcmtldHBsYWNlLCBvcHRpb25zPy5tYXJrZXRwbGFjZVR5cGUpO1xuXHRcdHJldHVybiB0aGlzLl9jbG9uZVNlcXVlbmNlci5xdWV1ZShyZXBvRGlyLmZzUGF0aCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb0V4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhyZXBvRGlyKTtcblx0XHRcdGlmIChyZXBvRXhpc3RzKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZU1hcmtldHBsYWNlSW5kZXgobWFya2V0cGxhY2UsIHJlcG9EaXIsIG9wdGlvbnM/Lm1hcmtldHBsYWNlVHlwZSk7XG5cdFx0XHRcdHJldHVybiByZXBvRGlyO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWFya2V0cGxhY2Uua2luZCA9PT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkxvY2FsRmlsZVVyaSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExvY2FsIG1hcmtldHBsYWNlIHJlcG9zaXRvcnkgZG9lcyBub3QgZXhpc3Q6ICR7cmVwb0Rpci5mc1BhdGh9YCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb2dyZXNzVGl0bGUgPSBvcHRpb25zPy5wcm9ncmVzc1RpdGxlID8/IGxvY2FsaXplKCdwcmVwYXJpbmdNYXJrZXRwbGFjZScsIFwiUHJlcGFyaW5nIHBsdWdpbiBtYXJrZXRwbGFjZSAnezB9Jy4uLlwiLCBtYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWwpO1xuXHRcdFx0Y29uc3QgZmFpbHVyZUxhYmVsID0gb3B0aW9ucz8uZmFpbHVyZUxhYmVsID8/IG1hcmtldHBsYWNlLmRpc3BsYXlMYWJlbDtcblx0XHRcdGF3YWl0IHRoaXMuX2Nsb25lUmVwb3NpdG9yeShyZXBvRGlyLCBtYXJrZXRwbGFjZS5jbG9uZVVybCwgcHJvZ3Jlc3NUaXRsZSwgZmFpbHVyZUxhYmVsLCBtYXJrZXRwbGFjZS5yZWYpO1xuXHRcdFx0dGhpcy5fdXBkYXRlTWFya2V0cGxhY2VJbmRleChtYXJrZXRwbGFjZSwgcmVwb0Rpciwgb3B0aW9ucz8ubWFya2V0cGxhY2VUeXBlKTtcblx0XHRcdHJldHVybiByZXBvRGlyO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcHVsbFJlcG9zaXRvcnkobWFya2V0cGxhY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5nZXRSZXBvc2l0b3J5VXJpKG1hcmtldHBsYWNlLCBvcHRpb25zPy5tYXJrZXRwbGFjZVR5cGUpO1xuXHRcdGNvbnN0IHJlcG9FeGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMocmVwb0Rpcik7XG5cdFx0aWYgKCFyZXBvRXhpc3RzKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlXSBDYW5ub3QgdXBkYXRlIHBsdWdpbiAnJHtvcHRpb25zPy5wbHVnaW5OYW1lID8/IG1hcmtldHBsYWNlLmRpc3BsYXlMYWJlbH0nOiByZXBvc2l0b3J5IG5vdCBjbG9uZWRgKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVMYWJlbCA9IG9wdGlvbnM/LnBsdWdpbk5hbWUgPz8gbWFya2V0cGxhY2UuZGlzcGxheUxhYmVsO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChvcHRpb25zPy5zaWxlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3BsdWdpbkdpdC5wdWxsKHJlcG9EaXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndXBkYXRpbmdQbHVnaW4nLCBcIlVwZGF0aW5nIHBsdWdpbiAnezB9Jy4uLlwiLCB1cGRhdGVMYWJlbCksXG5cdFx0XHRcdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCgpID0+IHRoaXMuX3BsdWdpbkdpdC5wdWxsKHJlcG9EaXIsIGN0cy50b2tlbiksXG5cdFx0XHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSksXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2VdIEZhaWxlZCB0byB1cGRhdGUgJHttYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWx9OmAsIGVycik7XG5cdFx0XHRpZiAoIW9wdGlvbnM/LnNpbGVudCkge1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9ucyA9IFtuZXcgQWN0aW9uKCdzaG93R2l0T3V0cHV0JywgbG9jYWxpemUoJ3Nob3dHaXRPdXRwdXQnLCBcIlNob3cgR2l0IE91dHB1dFwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZ2l0LnNob3dPdXRwdXQnKSldO1xuXHRcdFx0XHRjb25zdCBmYWlsdXJlTGFiZWwgPSBvcHRpb25zPy5mYWlsdXJlTGFiZWwgPz8gdXBkYXRlTGFiZWw7XG5cblx0XHRcdFx0aWYgKG1hcmtldHBsYWNlLmtpbmQgIT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkpIHtcblx0XHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ3B1cmdlQW5kUmVjbG9uZU1hcmtldHBsYWNlJywgbG9jYWxpemUoJ3B1cmdlQW5kUmVjbG9uZU1hcmtldHBsYWNlJywgXCJQdXJnZSBNYXJrZXRwbGFjZSBDYWNoZSBhbmQgUmVjbG9uZVwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLl9wdXJnZUFuZFJlY2xvbmVNYXJrZXRwbGFjZShtYXJrZXRwbGFjZSwgb3B0aW9ucz8ubWFya2V0cGxhY2VUeXBlLCBmYWlsdXJlTGFiZWwpKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwdWxsRmFpbGVkJywgXCJGYWlsZWQgdG8gdXBkYXRlIHBsdWdpbiAnezB9JzogezF9XCIsIGZhaWx1cmVMYWJlbCwgZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKSxcblx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBwcmltYXJ5QWN0aW9ucyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wdXJnZUFuZFJlY2xvbmVNYXJrZXRwbGFjZShtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZSB8IHVuZGVmaW5lZCwgbGFiZWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChtYXJrZXRwbGFjZS5raW5kID09PSBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuTG9jYWxGaWxlVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb0RpciA9IHRoaXMuZ2V0UmVwb3NpdG9yeVVyaShtYXJrZXRwbGFjZSwgbWFya2V0cGxhY2VUeXBlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3B1cmdpbmdNYXJrZXRwbGFjZScsIFwiUHVyZ2luZyBwbHVnaW4gbWFya2V0cGxhY2UgJ3swfScuLi5cIiwgbWFya2V0cGxhY2UuZGlzcGxheUxhYmVsKSxcblx0XHRcdFx0XHRjYW5jZWxsYWJsZTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMocmVwb0Rpcik7XG5cdFx0XHRcdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHJlcG9EaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogZmFsc2UgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZW5zdXJlUmVwb3NpdG9yeShtYXJrZXRwbGFjZSwge1xuXHRcdFx0XHRcdFx0bWFya2V0cGxhY2VUeXBlLFxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3NUaXRsZTogbG9jYWxpemUoJ3JlY2xvbmluZ01hcmtldHBsYWNlJywgXCJSZWNsb25pbmcgcGx1Z2luIG1hcmtldHBsYWNlICd7MH0nLi4uXCIsIG1hcmtldHBsYWNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRcdFx0XHRmYWlsdXJlTGFiZWw6IGxhYmVsLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ3B1cmdlTWFya2V0cGxhY2VTdWNjZXNzJywgXCJSZWNsb25lZCBwbHVnaW4gbWFya2V0cGxhY2UgJ3swfScuIFRyeSB1cGRhdGluZyBwbHVnaW5zIGFnYWluLlwiLCBtYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWwpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncHVyZ2VNYXJrZXRwbGFjZUZhaWxlZCcsIFwiRmFpbGVkIHRvIHB1cmdlIHBsdWdpbiBtYXJrZXRwbGFjZSAnezB9JzogezF9XCIsIG1hcmtldHBsYWNlLmRpc3BsYXlMYWJlbCwgZXJyPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpKSxcblx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdHByaW1hcnk6IFtuZXcgQWN0aW9uKCdzaG93R2l0T3V0cHV0JywgbG9jYWxpemUoJ3Nob3dHaXRPdXRwdXQnLCBcIlNob3cgR2l0IE91dHB1dFwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2dpdC5zaG93T3V0cHV0Jyk7XG5cdFx0XHRcdFx0fSldLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVwb0NhY2hlRGlyRm9yUmVmZXJlbmNlKHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlKTogVVJJIHtcblx0XHRyZXR1cm4gam9pblBhdGgodGhpcy5fY2FjaGVSb290LCAuLi5yZWZlcmVuY2UuY2FjaGVTZWdtZW50cyk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkTWFya2V0cGxhY2VJbmRleCgpOiBNYXA8c3RyaW5nLCBJTWFya2V0cGxhY2VJbmRleEVudHJ5PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIElNYXJrZXRwbGFjZUluZGV4RW50cnk+KCk7XG5cdFx0Y29uc3Qgc3RvcmVkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PElTdG9yZWRNYXJrZXRwbGFjZUluZGV4PihNQVJLRVRQTEFDRV9JTkRFWF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoIXN0b3JlZCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRjb25zdCByZXZpdmVkID0gcmV2aXZlPElTdG9yZWRNYXJrZXRwbGFjZUluZGV4PihzdG9yZWQpO1xuXHRcdGZvciAoY29uc3QgW2Nhbm9uaWNhbElkLCBlbnRyeV0gb2YgT2JqZWN0LmVudHJpZXMocmV2aXZlZCkpIHtcblx0XHRcdGlmICghZW50cnkgfHwgIWVudHJ5LnJlcG9zaXRvcnlVcmkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5zZXQoY2Fub25pY2FsSWQsIHtcblx0XHRcdFx0cmVwb3NpdG9yeVVyaTogZW50cnkucmVwb3NpdG9yeVVyaSxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBlbnRyeS5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTWFya2V0cGxhY2VJbmRleChtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCByZXBvc2l0b3J5VXJpOiBVUkksIG1hcmtldHBsYWNlVHlwZT86IE1hcmtldHBsYWNlVHlwZSk6IHZvaWQge1xuXHRcdGlmIChtYXJrZXRwbGFjZS5raW5kID09PSBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuTG9jYWxGaWxlVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9tYXJrZXRwbGFjZUluZGV4LnZhbHVlLmdldChtYXJrZXRwbGFjZS5jYW5vbmljYWxJZCk7XG5cdFx0aWYgKHByZXZpb3VzICYmIHByZXZpb3VzLnJlcG9zaXRvcnlVcmkudG9TdHJpbmcoKSA9PT0gcmVwb3NpdG9yeVVyaS50b1N0cmluZygpICYmIHByZXZpb3VzLm1hcmtldHBsYWNlVHlwZSA9PT0gbWFya2V0cGxhY2VUeXBlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWFya2V0cGxhY2VJbmRleC52YWx1ZS5zZXQobWFya2V0cGxhY2UuY2Fub25pY2FsSWQsIHsgcmVwb3NpdG9yeVVyaSwgbWFya2V0cGxhY2VUeXBlIH0pO1xuXHRcdHRoaXMuX3NhdmVNYXJrZXRwbGFjZUluZGV4KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlTWFya2V0cGxhY2VJbmRleCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJpYWxpemVkOiBJU3RvcmVkTWFya2V0cGxhY2VJbmRleCA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2Nhbm9uaWNhbElkLCBlbnRyeV0gb2YgdGhpcy5fbWFya2V0cGxhY2VJbmRleC52YWx1ZSkge1xuXHRcdFx0c2VyaWFsaXplZFtjYW5vbmljYWxJZF0gPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0cmVwb3NpdG9yeVVyaTogZW50cnkucmVwb3NpdG9yeVVyaSxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBlbnRyeS5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKE9iamVjdC5rZXlzKHNlcmlhbGl6ZWQpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKE1BUktFVFBMQUNFX0lOREVYX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKE1BUktFVFBMQUNFX0lOREVYX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShzZXJpYWxpemVkKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2xvbmVSZXBvc2l0b3J5KHJlcG9EaXI6IFVSSSwgY2xvbmVVcmw6IHN0cmluZywgcHJvZ3Jlc3NUaXRsZTogc3RyaW5nLCBmYWlsdXJlTGFiZWw6IHN0cmluZywgcmVmPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IHByb2dyZXNzVGl0bGUsXG5cdFx0XHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZGlybmFtZShyZXBvRGlyKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcGx1Z2luR2l0LmNsb25lUmVwb3NpdG9yeShjbG9uZVVybCwgcmVwb0RpciwgcmVmLCBjdHMudG9rZW4pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSxcblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZV0gRmFpbGVkIHRvIGNsb25lICR7Y2xvbmVVcmx9OmAsIGVycik7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Nsb25lRmFpbGVkJywgXCJGYWlsZWQgdG8gaW5zdGFsbCBwbHVnaW4gJ3swfSc6IHsxfVwiLCBmYWlsdXJlTGFiZWwsIGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSksXG5cdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBbbmV3IEFjdGlvbignc2hvd0dpdE91dHB1dCcsIGxvY2FsaXplKCdzaG93R2l0T3V0cHV0JywgXCJTaG93IEdpdCBPdXRwdXRcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2dpdC5zaG93T3V0cHV0Jyk7XG5cdFx0XHRcdFx0fSldLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaShzb3VyY2VEZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGx1Z2luU291cmNlKHNvdXJjZURlc2NyaXB0b3Iua2luZCkuZ2V0SW5zdGFsbFVyaSh0aGlzLl9jYWNoZVJvb3QsIHNvdXJjZURlc2NyaXB0b3IpO1xuXHR9XG5cblx0YXN5bmMgZW5zdXJlUGx1Z2luU291cmNlKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBvcHRpb25zPzogSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxVUkk+IHtcblx0XHRhd2FpdCB0aGlzLl9taWdyYXRpb25Eb25lO1xuXHRcdGNvbnN0IHJlcG8gPSB0aGlzLmdldFBsdWdpblNvdXJjZShwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kKTtcblx0XHRpZiAocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgpIHtcblx0XHRcdHJldHVybiB0aGlzLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCBvcHRpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcG8uZW5zdXJlKHRoaXMuX2NhY2hlUm9vdCwgcGx1Z2luLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVBsdWdpblNvdXJjZShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXBvID0gdGhpcy5nZXRQbHVnaW5Tb3VyY2UocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCk7XG5cdFx0aWYgKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wdWxsUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVwby51cGRhdGUodGhpcy5fY2FjaGVSb290LCBwbHVnaW4sIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2hSZXBvc2l0b3J5KG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXBvRGlyID0gdGhpcy5nZXRSZXBvc2l0b3J5VXJpKG1hcmtldHBsYWNlKTtcblx0XHRjb25zdCByZXBvRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlcG9EaXIpO1xuXHRcdGlmICghcmVwb0V4aXN0cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wbHVnaW5HaXQuZmV0Y2hSZXBvc2l0b3J5KHJlcG9EaXIpO1xuXHRcdFx0Y29uc3QgYmVoaW5kQ291bnQgPSBhd2FpdCB0aGlzLl9wbHVnaW5HaXQucmV2TGlzdENvdW50KHJlcG9EaXIsICdIRUFEJywgJ0B7dX0nKTtcblx0XHRcdHJldHVybiBiZWhpbmRDb3VudCA+IDA7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZV0gU2lsZW50IGZldGNoIGZhaWxlZCBmb3IgJHttYXJrZXRwbGFjZS5kaXNwbGF5TGFiZWx9OmAsIGVycik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xlYW51cFBsdWdpblNvdXJjZShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3RoZXJJbnN0YWxsZWREZXNjcmlwdG9ycz86IHJlYWRvbmx5IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvID0gdGhpcy5nZXRQbHVnaW5Tb3VyY2UocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCk7XG5cdFx0Y29uc3QgY2xlYW51cERpciA9IHJlcG8uZ2V0Q2xlYW51cFRhcmdldCh0aGlzLl9jYWNoZVJvb3QsIHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yKTtcblx0XHRpZiAoIWNsZWFudXBEaXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIGRlbGV0aW9uIHdoZW4gYW5vdGhlciBpbnN0YWxsZWQgcGx1Z2luIHNoYXJlcyB0aGUgc2FtZVxuXHRcdC8vIGNsZWFudXAgdGFyZ2V0IChlLmcuIHNhbWUgY2xvbmVkIHJlcG9zaXRvcnkgd2l0aCBkaWZmZXJlbnQgc3ViLXBhdGhzKS5cblx0XHRpZiAob3RoZXJJbnN0YWxsZWREZXNjcmlwdG9ycykge1xuXHRcdFx0Y29uc3Qgc2hhcmVkID0gb3RoZXJJbnN0YWxsZWREZXNjcmlwdG9ycy5zb21lKG90aGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgb3RoZXJSZXBvID0gdGhpcy5nZXRQbHVnaW5Tb3VyY2Uob3RoZXIua2luZCk7XG5cdFx0XHRcdGNvbnN0IG90aGVyVGFyZ2V0ID0gb3RoZXJSZXBvLmdldENsZWFudXBUYXJnZXQodGhpcy5fY2FjaGVSb290LCBvdGhlcik7XG5cdFx0XHRcdHJldHVybiBvdGhlclRhcmdldCAmJiBpc0VxdWFsKG90aGVyVGFyZ2V0LCBjbGVhbnVwRGlyKTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHNoYXJlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske3BsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmR9XSBTa2lwcGluZyBjbGVhbnVwIG9mIHNoYXJlZCBjYWNoZTogJHtjbGVhbnVwRGlyLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKGNsZWFudXBEaXIpO1xuXHRcdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwoY2xlYW51cERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH1dIFJlbW92ZWQgcGx1Z2luIGNhY2hlOiAke2NsZWFudXBEaXIudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH1dIEZhaWxlZCB0byByZW1vdmUgcGx1Z2luIGNhY2hlICcke2NsZWFudXBEaXIudG9TdHJpbmcoKX0nOmAsIGVycik7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFBydW5lIGVtcHR5IHBhcmVudCBkaXJlY3RvcmllcyB1cCB0byAoYnV0IG5vdCBpbmNsdWRpbmcpIHRoZSBjYWNoZSByb290XG5cdFx0XHQvLyBzbyB3ZSBkb24ndCBsZWF2ZSBkYW5nbGluZyBvd25lci9hdXRob3JpdHkgZm9sZGVycyBiZWhpbmQuXG5cdFx0XHRhd2FpdCB0aGlzLl9wcnVuZUVtcHR5UGFyZW50cyhjbGVhbnVwRGlyKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH1dIEZhaWxlZCB0byBjbGVhbnVwIHBsdWdpbiBzb3VyY2U6YCwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2FsayBmcm9tIHtAbGluayBjaGlsZH0ncyBwYXJlbnQgdG93YXJkIHtAbGluayBfY2FjaGVSb290fSwgcmVtb3Zpbmdcblx0ICogZWFjaCBkaXJlY3RvcnkgdGhhdCBpcyBlbXB0eS4gU3RvcHMgYXMgc29vbiBhcyBhIG5vbi1lbXB0eSBkaXJlY3Rvcnlcblx0ICogaXMgZm91bmQgb3IgdGhlIGNhY2hlIHJvb3QgaXMgcmVhY2hlZC4gT25seSBvcGVyYXRlcyBvbiBkZXNjZW5kYW50c1xuXHQgKiBvZiB0aGUgY2FjaGUgcm9vdCBcdTIwMTQgcmV0dXJucyBpbW1lZGlhdGVseSBmb3IgcGF0aHMgb3V0c2lkZSBpdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3BydW5lRW1wdHlQYXJlbnRzKGNoaWxkOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChjaGlsZCwgdGhpcy5fY2FjaGVSb290KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY3VycmVudCA9IGRpcm5hbWUoY2hpbGQpO1xuXHRcdHdoaWxlIChpc0VxdWFsT3JQYXJlbnQoY3VycmVudCwgdGhpcy5fY2FjaGVSb290KSAmJiAhaXNFcXVhbChjdXJyZW50LCB0aGlzLl9jYWNoZVJvb3QpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShjdXJyZW50KTtcblx0XHRcdFx0aWYgKHN0YXQuY2hpbGRyZW4gJiYgc3RhdC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKGN1cnJlbnQpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudCA9IGRpcm5hbWUoY3VycmVudCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9uZS10aW1lIG1pZ3JhdGlvbiBvZiBwbHVnaW4gZmlsZXMgZnJvbSB0aGUgb2xkIGludGVybmFsIGNhY2hlXG5cdCAqIGRpcmVjdG9yeSAoYHtjYWNoZUhvbWV9L2FnZW50UGx1Z2lucy9gKSB0byB0aGUgbmV3IHdlbGwta25vd25cblx0ICogbG9jYXRpb24gKGB+L3tkYXRhRm9sZGVyTmFtZX0vYWdlbnQtcGx1Z2lucy9gKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21pZ3JhdGVEaXJlY3Rvcnkob2xkQ2FjaGVSb290OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb2xkRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKG9sZENhY2hlUm9vdCk7XG5cdFx0XHRpZiAoIW9sZEV4aXN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld0V4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLmFnZW50UGx1Z2luc0hvbWUpO1xuXHRcdFx0aWYgKG5ld0V4aXN0cykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlXSBCb3RoIG9sZCBhbmQgbmV3IGFnZW50LXBsdWdpbnMgZGlyZWN0b3JpZXMgZXhpc3Q7IHNraXBwaW5nIGRpcmVjdG9yeSBtaWdyYXRpb24nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlXSBNaWdyYXRpbmcgYWdlbnQgcGx1Z2lucyBmcm9tICR7b2xkQ2FjaGVSb290LnRvU3RyaW5nKCl9IHRvICR7dGhpcy5hZ2VudFBsdWdpbnNIb21lLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5tb3ZlKG9sZENhY2hlUm9vdCwgdGhpcy5hZ2VudFBsdWdpbnNIb21lLCBmYWxzZSk7XG5cblx0XHRcdC8vIENsZWFyIHRoZSBtYXJrZXRwbGFjZSBpbmRleCBcdTIwMTQgaXQgY2FjaGVzIHJlcG9zaXRvcnkgVVJJcyB0aGF0XG5cdFx0XHQvLyBwb2ludGVkIHRvIHRoZSBvbGQgbG9jYXRpb24gYW5kIHdvdWxkIGNhdXNlIHBhdGggbWlzbWF0Y2hlcy5cblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShNQVJLRVRQTEFDRV9JTkRFWF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHRoaXMuX21hcmtldHBsYWNlSW5kZXgudmFsdWUuY2xlYXIoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2VdIERpcmVjdG9yeSBtaWdyYXRpb24gZmFpbGVkJywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFlBQVk7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsU0FBUyxTQUFTLGlCQUFpQixnQkFBZ0I7QUFFNUQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFD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
