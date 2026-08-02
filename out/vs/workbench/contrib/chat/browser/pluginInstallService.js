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
import { Codicon } from "../../../../base/common/codicons.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { untildify } from "../../../../base/common/labels.js";
import { posix, win32 } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IAgentPluginRepositoryService } from "../common/plugins/agentPluginRepositoryService.js";
import { ChatConfiguration } from "../common/constants.js";
import { IPluginMarketplaceService, MarketplaceReferenceKind, MarketplaceType, hasSourceChanged, parseMarketplaceReference, parseMarketplaceReferences, PluginSourceKind, readConfiguredMarketplaces } from "../common/plugins/pluginMarketplaceService.js";
let PluginInstallService = class {
  constructor(_pluginRepositoryService, _pluginMarketplaceService, _fileService, _notificationService, _dialogService, _logService, _progressService, _commandService, _quickInputService, _configurationService, _pathService) {
    this._pluginRepositoryService = _pluginRepositoryService;
    this._pluginMarketplaceService = _pluginMarketplaceService;
    this._fileService = _fileService;
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._logService = _logService;
    this._progressService = _progressService;
    this._commandService = _commandService;
    this._quickInputService = _quickInputService;
    this._configurationService = _configurationService;
    this._pathService = _pathService;
  }
  async installPlugin(plugin) {
    if (!await this._ensureMarketplaceTrusted(plugin)) {
      throw new CancellationError();
    }
    const kind = plugin.sourceDescriptor.kind;
    if (kind === PluginSourceKind.RelativePath) {
      return this._installRelativePathPlugin(plugin);
    }
    if (kind === PluginSourceKind.Npm || kind === PluginSourceKind.Pip) {
      await this._installPackagePlugin(plugin);
      return;
    }
    return this._installGitPlugin(plugin);
  }
  validatePluginSource(source) {
    const reference = parseMarketplaceReference(source);
    if (reference || this._isLocalPathSource(source)) {
      return void 0;
    }
    return localize("invalidSource", "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", source);
  }
  async installPluginFromSource(source, options) {
    const reference = parseMarketplaceReference(source);
    if (reference && reference.kind !== MarketplaceReferenceKind.LocalFileUri) {
      return this._doInstallFromSource(reference, options);
    }
    const local = await this._resolveLocalDirectorySource(source);
    if (local) {
      return this._doInstallFromLocalSource(local.reference, local.configPath, options);
    }
    return {
      success: false,
      message: localize("invalidSource", "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", source)
    };
  }
  async _doInstallFromSource(reference, options) {
    const sourceDescriptor = reference.kind === MarketplaceReferenceKind.GitHubShorthand ? { kind: PluginSourceKind.GitHub, repo: reference.githubRepo } : { kind: PluginSourceKind.GitUrl, url: reference.cloneUrl };
    const tempPlugin = {
      name: reference.displayLabel,
      description: "",
      version: "",
      source: "",
      sourceDescriptor,
      marketplace: reference.displayLabel,
      marketplaceReference: reference,
      marketplaceType: MarketplaceType.OpenPlugin
    };
    if (!await this._ensureMarketplaceTrusted(tempPlugin)) {
      return { success: false };
    }
    let repoDir;
    try {
      repoDir = await this._pluginRepositoryService.ensurePluginSource(tempPlugin, {
        progressTitle: localize("cloningSource", "Cloning plugin source '{0}'...", reference.displayLabel),
        failureLabel: reference.displayLabel,
        marketplaceType: MarketplaceType.OpenPlugin
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        message: localize("cloneFailedDetail", "Failed to clone plugin source '{0}': {1}", reference.displayLabel, detail)
      };
    }
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      return {
        success: false,
        message: localize("cloneFailed", "Failed to clone plugin source '{0}'.", reference.displayLabel)
      };
    }
    const discoveredPlugins = await this._pluginMarketplaceService.readPluginsFromDirectory(repoDir, reference);
    if (discoveredPlugins.length === 0) {
      const singlePlugin = await this._pluginMarketplaceService.readSinglePluginManifest(repoDir, reference);
      if (singlePlugin) {
        if (options?.plugin && options.plugin !== singlePlugin.name) {
          return {
            success: false,
            message: localize("pluginNotFound", "Plugin '{0}' not found in '{1}'.", options.plugin, reference.displayLabel)
          };
        }
        await this.installPlugin(singlePlugin);
        return options?.plugin ? { success: true, matchedPlugin: singlePlugin } : { success: true };
      }
      void this._pluginRepositoryService.cleanupPluginSource(tempPlugin);
      return {
        success: false,
        message: localize("noPluginsFound", "No plugins found in '{0}'. This does not appear to be a valid plugin marketplace.", reference.displayLabel)
      };
    }
    return this._installDiscoveredPlugins(reference, discoveredPlugins, options);
  }
  /**
   * Installs a plugin from a local folder path (`file://` URI, absolute path,
   * or `~`-prefixed path). Inspects the directory to decide whether it is a
   * marketplace or a standalone plugin and writes to the appropriate setting:
   * - a marketplace is registered under `chat.plugins.marketplaces`,
   * - a standalone plugin path is registered under `chat.pluginLocations`.
   */
  async _doInstallFromLocalSource(reference, configPath, options) {
    const repoDir = reference.localRepositoryUri;
    if (!repoDir) {
      return {
        success: false,
        message: localize("invalidSource", "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", reference.rawValue)
      };
    }
    let isDirectory = false;
    try {
      isDirectory = (await this._fileService.resolve(repoDir)).isDirectory;
    } catch {
    }
    if (!isDirectory) {
      return {
        success: false,
        message: localize("localSourceNotFound", "The folder '{0}' does not exist or is not a directory.", repoDir.fsPath)
      };
    }
    const discoveredPlugins = await this._pluginMarketplaceService.readPluginsFromDirectory(repoDir, reference);
    if (discoveredPlugins.length > 0) {
      const tempPlugin = {
        name: reference.displayLabel,
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: reference.displayLabel,
        marketplaceReference: reference,
        marketplaceType: MarketplaceType.OpenPlugin
      };
      if (!await this._ensureMarketplaceTrusted(tempPlugin)) {
        return { success: false };
      }
      return this._installDiscoveredPlugins(reference, discoveredPlugins, options);
    }
    if (await this._pluginMarketplaceService.isPluginDirectory(repoDir)) {
      await this._addPluginLocationToConfig(configPath);
      return { success: true };
    }
    return {
      success: false,
      message: localize("localNoPlugins", "No plugin or marketplace found in '{0}'. This folder does not contain a plugin or marketplace manifest.", repoDir.fsPath)
    };
  }
  /**
   * Registers the marketplace and installs the discovered plugin(s): when a
   * specific plugin is targeted it installs that one, when there is exactly
   * one it installs it directly, and otherwise prompts the user to choose.
   */
  async _installDiscoveredPlugins(reference, discoveredPlugins, options) {
    if (options?.plugin) {
      const matchedPlugin = discoveredPlugins.find((p) => p.name === options.plugin);
      if (!matchedPlugin) {
        return {
          success: false,
          message: localize("pluginNotFound", "Plugin '{0}' not found in '{1}'.", options.plugin, reference.displayLabel)
        };
      }
      await this._addMarketplaceToConfig(reference);
      await this.installPlugin(matchedPlugin);
      return { success: true, matchedPlugin };
    }
    if (discoveredPlugins.length === 1) {
      await this._addMarketplaceToConfig(reference);
      await this.installPlugin(discoveredPlugins[0]);
      return { success: true };
    }
    const picks = discoveredPlugins.map((p) => ({
      label: p.name,
      description: p.description,
      plugin: p
    }));
    const selected = await this._quickInputService.pick(picks, {
      placeHolder: localize("selectPlugin", "Select a plugin to install from '{0}'", reference.displayLabel),
      canPickMany: false
    });
    if (!selected) {
      return { success: false };
    }
    await this._addMarketplaceToConfig(reference);
    await this.installPlugin(selected.plugin);
    return { success: true };
  }
  _addMarketplaceToConfig(reference) {
    const { userValues, effectiveValues } = readConfiguredMarketplaces(this._configurationService);
    const existingRefs = parseMarketplaceReferences(effectiveValues);
    if (existingRefs.some((r) => r.canonicalId === reference.canonicalId)) {
      return;
    }
    return this._configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...userValues, reference.rawValue]);
  }
  _addPluginLocationToConfig(pathKey) {
    const current = this._configurationService.inspect(ChatConfiguration.PluginLocations).userValue ?? {};
    if (current[pathKey] === true) {
      return;
    }
    return this._configurationService.updateValue(ChatConfiguration.PluginLocations, { ...current, [pathKey]: true });
  }
  /**
   * Returns `true` when the source string looks like a local folder path —
   * a `file://` URI, an absolute filesystem path, or a `~`-prefixed path.
   * This is a synchronous format check only; existence is verified later.
   */
  _isLocalPathSource(source) {
    const trimmed = source.trim();
    if (!trimmed) {
      return false;
    }
    if (/^file:\/\//i.test(trimmed)) {
      return true;
    }
    if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
      return true;
    }
    return win32.isAbsolute(trimmed) || posix.isAbsolute(trimmed);
  }
  /**
   * Resolves a local folder source string to a {@link MarketplaceReferenceKind.LocalFileUri}
   * reference plus the path to persist in `chat.pluginLocations`. Tilde paths
   * are expanded against the user home. Returns `undefined` when the string
   * does not resolve to an absolute local folder.
   */
  async _resolveLocalDirectorySource(source) {
    const trimmed = source.trim();
    const parsed = parseMarketplaceReference(trimmed);
    if (parsed?.kind === MarketplaceReferenceKind.LocalFileUri && parsed.localRepositoryUri) {
      return { reference: parsed, configPath: parsed.localRepositoryUri.fsPath };
    }
    if (!this._isLocalPathSource(trimmed)) {
      return void 0;
    }
    let resolvedPath = trimmed;
    if (resolvedPath.startsWith("~")) {
      const userHome = await this._pathService.userHome();
      const home = userHome.scheme === "file" ? userHome.fsPath : userHome.path;
      resolvedPath = untildify(resolvedPath, home);
    }
    if (!win32.isAbsolute(resolvedPath) && !posix.isAbsolute(resolvedPath)) {
      return void 0;
    }
    const reference = parseMarketplaceReference(URI.file(resolvedPath).toString());
    if (reference?.kind !== MarketplaceReferenceKind.LocalFileUri) {
      return void 0;
    }
    return { reference, configPath: trimmed };
  }
  async updatePlugin(plugin, silent) {
    if (this._pluginMarketplaceService.isStrictMarketplacePolicyActive() && !this._pluginMarketplaceService.isMarketplaceTrusted(plugin.marketplaceReference)) {
      this._notificationService.notify({
        severity: Severity.Warning,
        message: localize("strictMarketplaceBlockedUpdate", "Updates from '{0}' are blocked by your organization's policy.", plugin.marketplaceReference.displayLabel)
      });
      return false;
    }
    const kind = plugin.sourceDescriptor.kind;
    if (kind === PluginSourceKind.Npm || kind === PluginSourceKind.Pip) {
      return this._installPackagePlugin(plugin, silent);
    }
    return this._pluginRepositoryService.updatePluginSource(plugin, {
      pluginName: plugin.name,
      failureLabel: plugin.name,
      marketplaceType: plugin.marketplaceType
    });
  }
  async updateAllPlugins(options, token) {
    const allInstalled = this._pluginMarketplaceService.installedPlugins.get();
    const installed = allInstalled.filter(
      (entry) => (!options.marketplaceIds || options.marketplaceIds.has(entry.plugin.marketplaceReference.canonicalId)) && (!options.automatic || this._pluginMarketplaceService.isMarketplaceAutoUpdateEnabled(entry.plugin.marketplaceReference))
    );
    if (installed.length === 0) {
      return { updatedNames: [], failedNames: [] };
    }
    const updatedNames = [];
    const failedNames = [];
    const doUpdate = async () => {
      const gitTasks = [];
      const packagePlugins = [];
      const seenMarketplaces = /* @__PURE__ */ new Set();
      for (const entry of installed) {
        const ref = entry.plugin.marketplaceReference;
        if (seenMarketplaces.has(ref.canonicalId)) {
          continue;
        }
        seenMarketplaces.add(ref.canonicalId);
        if (this._pluginMarketplaceService.isStrictMarketplacePolicyActive() && !this._pluginMarketplaceService.isMarketplaceTrusted(ref)) {
          failedNames.push(ref.displayLabel);
          continue;
        }
        gitTasks.push((async () => {
          if (token.isCancellationRequested) {
            return;
          }
          try {
            const changed = await this._pluginRepositoryService.pullRepository(ref, {
              pluginName: ref.displayLabel,
              failureLabel: ref.displayLabel,
              marketplaceType: entry.plugin.marketplaceType,
              silent: options.silent
            });
            if (changed) {
              updatedNames.push(ref.displayLabel);
            }
          } catch (err) {
            this._logService.error(`[PluginInstallService] Failed to pull marketplace '${ref.displayLabel}':`, err);
            failedNames.push(ref.displayLabel);
          }
        })());
      }
      await Promise.all(gitTasks);
      const marketplaceIds = new Set(installed.map((entry) => entry.plugin.marketplaceReference.canonicalId));
      const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(token, marketplaceIds);
      const marketplaceByKey = /* @__PURE__ */ new Map();
      for (const mp of marketplacePlugins) {
        marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
      }
      const independentGitTasks = [];
      for (const entry of installed) {
        if (entry.plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
          continue;
        }
        const livePlugin = marketplaceByKey.get(`${entry.plugin.marketplaceReference.canonicalId}::${entry.plugin.name}`);
        if (!livePlugin || !hasSourceChanged(entry.plugin.sourceDescriptor, livePlugin.sourceDescriptor)) {
          continue;
        }
        const desc = livePlugin.sourceDescriptor;
        if (desc.kind === PluginSourceKind.Npm || desc.kind === PluginSourceKind.Pip) {
          if (!options.force && !desc.version) {
            continue;
          }
          packagePlugins.push({ installed: entry.plugin, marketplace: livePlugin });
          continue;
        }
        independentGitTasks.push((async () => {
          if (token.isCancellationRequested) {
            return;
          }
          try {
            const changed = await this._pluginRepositoryService.updatePluginSource(livePlugin, {
              pluginName: livePlugin.name,
              failureLabel: livePlugin.name,
              marketplaceType: livePlugin.marketplaceType,
              silent: options.silent
            });
            if (changed) {
              updatedNames.push(livePlugin.name);
              this._pluginMarketplaceService.addInstalledPlugin(entry.pluginUri, livePlugin);
            }
          } catch (err) {
            this._logService.error(`[PluginInstallService] Failed to update plugin '${livePlugin.name}':`, err);
            failedNames.push(livePlugin.name);
          }
        })());
      }
      await Promise.all(independentGitTasks);
      for (const { installed: _installed, marketplace } of packagePlugins) {
        if (token.isCancellationRequested) {
          return;
        }
        try {
          const changed = await this.updatePlugin(marketplace, options?.silent);
          if (changed) {
            updatedNames.push(marketplace.name);
            const pluginUri = this._pluginRepositoryService.getPluginSourceInstallUri(marketplace.sourceDescriptor);
            this._pluginMarketplaceService.addInstalledPlugin(pluginUri, marketplace);
          }
        } catch (err) {
          this._logService.error(`[PluginInstallService] Failed to update plugin '${marketplace.name}':`, err);
          failedNames.push(marketplace.name);
        }
      }
    };
    if (options.silent) {
      await doUpdate();
    } else {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize("updatingAllPlugins", "Updating plugins...")
        },
        doUpdate
      );
    }
    if (failedNames.length > 0) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("updateAllFailed", "Failed to update: {0}", failedNames.join(", ")),
        actions: {
          primary: [new Action("showGitOutput", localize("showOutput", "Show Output"), void 0, true, () => {
            this._commandService.executeCommand("git.showOutput");
          })]
        }
      });
    } else if (updatedNames.length > 0) {
      if (!options.automatic) {
        this._pluginMarketplaceService.clearUpdatesAvailable(options.marketplaceIds);
      }
      this._notificationService.notify({
        severity: Severity.Info,
        message: localize("updateAllSuccess", "Updated plugins: {0}", updatedNames.join(", "))
      });
    } else if (!token.isCancellationRequested) {
      if (!options.automatic) {
        this._pluginMarketplaceService.clearUpdatesAvailable(options.marketplaceIds);
      }
    }
    return { updatedNames, failedNames };
  }
  getPluginInstallUri(plugin) {
    return this._pluginRepositoryService.getPluginInstallUri(plugin);
  }
  // --- Trust gate -------------------------------------------------------------
  async _ensureMarketplaceTrusted(plugin) {
    if (this._pluginMarketplaceService.isMarketplaceTrusted(plugin.marketplaceReference)) {
      return true;
    }
    if (this._pluginMarketplaceService.isStrictMarketplacePolicyActive()) {
      this._notificationService.notify({
        severity: Severity.Warning,
        message: localize("strictMarketplaceBlockedInstall", "Plugins from '{0}' are blocked by your organization's policy.", plugin.marketplaceReference.displayLabel),
        actions: {
          primary: [new Action("chat.plugins.viewMarketplacePolicy", localize("viewPolicySettings", "View Policy Settings"), void 0, true, () => {
            return this._commandService.executeCommand("workbench.action.openSettings", ChatConfiguration.StrictMarketplaces);
          })]
        }
      });
      return false;
    }
    const { confirmed } = await this._dialogService.confirm({
      type: "question",
      message: localize("trustMarketplace", "Trust Plugins from '{0}'?", plugin.marketplaceReference.displayLabel),
      detail: localize("trustMarketplaceDetail", "Plugins can run code on your machine. Only install plugins from sources you trust.\n\nSource: {0}", plugin.marketplaceReference.rawValue),
      primaryButton: localize({ key: "trustAndInstall", comment: ["&& denotes a mnemonic"] }, "&&Trust"),
      custom: {
        icon: Codicon.shield
      }
    });
    if (!confirmed) {
      return false;
    }
    this._pluginMarketplaceService.trustMarketplace(plugin.marketplaceReference);
    return true;
  }
  // --- Relative-path source (existing git-based flow) -----------------------
  async _installRelativePathPlugin(plugin) {
    try {
      await this._pluginRepositoryService.ensureRepository(plugin.marketplaceReference, {
        progressTitle: localize("installingPlugin", "Installing plugin '{0}'...", plugin.name),
        failureLabel: plugin.name,
        marketplaceType: plugin.marketplaceType
      });
    } catch {
      return;
    }
    let pluginDir;
    try {
      pluginDir = this._pluginRepositoryService.getPluginInstallUri(plugin);
    } catch {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("pluginDirInvalid", "Plugin source directory '{0}' is invalid for repository '{1}'.", plugin.source, plugin.marketplace)
      });
      return;
    }
    const pluginExists = await this._fileService.exists(pluginDir);
    if (!pluginExists) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("pluginDirNotFound", "Plugin source directory '{0}' not found in repository '{1}'.", plugin.source, plugin.marketplace)
      });
      return;
    }
    this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
  }
  // --- GitHub / Git URL source (independent clone) --------------------------
  async _installGitPlugin(plugin) {
    const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
    let pluginDir;
    try {
      pluginDir = await this._pluginRepositoryService.ensurePluginSource(plugin, {
        progressTitle: localize("installingPlugin", "Installing plugin '{0}'...", plugin.name),
        failureLabel: plugin.name,
        marketplaceType: plugin.marketplaceType
      });
    } catch {
      return;
    }
    const pluginExists = await this._fileService.exists(pluginDir);
    if (!pluginExists) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("pluginSourceNotFound", "Plugin source '{0}' not found after cloning.", repo.getLabel(plugin.sourceDescriptor))
      });
      return;
    }
    this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
  }
  // --- Package-manager sources (npm / pip) ----------------------------------
  async _installPackagePlugin(plugin, silent) {
    const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
    if (!repo.runInstall) {
      this._logService.error(`[PluginInstallService] Expected package repository for kind '${plugin.sourceDescriptor.kind}'`);
      return false;
    }
    const installDir = await this._pluginRepositoryService.ensurePluginSource(plugin);
    const pluginDir = this._pluginRepositoryService.getPluginSourceInstallUri(plugin.sourceDescriptor);
    const result = await repo.runInstall(installDir, pluginDir, plugin, { silent });
    if (!result) {
      return false;
    }
    this._pluginMarketplaceService.addInstalledPlugin(result.pluginDir, plugin);
    return true;
  }
};
PluginInstallService = __decorateClass([
  __decorateParam(0, IAgentPluginRepositoryService),
  __decorateParam(1, IPluginMarketplaceService),
  __decorateParam(2, IFileService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IQuickInputService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IPathService)
], PluginInstallService);
export {
  PluginInstallService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wbHVnaW5JbnN0YWxsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHVudGlsZGlmeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBwb3NpeCwgd2luMzIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElQbHVnaW5JbnN0YWxsU2VydmljZSwgSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlT3B0aW9ucywgSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlUmVzdWx0LCBJVXBkYXRlQWxsUGx1Z2luc09wdGlvbnMsIElVcGRhdGVBbGxQbHVnaW5zUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtldHBsYWNlUGx1Z2luLCBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZCwgTWFya2V0cGxhY2VUeXBlLCBoYXNTb3VyY2VDaGFuZ2VkLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlLCBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcywgUGx1Z2luU291cmNlS2luZCwgcmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXMgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgUGx1Z2luSW5zdGFsbFNlcnZpY2UgaW1wbGVtZW50cyBJUGx1Z2luSW5zdGFsbFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2U6IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLFxuXHRcdEBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZTogSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpbnN0YWxsUGx1Z2luKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9lbnN1cmVNYXJrZXRwbGFjZVRydXN0ZWQocGx1Z2luKSkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2luZCA9IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQ7XG5cblx0XHRpZiAoa2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pbnN0YWxsUmVsYXRpdmVQYXRoUGx1Z2luKHBsdWdpbik7XG5cdFx0fVxuXG5cdFx0aWYgKGtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuTnBtIHx8IGtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuUGlwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9pbnN0YWxsUGFja2FnZVBsdWdpbihwbHVnaW4pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdpdEh1YiAvIEdpdFVybFxuXHRcdHJldHVybiB0aGlzLl9pbnN0YWxsR2l0UGx1Z2luKHBsdWdpbik7XG5cdH1cblxuXHR2YWxpZGF0ZVBsdWdpblNvdXJjZShzb3VyY2U6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZShzb3VyY2UpO1xuXHRcdGlmIChyZWZlcmVuY2UgfHwgdGhpcy5faXNMb2NhbFBhdGhTb3VyY2Uoc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdpbnZhbGlkU291cmNlJywgXCInezB9JyBpcyBub3QgYSB2YWxpZCBwbHVnaW4gc291cmNlLiBFbnRlciBhIEdpdEh1YiByZXBvc2l0b3J5IChvd25lci9yZXBvKSwgYSBnaXQgY2xvbmUgVVJMLCBvciBhIGxvY2FsIGZvbGRlciBwYXRoLlwiLCBzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2Uoc291cmNlOiBzdHJpbmcsIG9wdGlvbnM/OiBJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VPcHRpb25zKTogUHJvbWlzZTxJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VSZXN1bHQ+IHtcblx0XHRjb25zdCByZWZlcmVuY2UgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKHNvdXJjZSk7XG5cdFx0aWYgKHJlZmVyZW5jZSAmJiByZWZlcmVuY2Uua2luZCAhPT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkxvY2FsRmlsZVVyaSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvSW5zdGFsbEZyb21Tb3VyY2UocmVmZXJlbmNlLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVMb2NhbERpcmVjdG9yeVNvdXJjZShzb3VyY2UpO1xuXHRcdGlmIChsb2NhbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvSW5zdGFsbEZyb21Mb2NhbFNvdXJjZShsb2NhbC5yZWZlcmVuY2UsIGxvY2FsLmNvbmZpZ1BhdGgsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdpbnZhbGlkU291cmNlJywgXCInezB9JyBpcyBub3QgYSB2YWxpZCBwbHVnaW4gc291cmNlLiBFbnRlciBhIEdpdEh1YiByZXBvc2l0b3J5IChvd25lci9yZXBvKSwgYSBnaXQgY2xvbmUgVVJMLCBvciBhIGxvY2FsIGZvbGRlciBwYXRoLlwiLCBzb3VyY2UpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb0luc3RhbGxGcm9tU291cmNlKHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBvcHRpb25zPzogSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlT3B0aW9ucyk6IFByb21pc2U8SUluc3RhbGxQbHVnaW5Gcm9tU291cmNlUmVzdWx0PiB7XG5cdFx0Ly8gQnVpbGQgYSBzb3VyY2UgZGVzY3JpcHRvciBmb3IgdGhlIGdpdCBjbG9uZS5cblx0XHRjb25zdCBzb3VyY2VEZXNjcmlwdG9yID0gcmVmZXJlbmNlLmtpbmQgPT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRIdWJTaG9ydGhhbmRcblx0XHRcdD8geyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiBhcyBjb25zdCwgcmVwbzogcmVmZXJlbmNlLmdpdGh1YlJlcG8hIH1cblx0XHRcdDogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdFVybCBhcyBjb25zdCwgdXJsOiByZWZlcmVuY2UuY2xvbmVVcmwgfTtcblxuXHRcdC8vIEJ1aWxkIGEgdGVtcG9yYXJ5IHBsdWdpbiBvYmplY3QgZm9yIHRoZSB0cnVzdCBnYXRlIGFuZCBjbG9uZSBzdGVwLlxuXHRcdGNvbnN0IHRlbXBQbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiA9IHtcblx0XHRcdG5hbWU6IHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRzb3VyY2VEZXNjcmlwdG9yLFxuXHRcdFx0bWFya2V0cGxhY2U6IHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwsXG5cdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmZXJlbmNlLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHR9O1xuXG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9lbnN1cmVNYXJrZXRwbGFjZVRydXN0ZWQodGVtcFBsdWdpbikpIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvbmUgdGhlIHJlcG9zaXRvcnkuXG5cdFx0bGV0IHJlcG9EaXI6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0cmVwb0RpciA9IGF3YWl0IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmVuc3VyZVBsdWdpblNvdXJjZSh0ZW1wUGx1Z2luLCB7XG5cdFx0XHRcdHByb2dyZXNzVGl0bGU6IGxvY2FsaXplKCdjbG9uaW5nU291cmNlJywgXCJDbG9uaW5nIHBsdWdpbiBzb3VyY2UgJ3swfScuLi5cIiwgcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRcdGZhaWx1cmVMYWJlbDogcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IGRldGFpbCA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2xvbmVGYWlsZWREZXRhaWwnLCBcIkZhaWxlZCB0byBjbG9uZSBwbHVnaW4gc291cmNlICd7MH0nOiB7MX1cIiwgcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCwgZGV0YWlsKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb0V4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhyZXBvRGlyKTtcblx0XHRpZiAoIXJlcG9FeGlzdHMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2xvbmVGYWlsZWQnLCBcIkZhaWxlZCB0byBjbG9uZSBwbHVnaW4gc291cmNlICd7MH0nLlwiLCByZWZlcmVuY2UuZGlzcGxheUxhYmVsKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gU2NhbiBmb3IgbWFya2V0cGxhY2UuanNvbiB0byBkaXNjb3ZlciBwbHVnaW5zLlxuXHRcdGNvbnN0IGRpc2NvdmVyZWRQbHVnaW5zID0gYXdhaXQgdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnJlYWRQbHVnaW5zRnJvbURpcmVjdG9yeShyZXBvRGlyLCByZWZlcmVuY2UpO1xuXG5cdFx0aWYgKGRpc2NvdmVyZWRQbHVnaW5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gRmFsbCBiYWNrIHRvIGEgc2luZ2xlLXBsdWdpbiBtYW5pZmVzdCBhdCB0aGUgcmVwbyByb290XG5cdFx0XHQvLyAoZS5nLiBgLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb25gKS4gU3VjaCByZXBvcyBhcmUgbm90XG5cdFx0XHQvLyBtYXJrZXRwbGFjZXMsIHNvIHdlIGRvIE5PVCByZWdpc3RlciB0aGUgcmVmZXJlbmNlIHVuZGVyIHRoZVxuXHRcdFx0Ly8gYGNoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXNgIGNvbmZpZyBcdTIwMTQgdXBkYXRlcyBmbG93IHRocm91Z2hcblx0XHRcdC8vIGB1cGRhdGVQbHVnaW5Tb3VyY2VgIHZpYSB0aGUgcGx1Z2luJ3MgZ2l0IHNvdXJjZSBkZXNjcmlwdG9yLlxuXHRcdFx0Y29uc3Qgc2luZ2xlUGx1Z2luID0gYXdhaXQgdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnJlYWRTaW5nbGVQbHVnaW5NYW5pZmVzdChyZXBvRGlyLCByZWZlcmVuY2UpO1xuXHRcdFx0aWYgKHNpbmdsZVBsdWdpbikge1xuXHRcdFx0XHRpZiAob3B0aW9ucz8ucGx1Z2luICYmIG9wdGlvbnMucGx1Z2luICE9PSBzaW5nbGVQbHVnaW4ubmFtZSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwbHVnaW5Ob3RGb3VuZCcsIFwiUGx1Z2luICd7MH0nIG5vdCBmb3VuZCBpbiAnezF9Jy5cIiwgb3B0aW9ucy5wbHVnaW4sIHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YWxsUGx1Z2luKHNpbmdsZVBsdWdpbik7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zPy5wbHVnaW5cblx0XHRcdFx0XHQ/IHsgc3VjY2VzczogdHJ1ZSwgbWF0Y2hlZFBsdWdpbjogc2luZ2xlUGx1Z2luIH1cblx0XHRcdFx0XHQ6IHsgc3VjY2VzczogdHJ1ZSB9O1xuXHRcdFx0fVxuXG5cdFx0XHR2b2lkIHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmNsZWFudXBQbHVnaW5Tb3VyY2UodGVtcFBsdWdpbik7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ25vUGx1Z2luc0ZvdW5kJywgXCJObyBwbHVnaW5zIGZvdW5kIGluICd7MH0nLiBUaGlzIGRvZXMgbm90IGFwcGVhciB0byBiZSBhIHZhbGlkIHBsdWdpbiBtYXJrZXRwbGFjZS5cIiwgcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gdGFyZ2V0aW5nIGEgc3BlY2lmaWMgcGx1Z2luLCBmaW5kIGl0LCByZWdpc3RlciBpdCwgYW5kIHJldHVybi5cblx0XHRyZXR1cm4gdGhpcy5faW5zdGFsbERpc2NvdmVyZWRQbHVnaW5zKHJlZmVyZW5jZSwgZGlzY292ZXJlZFBsdWdpbnMsIG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluc3RhbGxzIGEgcGx1Z2luIGZyb20gYSBsb2NhbCBmb2xkZXIgcGF0aCAoYGZpbGU6Ly9gIFVSSSwgYWJzb2x1dGUgcGF0aCxcblx0ICogb3IgYH5gLXByZWZpeGVkIHBhdGgpLiBJbnNwZWN0cyB0aGUgZGlyZWN0b3J5IHRvIGRlY2lkZSB3aGV0aGVyIGl0IGlzIGFcblx0ICogbWFya2V0cGxhY2Ugb3IgYSBzdGFuZGFsb25lIHBsdWdpbiBhbmQgd3JpdGVzIHRvIHRoZSBhcHByb3ByaWF0ZSBzZXR0aW5nOlxuXHQgKiAtIGEgbWFya2V0cGxhY2UgaXMgcmVnaXN0ZXJlZCB1bmRlciBgY2hhdC5wbHVnaW5zLm1hcmtldHBsYWNlc2AsXG5cdCAqIC0gYSBzdGFuZGFsb25lIHBsdWdpbiBwYXRoIGlzIHJlZ2lzdGVyZWQgdW5kZXIgYGNoYXQucGx1Z2luTG9jYXRpb25zYC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2RvSW5zdGFsbEZyb21Mb2NhbFNvdXJjZShyZWZlcmVuY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgY29uZmlnUGF0aDogc3RyaW5nLCBvcHRpb25zPzogSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlT3B0aW9ucyk6IFByb21pc2U8SUluc3RhbGxQbHVnaW5Gcm9tU291cmNlUmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVwb0RpciA9IHJlZmVyZW5jZS5sb2NhbFJlcG9zaXRvcnlVcmk7XG5cdFx0aWYgKCFyZXBvRGlyKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2ludmFsaWRTb3VyY2UnLCBcIid7MH0nIGlzIG5vdCBhIHZhbGlkIHBsdWdpbiBzb3VyY2UuIEVudGVyIGEgR2l0SHViIHJlcG9zaXRvcnkgKG93bmVyL3JlcG8pLCBhIGdpdCBjbG9uZSBVUkwsIG9yIGEgbG9jYWwgZm9sZGVyIHBhdGguXCIsIHJlZmVyZW5jZS5yYXdWYWx1ZSksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGxldCBpc0RpcmVjdG9yeSA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRpc0RpcmVjdG9yeSA9IChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHJlcG9EaXIpKS5pc0RpcmVjdG9yeTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIHJlc29sdmUgdGhyb3dzIHdoZW4gdGhlIHBhdGggZG9lc24ndCBleGlzdCBcdTIwMTQgaGFuZGxlZCBiZWxvdy5cblx0XHR9XG5cdFx0aWYgKCFpc0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdsb2NhbFNvdXJjZU5vdEZvdW5kJywgXCJUaGUgZm9sZGVyICd7MH0nIGRvZXMgbm90IGV4aXN0IG9yIGlzIG5vdCBhIGRpcmVjdG9yeS5cIiwgcmVwb0Rpci5mc1BhdGgpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBBIGRpcmVjdG9yeSB3aXRoIGEgbWFya2V0cGxhY2UgaW5kZXggaXMgcmVnaXN0ZXJlZCBhcyBhIG1hcmtldHBsYWNlLlxuXHRcdGNvbnN0IGRpc2NvdmVyZWRQbHVnaW5zID0gYXdhaXQgdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnJlYWRQbHVnaW5zRnJvbURpcmVjdG9yeShyZXBvRGlyLCByZWZlcmVuY2UpO1xuXHRcdGlmIChkaXNjb3ZlcmVkUGx1Z2lucy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBWZXJpZnkgdHJ1c3QgYmVmb3JlIHdyaXRpbmcgdG8gY29uZmlnLCBtaXJyb3JpbmcgdGhlIGdpdCBwYXRoXG5cdFx0XHQvLyAoX2RvSW5zdGFsbEZyb21Tb3VyY2UpOiBkZWNsaW5pbmcgdGhlIHByb21wdCBtdXN0IG5vdCBwZXJzaXN0IHRoZVxuXHRcdFx0Ly8gbWFya2V0cGxhY2UgdW5kZXIgYGNoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXNgLlxuXHRcdFx0Y29uc3QgdGVtcFBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luID0ge1xuXHRcdFx0XHRuYW1lOiByZWZlcmVuY2UuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRzb3VyY2U6ICcnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAnJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZmVyZW5jZSxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHRcdH07XG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2Vuc3VyZU1hcmtldHBsYWNlVHJ1c3RlZCh0ZW1wUGx1Z2luKSkge1xuXHRcdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxEaXNjb3ZlcmVkUGx1Z2lucyhyZWZlcmVuY2UsIGRpc2NvdmVyZWRQbHVnaW5zLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UsIGEgZGlyZWN0b3J5IHdpdGggYSBzaW5nbGUtcGx1Z2luIG1hbmlmZXN0IGlzIHJlZ2lzdGVyZWQgYXNcblx0XHQvLyBhIHN0YW5kYWxvbmUgcGx1Z2luIGxvY2F0aW9uLlxuXHRcdGlmIChhd2FpdCB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaXNQbHVnaW5EaXJlY3RvcnkocmVwb0RpcikpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2FkZFBsdWdpbkxvY2F0aW9uVG9Db25maWcoY29uZmlnUGF0aCk7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2xvY2FsTm9QbHVnaW5zJywgXCJObyBwbHVnaW4gb3IgbWFya2V0cGxhY2UgZm91bmQgaW4gJ3swfScuIFRoaXMgZm9sZGVyIGRvZXMgbm90IGNvbnRhaW4gYSBwbHVnaW4gb3IgbWFya2V0cGxhY2UgbWFuaWZlc3QuXCIsIHJlcG9EaXIuZnNQYXRoKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyB0aGUgbWFya2V0cGxhY2UgYW5kIGluc3RhbGxzIHRoZSBkaXNjb3ZlcmVkIHBsdWdpbihzKTogd2hlbiBhXG5cdCAqIHNwZWNpZmljIHBsdWdpbiBpcyB0YXJnZXRlZCBpdCBpbnN0YWxscyB0aGF0IG9uZSwgd2hlbiB0aGVyZSBpcyBleGFjdGx5XG5cdCAqIG9uZSBpdCBpbnN0YWxscyBpdCBkaXJlY3RseSwgYW5kIG90aGVyd2lzZSBwcm9tcHRzIHRoZSB1c2VyIHRvIGNob29zZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2luc3RhbGxEaXNjb3ZlcmVkUGx1Z2lucyhyZWZlcmVuY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgZGlzY292ZXJlZFBsdWdpbnM6IHJlYWRvbmx5IElNYXJrZXRwbGFjZVBsdWdpbltdLCBvcHRpb25zPzogSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlT3B0aW9ucyk6IFByb21pc2U8SUluc3RhbGxQbHVnaW5Gcm9tU291cmNlUmVzdWx0PiB7XG5cdFx0aWYgKG9wdGlvbnM/LnBsdWdpbikge1xuXHRcdFx0Y29uc3QgbWF0Y2hlZFBsdWdpbiA9IGRpc2NvdmVyZWRQbHVnaW5zLmZpbmQocCA9PiBwLm5hbWUgPT09IG9wdGlvbnMucGx1Z2luKTtcblx0XHRcdGlmICghbWF0Y2hlZFBsdWdpbikge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwbHVnaW5Ob3RGb3VuZCcsIFwiUGx1Z2luICd7MH0nIG5vdCBmb3VuZCBpbiAnezF9Jy5cIiwgb3B0aW9ucy5wbHVnaW4sIHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fYWRkTWFya2V0cGxhY2VUb0NvbmZpZyhyZWZlcmVuY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YWxsUGx1Z2luKG1hdGNoZWRQbHVnaW4pO1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWF0Y2hlZFBsdWdpbiB9O1xuXHRcdH1cblxuXHRcdGlmIChkaXNjb3ZlcmVkUGx1Z2lucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2FkZE1hcmtldHBsYWNlVG9Db25maWcocmVmZXJlbmNlKTtcblx0XHRcdGF3YWl0IHRoaXMuaW5zdGFsbFBsdWdpbihkaXNjb3ZlcmVkUGx1Z2luc1swXSk7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0Ly8gTXVsdGlwbGUgcGx1Z2lucyBcdTIwMTQgbGV0IHRoZSB1c2VyIGNob29zZS5cblx0XHRjb25zdCBwaWNrczogKElRdWlja1BpY2tJdGVtICYgeyBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiB9KVtdID0gZGlzY292ZXJlZFBsdWdpbnMubWFwKHAgPT4gKHtcblx0XHRcdGxhYmVsOiBwLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogcC5kZXNjcmlwdGlvbixcblx0XHRcdHBsdWdpbjogcCxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0UGx1Z2luJywgXCJTZWxlY3QgYSBwbHVnaW4gdG8gaW5zdGFsbCBmcm9tICd7MH0nXCIsIHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0Y2FuUGlja01hbnk6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFzZWxlY3RlZCkge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9hZGRNYXJrZXRwbGFjZVRvQ29uZmlnKHJlZmVyZW5jZSk7XG5cdFx0YXdhaXQgdGhpcy5pbnN0YWxsUGx1Z2luKHNlbGVjdGVkLnBsdWdpbik7XG5cblx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG5cdH1cblxuXHRwcml2YXRlIF9hZGRNYXJrZXRwbGFjZVRvQ29uZmlnKHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlKSB7XG5cdFx0Y29uc3QgeyB1c2VyVmFsdWVzLCBlZmZlY3RpdmVWYWx1ZXMgfSA9IHJlYWRDb25maWd1cmVkTWFya2V0cGxhY2VzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBleGlzdGluZ1JlZnMgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhlZmZlY3RpdmVWYWx1ZXMpO1xuXHRcdGlmIChleGlzdGluZ1JlZnMuc29tZShyID0+IHIuY2Fub25pY2FsSWQgPT09IHJlZmVyZW5jZS5jYW5vbmljYWxJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlcywgWy4uLnVzZXJWYWx1ZXMsIHJlZmVyZW5jZS5yYXdWYWx1ZV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkUGx1Z2luTG9jYXRpb25Ub0NvbmZpZyhwYXRoS2V5OiBzdHJpbmcpIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTG9jYXRpb25zKS51c2VyVmFsdWUgPz8ge307XG5cdFx0aWYgKGN1cnJlbnRbcGF0aEtleV0gPT09IHRydWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENoYXRDb25maWd1cmF0aW9uLlBsdWdpbkxvY2F0aW9ucywgeyAuLi5jdXJyZW50LCBbcGF0aEtleV06IHRydWUgfSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBgdHJ1ZWAgd2hlbiB0aGUgc291cmNlIHN0cmluZyBsb29rcyBsaWtlIGEgbG9jYWwgZm9sZGVyIHBhdGggXHUyMDE0XG5cdCAqIGEgYGZpbGU6Ly9gIFVSSSwgYW4gYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoLCBvciBhIGB+YC1wcmVmaXhlZCBwYXRoLlxuXHQgKiBUaGlzIGlzIGEgc3luY2hyb25vdXMgZm9ybWF0IGNoZWNrIG9ubHk7IGV4aXN0ZW5jZSBpcyB2ZXJpZmllZCBsYXRlci5cblx0ICovXG5cdHByaXZhdGUgX2lzTG9jYWxQYXRoU291cmNlKHNvdXJjZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IHNvdXJjZS50cmltKCk7XG5cdFx0aWYgKCF0cmltbWVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgvXmZpbGU6XFwvXFwvL2kudGVzdCh0cmltbWVkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0cmltbWVkID09PSAnficgfHwgdHJpbW1lZC5zdGFydHNXaXRoKCd+LycpIHx8IHRyaW1tZWQuc3RhcnRzV2l0aCgnflxcXFwnKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB3aW4zMi5pc0Fic29sdXRlKHRyaW1tZWQpIHx8IHBvc2l4LmlzQWJzb2x1dGUodHJpbW1lZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgYSBsb2NhbCBmb2xkZXIgc291cmNlIHN0cmluZyB0byBhIHtAbGluayBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuTG9jYWxGaWxlVXJpfVxuXHQgKiByZWZlcmVuY2UgcGx1cyB0aGUgcGF0aCB0byBwZXJzaXN0IGluIGBjaGF0LnBsdWdpbkxvY2F0aW9uc2AuIFRpbGRlIHBhdGhzXG5cdCAqIGFyZSBleHBhbmRlZCBhZ2FpbnN0IHRoZSB1c2VyIGhvbWUuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc3RyaW5nXG5cdCAqIGRvZXMgbm90IHJlc29sdmUgdG8gYW4gYWJzb2x1dGUgbG9jYWwgZm9sZGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUxvY2FsRGlyZWN0b3J5U291cmNlKHNvdXJjZTogc3RyaW5nKTogUHJvbWlzZTx7IHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlOyBjb25maWdQYXRoOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBzb3VyY2UudHJpbSgpO1xuXG5cdFx0Ly8gQWxyZWFkeSBhIGBmaWxlOi8vYCBVUkkgXHUyMDE0IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UgeWllbGRzIGEgTG9jYWxGaWxlVXJpIHJlZmVyZW5jZS5cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKHRyaW1tZWQpO1xuXHRcdGlmIChwYXJzZWQ/LmtpbmQgPT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkgJiYgcGFyc2VkLmxvY2FsUmVwb3NpdG9yeVVyaSkge1xuXHRcdFx0cmV0dXJuIHsgcmVmZXJlbmNlOiBwYXJzZWQsIGNvbmZpZ1BhdGg6IHBhcnNlZC5sb2NhbFJlcG9zaXRvcnlVcmkuZnNQYXRoIH07XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9pc0xvY2FsUGF0aFNvdXJjZSh0cmltbWVkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgcmVzb2x2ZWRQYXRoID0gdHJpbW1lZDtcblx0XHRpZiAocmVzb2x2ZWRQYXRoLnN0YXJ0c1dpdGgoJ34nKSkge1xuXHRcdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdFx0Y29uc3QgaG9tZSA9IHVzZXJIb21lLnNjaGVtZSA9PT0gJ2ZpbGUnID8gdXNlckhvbWUuZnNQYXRoIDogdXNlckhvbWUucGF0aDtcblx0XHRcdHJlc29sdmVkUGF0aCA9IHVudGlsZGlmeShyZXNvbHZlZFBhdGgsIGhvbWUpO1xuXHRcdH1cblxuXHRcdGlmICghd2luMzIuaXNBYnNvbHV0ZShyZXNvbHZlZFBhdGgpICYmICFwb3NpeC5pc0Fic29sdXRlKHJlc29sdmVkUGF0aCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZShVUkkuZmlsZShyZXNvbHZlZFBhdGgpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChyZWZlcmVuY2U/LmtpbmQgIT09IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUHJlc2VydmUgdGhlIHVzZXIncyBvcmlnaW5hbCBwYXRoIGZvcm0gKGUuZy4gYH4vcGx1Z2lucy9mb29gKSBzbyB0aGF0XG5cdFx0Ly8gdGhlIHBlcnNpc3RlZCBgY2hhdC5wbHVnaW5Mb2NhdGlvbnNgIGtleSBzdGF5cyBwb3J0YWJsZS5cblx0XHRyZXR1cm4geyByZWZlcmVuY2UsIGNvbmZpZ1BhdGg6IHRyaW1tZWQgfTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVBsdWdpbihwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgc2lsZW50PzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaXNTdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZSgpICYmICF0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaXNNYXJrZXRwbGFjZVRydXN0ZWQocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlKSkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3N0cmljdE1hcmtldHBsYWNlQmxvY2tlZFVwZGF0ZScsIFwiVXBkYXRlcyBmcm9tICd7MH0nIGFyZSBibG9ja2VkIGJ5IHlvdXIgb3JnYW5pemF0aW9uJ3MgcG9saWN5LlwiLCBwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuZGlzcGxheUxhYmVsKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtpbmQgPSBwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kO1xuXG5cdFx0aWYgKGtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuTnBtIHx8IGtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuUGlwKSB7XG5cdFx0XHQvLyBQYWNrYWdlLW1hbmFnZXIgXCJ1cGRhdGVcIiByZS1ydW5zIGluc3RhbGwgdmlhIHRlcm1pbmFsXG5cdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFsbFBhY2thZ2VQbHVnaW4ocGx1Z2luLCBzaWxlbnQpO1xuXHRcdH1cblxuXHRcdC8vIEZvciByZWxhdGl2ZS1wYXRoIGFuZCBnaXQgc291cmNlcywgZGVsZWdhdGUgdG8gcmVwb3NpdG9yeSBzZXJ2aWNlXG5cdFx0cmV0dXJuIHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLnVwZGF0ZVBsdWdpblNvdXJjZShwbHVnaW4sIHtcblx0XHRcdHBsdWdpbk5hbWU6IHBsdWdpbi5uYW1lLFxuXHRcdFx0ZmFpbHVyZUxhYmVsOiBwbHVnaW4ubmFtZSxcblx0XHRcdG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUFsbFBsdWdpbnMob3B0aW9uczogSVVwZGF0ZUFsbFBsdWdpbnNPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElVcGRhdGVBbGxQbHVnaW5zUmVzdWx0PiB7XG5cdFx0Y29uc3QgYWxsSW5zdGFsbGVkID0gdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYWxsSW5zdGFsbGVkLmZpbHRlcihlbnRyeSA9PlxuXHRcdFx0KCFvcHRpb25zLm1hcmtldHBsYWNlSWRzIHx8IG9wdGlvbnMubWFya2V0cGxhY2VJZHMuaGFzKGVudHJ5LnBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZCkpXG5cdFx0XHQmJiAoIW9wdGlvbnMuYXV0b21hdGljIHx8IHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pc01hcmtldHBsYWNlQXV0b1VwZGF0ZUVuYWJsZWQoZW50cnkucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlKSlcblx0XHQpO1xuXHRcdGlmIChpbnN0YWxsZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyB1cGRhdGVkTmFtZXM6IFtdLCBmYWlsZWROYW1lczogW10gfTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVkTmFtZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZmFpbGVkTmFtZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBkb1VwZGF0ZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdpdFRhc2tzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRcdGNvbnN0IHBhY2thZ2VQbHVnaW5zOiB7IGluc3RhbGxlZDogSU1hcmtldHBsYWNlUGx1Z2luOyBtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUGx1Z2luIH1bXSA9IFtdO1xuXG5cdFx0XHQvLyAxLiBQdWxsIGVhY2ggdW5pcXVlIG1hcmtldHBsYWNlIHJlcG9zaXRvcnkgZmlyc3QgKGhhbmRsZXMgYWxsXG5cdFx0XHQvLyAgICByZWxhdGl2ZS1wYXRoIHBsdWdpbnMgYW5kIGVuc3VyZXMgdGhlIG1hcmtldHBsYWNlIGluZGV4IG9uXG5cdFx0XHQvLyAgICBkaXNrIGlzIHVwLXRvLWRhdGUgYmVmb3JlIHdlIHJlLXJlYWQgaXQpLlxuXHRcdFx0Y29uc3Qgc2Vlbk1hcmtldHBsYWNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVmID0gZW50cnkucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlO1xuXHRcdFx0XHRpZiAoc2Vlbk1hcmtldHBsYWNlcy5oYXMocmVmLmNhbm9uaWNhbElkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW5NYXJrZXRwbGFjZXMuYWRkKHJlZi5jYW5vbmljYWxJZCk7XG5cdFx0XHRcdGlmICh0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaXNTdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZSgpICYmICF0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaXNNYXJrZXRwbGFjZVRydXN0ZWQocmVmKSkge1xuXHRcdFx0XHRcdGZhaWxlZE5hbWVzLnB1c2gocmVmLmRpc3BsYXlMYWJlbCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z2l0VGFza3MucHVzaCgoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFuZ2VkID0gYXdhaXQgdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UucHVsbFJlcG9zaXRvcnkocmVmLCB7XG5cdFx0XHRcdFx0XHRcdHBsdWdpbk5hbWU6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdFx0XHRcdGZhaWx1cmVMYWJlbDogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBlbnRyeS5wbHVnaW4ubWFya2V0cGxhY2VUeXBlLFxuXHRcdFx0XHRcdFx0XHRzaWxlbnQ6IG9wdGlvbnMuc2lsZW50LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHR1cGRhdGVkTmFtZXMucHVzaChyZWYuZGlzcGxheUxhYmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtQbHVnaW5JbnN0YWxsU2VydmljZV0gRmFpbGVkIHRvIHB1bGwgbWFya2V0cGxhY2UgJyR7cmVmLmRpc3BsYXlMYWJlbH0nOmAsIGVycik7XG5cdFx0XHRcdFx0XHRmYWlsZWROYW1lcy5wdXNoKHJlZi5kaXNwbGF5TGFiZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGdpdFRhc2tzKTtcblxuXHRcdFx0Ly8gMi4gUmUtZmV0Y2ggbWFya2V0cGxhY2UgZGF0YSAqYWZ0ZXIqIHB1bGxpbmcgc28gd2Ugc2VlIGFueVxuXHRcdFx0Ly8gICAgdXBkYXRlZCBwbHVnaW4gZGVzY3JpcHRvcnMgKG5ldyB2ZXJzaW9ucywgcmVmcywgZXRjLikuXG5cdFx0XHRjb25zdCBtYXJrZXRwbGFjZUlkcyA9IG5ldyBTZXQoaW5zdGFsbGVkLm1hcChlbnRyeSA9PiBlbnRyeS5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWQpKTtcblx0XHRcdGNvbnN0IG1hcmtldHBsYWNlUGx1Z2lucyA9IGF3YWl0IHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5mZXRjaE1hcmtldHBsYWNlUGx1Z2lucyh0b2tlbiwgbWFya2V0cGxhY2VJZHMpO1xuXHRcdFx0Y29uc3QgbWFya2V0cGxhY2VCeUtleSA9IG5ldyBNYXA8c3RyaW5nLCBJTWFya2V0cGxhY2VQbHVnaW4+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IG1wIG9mIG1hcmtldHBsYWNlUGx1Z2lucykge1xuXHRcdFx0XHRtYXJrZXRwbGFjZUJ5S2V5LnNldChgJHttcC5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZH06OiR7bXAubmFtZX1gLCBtcCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIDMuIFVwZGF0ZSBub24tcmVsYXRpdmUtcGF0aCBwbHVnaW5zIGluZGl2aWR1YWxseS5cblx0XHRcdGNvbnN0IGluZGVwZW5kZW50R2l0VGFza3M6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdFx0aWYgKGVudHJ5LnBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsaXZlUGx1Z2luID0gbWFya2V0cGxhY2VCeUtleS5nZXQoYCR7ZW50cnkucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkfTo6JHtlbnRyeS5wbHVnaW4ubmFtZX1gKTtcblx0XHRcdFx0aWYgKCFsaXZlUGx1Z2luIHx8ICFoYXNTb3VyY2VDaGFuZ2VkKGVudHJ5LnBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLCBsaXZlUGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkZXNjID0gbGl2ZVBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yO1xuXHRcdFx0XHRpZiAoZGVzYy5raW5kID09PSBQbHVnaW5Tb3VyY2VLaW5kLk5wbSB8fCBkZXNjLmtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuUGlwKSB7XG5cdFx0XHRcdFx0aWYgKCFvcHRpb25zLmZvcmNlICYmICFkZXNjLnZlcnNpb24pIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwYWNrYWdlUGx1Z2lucy5wdXNoKHsgaW5zdGFsbGVkOiBlbnRyeS5wbHVnaW4sIG1hcmtldHBsYWNlOiBsaXZlUGx1Z2luIH0pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aW5kZXBlbmRlbnRHaXRUYXNrcy5wdXNoKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNoYW5nZWQgPSBhd2FpdCB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS51cGRhdGVQbHVnaW5Tb3VyY2UobGl2ZVBsdWdpbiwge1xuXHRcdFx0XHRcdFx0XHRwbHVnaW5OYW1lOiBsaXZlUGx1Z2luLm5hbWUsXG5cdFx0XHRcdFx0XHRcdGZhaWx1cmVMYWJlbDogbGl2ZVBsdWdpbi5uYW1lLFxuXHRcdFx0XHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IGxpdmVQbHVnaW4ubWFya2V0cGxhY2VUeXBlLFxuXHRcdFx0XHRcdFx0XHRzaWxlbnQ6IG9wdGlvbnMuc2lsZW50LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHR1cGRhdGVkTmFtZXMucHVzaChsaXZlUGx1Z2luLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuYWRkSW5zdGFsbGVkUGx1Z2luKGVudHJ5LnBsdWdpblVyaSwgbGl2ZVBsdWdpbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbUGx1Z2luSW5zdGFsbFNlcnZpY2VdIEZhaWxlZCB0byB1cGRhdGUgcGx1Z2luICcke2xpdmVQbHVnaW4ubmFtZX0nOmAsIGVycik7XG5cdFx0XHRcdFx0XHRmYWlsZWROYW1lcy5wdXNoKGxpdmVQbHVnaW4ubmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5kZXBlbmRlbnRHaXRUYXNrcyk7XG5cblx0XHRcdGZvciAoY29uc3QgeyBpbnN0YWxsZWQ6IF9pbnN0YWxsZWQsIG1hcmtldHBsYWNlIH0gb2YgcGFja2FnZVBsdWdpbnMpIHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjaGFuZ2VkID0gYXdhaXQgdGhpcy51cGRhdGVQbHVnaW4obWFya2V0cGxhY2UsIG9wdGlvbnM/LnNpbGVudCk7XG5cdFx0XHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0XHRcdHVwZGF0ZWROYW1lcy5wdXNoKG1hcmtldHBsYWNlLm5hbWUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcGx1Z2luVXJpID0gdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZ2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaShtYXJrZXRwbGFjZS5zb3VyY2VEZXNjcmlwdG9yKTtcblx0XHRcdFx0XHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4ocGx1Z2luVXJpLCBtYXJrZXRwbGFjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbUGx1Z2luSW5zdGFsbFNlcnZpY2VdIEZhaWxlZCB0byB1cGRhdGUgcGx1Z2luICcke21hcmtldHBsYWNlLm5hbWV9JzpgLCBlcnIpO1xuXHRcdFx0XHRcdGZhaWxlZE5hbWVzLnB1c2gobWFya2V0cGxhY2UubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKG9wdGlvbnMuc2lsZW50KSB7XG5cdFx0XHRhd2FpdCBkb1VwZGF0ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndXBkYXRpbmdBbGxQbHVnaW5zJywgXCJVcGRhdGluZyBwbHVnaW5zLi4uXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkb1VwZGF0ZSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZhaWxlZE5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndXBkYXRlQWxsRmFpbGVkJywgXCJGYWlsZWQgdG8gdXBkYXRlOiB7MH1cIiwgZmFpbGVkTmFtZXMuam9pbignLCAnKSksXG5cdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBbbmV3IEFjdGlvbignc2hvd0dpdE91dHB1dCcsIGxvY2FsaXplKCdzaG93T3V0cHV0JywgXCJTaG93IE91dHB1dFwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZ2l0LnNob3dPdXRwdXQnKTtcblx0XHRcdFx0XHR9KV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKHVwZGF0ZWROYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoIW9wdGlvbnMuYXV0b21hdGljKSB7XG5cdFx0XHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5jbGVhclVwZGF0ZXNBdmFpbGFibGUob3B0aW9ucy5tYXJrZXRwbGFjZUlkcyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndXBkYXRlQWxsU3VjY2VzcycsIFwiVXBkYXRlZCBwbHVnaW5zOiB7MH1cIiwgdXBkYXRlZE5hbWVzLmpvaW4oJywgJykpLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGlmICghb3B0aW9ucy5hdXRvbWF0aWMpIHtcblx0XHRcdFx0dGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmNsZWFyVXBkYXRlc0F2YWlsYWJsZShvcHRpb25zLm1hcmtldHBsYWNlSWRzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB1cGRhdGVkTmFtZXMsIGZhaWxlZE5hbWVzIH07XG5cdH1cblxuXHRnZXRQbHVnaW5JbnN0YWxsVXJpKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXHR9XG5cblx0Ly8gLS0tIFRydXN0IGdhdGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZU1hcmtldHBsYWNlVHJ1c3RlZChwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaXNNYXJrZXRwbGFjZVRydXN0ZWQocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gVW5kZXIgdGhlIHN0cmljdC1tYXJrZXRwbGFjZSBlbnRlcnByaXNlIHBvbGljeSwgYSBtYXJrZXRwbGFjZSB0aGF0IGlzIG5vdFxuXHRcdC8vIG9uIHRoZSBhbGxvd2xpc3QgaXMgYmxvY2tlZCBvdXRyaWdodCBcdTIwMTQgdGhlIHVzZXIgY2Fubm90IGdyYW50IHRydXN0IHRvXG5cdFx0Ly8gYnlwYXNzIGl0LiBTdXJmYWNlIGEgbm9uLWFjdGlvbmFibGUgZW50ZXJwcmlzZS1wb2xpY3kgbm90aWZpY2F0aW9uIHRoYXRcblx0XHQvLyBwb2ludHMgYXQgdGhlIG1hbmFnZWQgc2V0dGluZyAoc2hvd24gYXMgXCJNYW5hZ2VkIGJ5IG9yZ2FuaXphdGlvblwiKS5cblx0XHRpZiAodGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmlzU3RyaWN0TWFya2V0cGxhY2VQb2xpY3lBY3RpdmUoKSkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3N0cmljdE1hcmtldHBsYWNlQmxvY2tlZEluc3RhbGwnLCBcIlBsdWdpbnMgZnJvbSAnezB9JyBhcmUgYmxvY2tlZCBieSB5b3VyIG9yZ2FuaXphdGlvbidzIHBvbGljeS5cIiwgcGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBbbmV3IEFjdGlvbignY2hhdC5wbHVnaW5zLnZpZXdNYXJrZXRwbGFjZVBvbGljeScsIGxvY2FsaXplKCd2aWV3UG9saWN5U2V0dGluZ3MnLCBcIlZpZXcgUG9saWN5IFNldHRpbmdzXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCBDaGF0Q29uZmlndXJhdGlvbi5TdHJpY3RNYXJrZXRwbGFjZXMpO1xuXHRcdFx0XHRcdH0pXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0cnVzdE1hcmtldHBsYWNlJywgXCJUcnVzdCBQbHVnaW5zIGZyb20gJ3swfSc/XCIsIHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgndHJ1c3RNYXJrZXRwbGFjZURldGFpbCcsIFwiUGx1Z2lucyBjYW4gcnVuIGNvZGUgb24geW91ciBtYWNoaW5lLiBPbmx5IGluc3RhbGwgcGx1Z2lucyBmcm9tIHNvdXJjZXMgeW91IHRydXN0LlxcblxcblNvdXJjZTogezB9XCIsIHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5yYXdWYWx1ZSksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3RydXN0QW5kSW5zdGFsbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRydXN0XCIpLFxuXHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdGljb246IENvZGljb24uc2hpZWxkLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnRydXN0TWFya2V0cGxhY2UocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLSBSZWxhdGl2ZS1wYXRoIHNvdXJjZSAoZXhpc3RpbmcgZ2l0LWJhc2VkIGZsb3cpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfaW5zdGFsbFJlbGF0aXZlUGF0aFBsdWdpbihwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwge1xuXHRcdFx0XHRwcm9ncmVzc1RpdGxlOiBsb2NhbGl6ZSgnaW5zdGFsbGluZ1BsdWdpbicsIFwiSW5zdGFsbGluZyBwbHVnaW4gJ3swfScuLi5cIiwgcGx1Z2luLm5hbWUpLFxuXHRcdFx0XHRmYWlsdXJlTGFiZWw6IHBsdWdpbi5uYW1lLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcGx1Z2luRGlyOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHBsdWdpbkRpciA9IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmdldFBsdWdpbkluc3RhbGxVcmkocGx1Z2luKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncGx1Z2luRGlySW52YWxpZCcsIFwiUGx1Z2luIHNvdXJjZSBkaXJlY3RvcnkgJ3swfScgaXMgaW52YWxpZCBmb3IgcmVwb3NpdG9yeSAnezF9Jy5cIiwgcGx1Z2luLnNvdXJjZSwgcGx1Z2luLm1hcmtldHBsYWNlKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBsdWdpbkV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhwbHVnaW5EaXIpO1xuXHRcdGlmICghcGx1Z2luRXhpc3RzKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3BsdWdpbkRpck5vdEZvdW5kJywgXCJQbHVnaW4gc291cmNlIGRpcmVjdG9yeSAnezB9JyBub3QgZm91bmQgaW4gcmVwb3NpdG9yeSAnezF9Jy5cIiwgcGx1Z2luLnNvdXJjZSwgcGx1Z2luLm1hcmtldHBsYWNlKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4ocGx1Z2luRGlyLCBwbHVnaW4pO1xuXHR9XG5cblx0Ly8gLS0tIEdpdEh1YiAvIEdpdCBVUkwgc291cmNlIChpbmRlcGVuZGVudCBjbG9uZSkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9pbnN0YWxsR2l0UGx1Z2luKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVwbyA9IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmdldFBsdWdpblNvdXJjZShwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kKTtcblx0XHRsZXQgcGx1Z2luRGlyOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHBsdWdpbkRpciA9IGF3YWl0IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmVuc3VyZVBsdWdpblNvdXJjZShwbHVnaW4sIHtcblx0XHRcdFx0cHJvZ3Jlc3NUaXRsZTogbG9jYWxpemUoJ2luc3RhbGxpbmdQbHVnaW4nLCBcIkluc3RhbGxpbmcgcGx1Z2luICd7MH0nLi4uXCIsIHBsdWdpbi5uYW1lKSxcblx0XHRcdFx0ZmFpbHVyZUxhYmVsOiBwbHVnaW4ubmFtZSxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBwbHVnaW4ubWFya2V0cGxhY2VUeXBlLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGx1Z2luRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHBsdWdpbkRpcik7XG5cdFx0aWYgKCFwbHVnaW5FeGlzdHMpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncGx1Z2luU291cmNlTm90Rm91bmQnLCBcIlBsdWdpbiBzb3VyY2UgJ3swfScgbm90IGZvdW5kIGFmdGVyIGNsb25pbmcuXCIsIHJlcG8uZ2V0TGFiZWwocGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4ocGx1Z2luRGlyLCBwbHVnaW4pO1xuXHR9XG5cblx0Ly8gLS0tIFBhY2thZ2UtbWFuYWdlciBzb3VyY2VzIChucG0gLyBwaXApIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9pbnN0YWxsUGFja2FnZVBsdWdpbihwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgc2lsZW50PzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlcG8gPSB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5nZXRQbHVnaW5Tb3VyY2UocGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCk7XG5cdFx0aWYgKCFyZXBvLnJ1bkluc3RhbGwpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtQbHVnaW5JbnN0YWxsU2VydmljZV0gRXhwZWN0ZWQgcGFja2FnZSByZXBvc2l0b3J5IGZvciBraW5kICcke3BsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmR9J2ApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB0aGUgcGFyZW50IGNhY2hlIGRpcmVjdG9yeSBleGlzdHMgKHJldHVybnMgbnBtLzxwa2c+IG9yIHBpcC88cGtnPilcblx0XHRjb25zdCBpbnN0YWxsRGlyID0gYXdhaXQgdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZW5zdXJlUGx1Z2luU291cmNlKHBsdWdpbik7XG5cdFx0Ly8gVGhlIGFjdHVhbCBwbHVnaW4gY29udGVudCBsb2NhdGlvbiAoZS5nLiBucG0vPHBrZz4vbm9kZV9tb2R1bGVzLzxwa2c+KVxuXHRcdGNvbnN0IHBsdWdpbkRpciA9IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmdldFBsdWdpblNvdXJjZUluc3RhbGxVcmkocGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVwby5ydW5JbnN0YWxsKGluc3RhbGxEaXIsIHBsdWdpbkRpciwgcGx1Z2luLCB7IHNpbGVudCB9KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4ocmVzdWx0LnBsdWdpbkRpciwgcGx1Z2luKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFFdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsT0FBTyxhQUFhO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsMEJBQTBDO0FBQ25ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMseUJBQXlCO0FBRWxDLFNB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
