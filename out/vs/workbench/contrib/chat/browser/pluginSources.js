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
import { timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../base/common/platform.js";
import { dirname, isEqualOrParent, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
import { PluginSourceKind } from "../common/plugins/pluginMarketplaceService.js";
import { IPluginGitService } from "../common/plugins/pluginGitService.js";
function sanitizeCacheSegment(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}
function gitRevisionCacheSuffix(ref, sha) {
  if (sha) {
    return [`sha_${sanitizeCacheSegment(sha)}`];
  }
  if (ref) {
    return [`ref_${sanitizeCacheSegment(ref)}`];
  }
  return [];
}
function shellEscapeArg(value) {
  if (isWindows) {
    return `"${value.replace(/[`$"]/g, "`$&")}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function formatShellCommand(args) {
  const [command, ...rest] = args;
  return [command, ...rest.map((arg) => shellEscapeArg(arg))].join(" ");
}
let AbstractGitPluginSource = class {
  constructor(_commandService, _fileService, _logService, _notificationService, _pluginGit, _progressService) {
    this._commandService = _commandService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._pluginGit = _pluginGit;
    this._progressService = _progressService;
  }
  getCleanupTarget(cacheRoot, descriptor) {
    return this._getRepoDir(cacheRoot, descriptor);
  }
  /**
   * Returns the on-disk directory of the cloned repository. Subclasses that
   * support a sub-path within a repository should override this to return the
   * repository root, while {@link getInstallUri} returns root + sub-path.
   */
  _getRepoDir(cacheRoot, descriptor) {
    return this.getInstallUri(cacheRoot, descriptor);
  }
  async ensure(cacheRoot, plugin, options) {
    const descriptor = plugin.sourceDescriptor;
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const repoExists = await this._fileService.exists(repoDir);
    const label = this._displayLabel(descriptor);
    if (repoExists) {
      await this._checkoutRevision(repoDir, descriptor, options?.failureLabel ?? label);
      return this.getInstallUri(cacheRoot, descriptor);
    }
    const progressTitle = options?.progressTitle ?? localize("cloningPluginSource", "Cloning plugin source '{0}'...", label);
    const failureLabel = options?.failureLabel ?? label;
    const ref = descriptor.ref;
    await this._cloneRepository(repoDir, this._cloneUrl(descriptor), progressTitle, failureLabel, ref);
    await this._checkoutRevision(repoDir, descriptor, failureLabel);
    return this.getInstallUri(cacheRoot, descriptor);
  }
  async update(cacheRoot, plugin, options) {
    const descriptor = plugin.sourceDescriptor;
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      this._logService.warn(`[${this.kind}] Cannot update plugin '${options?.pluginName ?? plugin.name}': source repository not cloned`);
      return false;
    }
    const updateLabel = options?.pluginName ?? plugin.name;
    const failureLabel = options?.failureLabel ?? updateLabel;
    try {
      const doUpdate = async (cts2) => {
        const git = descriptor;
        let changed;
        if (git.sha) {
          const headBefore = await this._pluginGit.revParse(repoDir, "HEAD").catch(() => void 0);
          await this._pluginGit.fetch(repoDir, cts2?.token);
          await this._checkoutRevision(repoDir, descriptor, failureLabel, cts2?.token);
          const headAfter = await this._pluginGit.revParse(repoDir, "HEAD").catch(() => void 0);
          changed = headBefore !== headAfter;
        } else {
          changed = await this._pluginGit.pull(repoDir, cts2?.token);
          await this._checkoutRevision(repoDir, descriptor, failureLabel, cts2?.token);
        }
        return changed;
      };
      if (options?.silent) {
        return await doUpdate();
      }
      const cts = new CancellationTokenSource();
      try {
        return await this._progressService.withProgress(
          {
            location: ProgressLocation.Notification,
            title: localize("updatingPluginSource", "Updating plugin '{0}'...", updateLabel),
            cancellable: true
          },
          () => doUpdate(cts),
          () => cts.dispose(true)
        );
      } finally {
        cts.dispose();
      }
    } catch (err) {
      this._logService.error(`[${this.kind}] Failed to update plugin source '${updateLabel}':`, err);
      if (!options?.silent) {
        this._notificationService.notify({
          severity: Severity.Error,
          message: localize("pullPluginSourceFailed", "Failed to update plugin '{0}': {1}", failureLabel, err?.message ?? String(err))
        });
      }
      throw err;
    }
  }
  // -- internal helpers ---
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
      this._logService.error(`[${this.kind}] Failed to clone ${cloneUrl}:`, err);
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("cloneFailed", "Failed to install plugin '{0}': {1}", failureLabel, err?.message ?? String(err))
      });
      throw err;
    } finally {
      cts.dispose();
    }
  }
  async _checkoutRevision(repoDir, descriptor, failureLabel, token) {
    const git = descriptor;
    if (!git.sha && !git.ref) {
      return;
    }
    try {
      if (git.sha) {
        await this._pluginGit.checkout(repoDir, git.sha, true, token);
        return;
      }
      await this._pluginGit.checkout(repoDir, git.ref, void 0, token);
    } catch (err) {
      this._logService.error(`[${this.kind}] Failed to checkout revision for '${failureLabel}':`, err);
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("checkoutPluginSourceFailed", "Failed to checkout plugin '{0}' to requested revision: {1}", failureLabel, err?.message ?? String(err))
      });
      throw err;
    }
  }
};
AbstractGitPluginSource = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IPluginGitService),
  __decorateParam(5, IProgressService)
], AbstractGitPluginSource);
class RelativePathPluginSource {
  constructor() {
    this.kind = PluginSourceKind.RelativePath;
  }
  getInstallUri(_cacheRoot, _descriptor) {
    throw new Error("Use getPluginInstallUri() for relative-path sources");
  }
  async ensure(_cacheRoot, _plugin, _options) {
    throw new Error("Use ensureRepository() for relative-path sources");
  }
  async update(_cacheRoot, _plugin, _options) {
    throw new Error("Use pullRepository() for relative-path sources");
  }
  getCleanupTarget(_cacheRoot, _descriptor) {
    return void 0;
  }
  getLabel(descriptor) {
    return descriptor.path || ".";
  }
}
class GitHubPluginSource extends AbstractGitPluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.GitHub;
  }
  /** Returns the URI where the plugin content lives (repo root + optional sub-path). */
  getInstallUri(cacheRoot, descriptor) {
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const gh = descriptor;
    if (gh.path) {
      const normalizedPath = gh.path.trim().replace(/^\.?\/+|\/+$/g, "");
      if (normalizedPath) {
        const target = joinPath(repoDir, normalizedPath);
        if (isEqualOrParent(target, repoDir)) {
          return target;
        }
      }
    }
    return repoDir;
  }
  /** Returns the cloned repository root (without sub-path). */
  _getRepoDir(cacheRoot, descriptor) {
    const gh = descriptor;
    const [owner, repo] = gh.repo.split("/");
    return joinPath(cacheRoot, "github.com", owner, repo, ...gitRevisionCacheSuffix(gh.ref, gh.sha));
  }
  getLabel(descriptor) {
    const gh = descriptor;
    return gh.path ? `${gh.repo}/${gh.path}` : gh.repo;
  }
  _cloneUrl(descriptor) {
    return `https://github.com/${descriptor.repo}.git`;
  }
  _displayLabel(descriptor) {
    return descriptor.repo;
  }
}
class GitUrlPluginSource extends AbstractGitPluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.GitUrl;
  }
  /** Returns the URI where the plugin content lives (repo root + optional sub-path). */
  getInstallUri(cacheRoot, descriptor) {
    const repoDir = this._getRepoDir(cacheRoot, descriptor);
    const git = descriptor;
    if (git.path) {
      const normalizedPath = git.path.trim().replace(/^\.?\/+|\/+$/g, "");
      if (normalizedPath) {
        const target = joinPath(repoDir, normalizedPath);
        if (isEqualOrParent(target, repoDir)) {
          return target;
        }
      }
    }
    return repoDir;
  }
  /** Returns the cloned repository root (without sub-path). */
  _getRepoDir(cacheRoot, descriptor) {
    const git = descriptor;
    const segments = this._gitUrlCacheSegments(git.url, git.ref, git.sha);
    return joinPath(cacheRoot, ...segments);
  }
  getLabel(descriptor) {
    const git = descriptor;
    return git.path ? `${git.url}/${git.path}` : git.url;
  }
  _cloneUrl(descriptor) {
    return descriptor.url;
  }
  _displayLabel(descriptor) {
    return descriptor.url;
  }
  _gitUrlCacheSegments(url, ref, sha) {
    try {
      const parsed = URI.parse(url);
      const authority = (parsed.authority || "unknown").replace(/[\\/:*?"<>|]/g, "_").toLowerCase();
      const pathPart = parsed.path.replace(/^\/+/, "").replace(/\.git$/i, "").replace(/\/+$/g, "");
      const segments = pathPart.split("/").map((s) => s.replace(/[\\/:*?"<>|]/g, "_"));
      return [authority, ...segments, ...gitRevisionCacheSuffix(ref, sha)];
    } catch {
      return ["git", url.replace(/[\\/:*?"<>|]/g, "_"), ...gitRevisionCacheSuffix(ref, sha)];
    }
  }
}
let AbstractPackagePluginSource = class {
  constructor(_dialogService, _fileService, _logService, _notificationService, _progressService, _terminalService) {
    this._dialogService = _dialogService;
    this._fileService = _fileService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._progressService = _progressService;
    this._terminalService = _terminalService;
  }
  getCleanupTarget(cacheRoot, descriptor) {
    return this._getCacheDir(cacheRoot, descriptor);
  }
  async ensure(cacheRoot, plugin, _options) {
    const cacheDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
    await this._fileService.createFolder(cacheDir);
    return cacheDir;
  }
  async update(cacheRoot, plugin, _options) {
    const installDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
    const pluginDir = this.getInstallUri(cacheRoot, plugin.sourceDescriptor);
    await this.runInstall(installDir, pluginDir, plugin, { silent: _options?.silent });
    return true;
  }
  async runInstall(installDir, pluginDir, plugin, options) {
    const args = this._buildInstallArgs(installDir, plugin);
    const command = formatShellCommand(args);
    const confirmed = await this._confirmTerminalCommand(plugin.name, command, options?.silent);
    if (!confirmed) {
      return void 0;
    }
    const progressTitle = localize("installingPackagePlugin", "Installing {0} plugin '{1}'...", this._managerName, plugin.name);
    const { success, terminal } = await this._runTerminalCommand(command, progressTitle);
    if (!success) {
      return void 0;
    }
    const exists = await this._fileService.exists(pluginDir);
    if (!exists) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("packagePluginNotFound", "{0} package '{1}' was not found after installation.", this._managerName, this.getLabel(plugin.sourceDescriptor))
      });
      return void 0;
    }
    terminal?.dispose();
    return { pluginDir };
  }
  // -- terminal helpers (moved from PluginInstallService) ---
  async _confirmTerminalCommand(pluginName, command, silent) {
    if (silent) {
      return new Promise((resolve) => {
        const n = this._notificationService.notify({
          severity: Severity.Info,
          message: localize("confirmPluginInstallNotification", "Plugin '{0}' wants to run: {1}", pluginName, command),
          actions: {
            primary: [
              new Action("installPlugin", localize("install", "Install"), void 0, true, async () => resolve(true))
            ]
          }
        });
        Event.once(n.onDidClose)(() => resolve(false));
      });
    }
    const { confirmed } = await this._dialogService.confirm({
      type: "question",
      message: localize("confirmPluginInstall", "Install Plugin '{0}'?", pluginName),
      detail: localize("confirmPluginInstallDetail", "This will run the following command in a terminal:\n\n{0}", command),
      primaryButton: localize({ key: "confirmInstall", comment: ["&& denotes a mnemonic"] }, "&&Install")
    });
    return confirmed;
  }
  async _runTerminalCommand(command, progressTitle) {
    let terminal;
    try {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: progressTitle,
          cancellable: false
        },
        async () => {
          terminal = await this._terminalService.createTerminal({
            config: {
              name: localize("pluginInstallTerminal", "Plugin Install"),
              forceShellIntegration: true,
              isTransient: true,
              isFeatureTerminal: true
            }
          });
          await terminal.processReady;
          this._terminalService.setActiveInstance(terminal);
          const commandResultPromise = this._waitForTerminalCommandCompletion(terminal);
          await terminal.runCommand(command, true);
          const exitCode = await commandResultPromise;
          if (exitCode !== 0) {
            throw new Error(localize("terminalCommandExitCode", "Command exited with code {0}", exitCode));
          }
        }
      );
      return { success: true, terminal };
    } catch (err) {
      this._logService.error(`[${this.kind}] Terminal command failed:`, err);
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("terminalCommandFailed", "Plugin installation command failed: {0}", err?.message ?? String(err))
      });
      return { success: false, terminal };
    }
  }
  _waitForTerminalCommandCompletion(terminal) {
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let isResolved = false;
      const resolveAndDispose = (exitCode) => {
        if (isResolved) {
          return;
        }
        isResolved = true;
        disposables.dispose();
        resolve(exitCode);
      };
      const attachCommandFinishedListener = () => {
        const commandDetection = terminal.capabilities.get(TerminalCapability.CommandDetection);
        if (!commandDetection) {
          return;
        }
        disposables.add(commandDetection.onCommandFinished((command) => {
          resolveAndDispose(command.exitCode ?? 0);
        }));
      };
      attachCommandFinishedListener();
      disposables.add(terminal.capabilities.onDidAddCommandDetectionCapability(() => attachCommandFinishedListener()));
      const timeoutHandle = timeout(12e4);
      disposables.add(toDisposable(() => timeoutHandle.cancel()));
      void timeoutHandle.then(() => {
        if (isResolved) {
          return;
        }
        this._logService.warn(`[${this.kind}] Terminal command completion timed out`);
        resolveAndDispose(void 0);
      });
    });
  }
};
AbstractPackagePluginSource = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, ITerminalService)
], AbstractPackagePluginSource);
class NpmPluginSource extends AbstractPackagePluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.Npm;
    this._managerName = "npm";
  }
  getInstallUri(cacheRoot, descriptor) {
    const npm = descriptor;
    return joinPath(cacheRoot, "npm", sanitizeCacheSegment(npm.package), "node_modules", npm.package);
  }
  getLabel(descriptor) {
    const npm = descriptor;
    return npm.version ? `${npm.package}@${npm.version}` : npm.package;
  }
  _getCacheDir(cacheRoot, descriptor) {
    const npm = descriptor;
    return joinPath(cacheRoot, "npm", sanitizeCacheSegment(npm.package));
  }
  _buildInstallArgs(installDir, plugin) {
    const npm = plugin.sourceDescriptor;
    const packageSpec = npm.version ? `${npm.package}@${npm.version}` : npm.package;
    const args = ["npm", "install", "--prefix", installDir.fsPath, packageSpec];
    if (npm.registry) {
      args.push("--registry", npm.registry);
    }
    return args;
  }
}
class PipPluginSource extends AbstractPackagePluginSource {
  constructor() {
    super(...arguments);
    this.kind = PluginSourceKind.Pip;
    this._managerName = "pip";
  }
  getInstallUri(cacheRoot, descriptor) {
    const pip = descriptor;
    return joinPath(cacheRoot, "pip", sanitizeCacheSegment(pip.package));
  }
  getLabel(descriptor) {
    const pip = descriptor;
    return pip.version ? `${pip.package}==${pip.version}` : pip.package;
  }
  _getCacheDir(cacheRoot, descriptor) {
    const pip = descriptor;
    return joinPath(cacheRoot, "pip", sanitizeCacheSegment(pip.package));
  }
  _buildInstallArgs(installDir, plugin) {
    const pip = plugin.sourceDescriptor;
    const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
    const args = ["pip", "install", "--target", installDir.fsPath, packageSpec];
    if (pip.registry) {
      args.push("--index-url", pip.registry);
    }
    return args;
  }
}
export {
  AbstractPackagePluginSource,
  GitHubPluginSource,
  GitUrlPluginSource,
  NpmPluginSource,
  PipPluginSource,
  RelativePathPluginSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wbHVnaW5Tb3VyY2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGlzRXF1YWxPclBhcmVudCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHksIHR5cGUgSVRlcm1pbmFsQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJRW5zdXJlUmVwb3NpdG9yeU9wdGlvbnMsIElQdWxsUmVwb3NpdG9yeU9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElHaXRIdWJQbHVnaW5Tb3VyY2UsIElHaXRVcmxQbHVnaW5Tb3VyY2UsIElNYXJrZXRwbGFjZVBsdWdpbiwgSU5wbVBsdWdpblNvdXJjZSwgSVBpcFBsdWdpblNvdXJjZSwgSVBsdWdpblNvdXJjZURlc2NyaXB0b3IsIFBsdWdpblNvdXJjZUtpbmQgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpblNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpblNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luR2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkdpdFNlcnZpY2UuanMnO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNoYXJlZCBoZWxwZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gc2FuaXRpemVDYWNoZVNlZ21lbnQobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG5hbWUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdL2csICdfJyk7XG59XG5cbmZ1bmN0aW9uIGdpdFJldmlzaW9uQ2FjaGVTdWZmaXgocmVmPzogc3RyaW5nLCBzaGE/OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGlmIChzaGEpIHtcblx0XHRyZXR1cm4gW2BzaGFfJHtzYW5pdGl6ZUNhY2hlU2VnbWVudChzaGEpfWBdO1xuXHR9XG5cdGlmIChyZWYpIHtcblx0XHRyZXR1cm4gW2ByZWZfJHtzYW5pdGl6ZUNhY2hlU2VnbWVudChyZWYpfWBdO1xuXHR9XG5cdHJldHVybiBbXTtcbn1cblxuZnVuY3Rpb24gc2hlbGxFc2NhcGVBcmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChpc1dpbmRvd3MpIHtcblx0XHRyZXR1cm4gYFwiJHt2YWx1ZS5yZXBsYWNlKC9bYCRcIl0vZywgJ2AkJicpfVwiYDtcblx0fVxuXHRyZXR1cm4gYCcke3ZhbHVlLnJlcGxhY2UoLycvZywgYCdcXFxcJydgKX0nYDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0U2hlbGxDb21tYW5kKGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0Y29uc3QgW2NvbW1hbmQsIC4uLnJlc3RdID0gYXJncztcblx0cmV0dXJuIFtjb21tYW5kLCAuLi5yZXN0Lm1hcChhcmcgPT4gc2hlbGxFc2NhcGVBcmcoYXJnKSldLmpvaW4oJyAnKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBCYXNlIGZvciBnaXQtYmFzZWQgc291cmNlcyAoR2l0SHViIHNob3J0aGFuZCAmIGFyYml0cmFyeSBHaXQgVVJMKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0R2l0UGx1Z2luU291cmNlIGltcGxlbWVudHMgSVBsdWdpblNvdXJjZSB7XG5cdGFic3RyYWN0IHJlYWRvbmx5IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUGx1Z2luR2l0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3BsdWdpbkdpdDogSVBsdWdpbkdpdFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YWJzdHJhY3QgZ2V0SW5zdGFsbFVyaShjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkk7XG5cdGFic3RyYWN0IGdldExhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2Nsb25lVXJsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2Rpc3BsYXlMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZztcblxuXHRnZXRDbGVhbnVwVGFyZ2V0KGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFJlcG9EaXIoY2FjaGVSb290LCBkZXNjcmlwdG9yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBvbi1kaXNrIGRpcmVjdG9yeSBvZiB0aGUgY2xvbmVkIHJlcG9zaXRvcnkuIFN1YmNsYXNzZXMgdGhhdFxuXHQgKiBzdXBwb3J0IGEgc3ViLXBhdGggd2l0aGluIGEgcmVwb3NpdG9yeSBzaG91bGQgb3ZlcnJpZGUgdGhpcyB0byByZXR1cm4gdGhlXG5cdCAqIHJlcG9zaXRvcnkgcm9vdCwgd2hpbGUge0BsaW5rIGdldEluc3RhbGxVcml9IHJldHVybnMgcm9vdCArIHN1Yi1wYXRoLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9nZXRSZXBvRGlyKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SW5zdGFsbFVyaShjYWNoZVJvb3QsIGRlc2NyaXB0b3IpO1xuXHR9XG5cblx0YXN5bmMgZW5zdXJlKGNhY2hlUm9vdDogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3B0aW9ucz86IElFbnN1cmVSZXBvc2l0b3J5T3B0aW9ucyk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yO1xuXHRcdGNvbnN0IHJlcG9EaXIgPSB0aGlzLl9nZXRSZXBvRGlyKGNhY2hlUm9vdCwgZGVzY3JpcHRvcik7XG5cdFx0Y29uc3QgcmVwb0V4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhyZXBvRGlyKTtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX2Rpc3BsYXlMYWJlbChkZXNjcmlwdG9yKTtcblxuXHRcdGlmIChyZXBvRXhpc3RzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGVja291dFJldmlzaW9uKHJlcG9EaXIsIGRlc2NyaXB0b3IsIG9wdGlvbnM/LmZhaWx1cmVMYWJlbCA/PyBsYWJlbCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRJbnN0YWxsVXJpKGNhY2hlUm9vdCwgZGVzY3JpcHRvcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NUaXRsZSA9IG9wdGlvbnM/LnByb2dyZXNzVGl0bGUgPz8gbG9jYWxpemUoJ2Nsb25pbmdQbHVnaW5Tb3VyY2UnLCBcIkNsb25pbmcgcGx1Z2luIHNvdXJjZSAnezB9Jy4uLlwiLCBsYWJlbCk7XG5cdFx0Y29uc3QgZmFpbHVyZUxhYmVsID0gb3B0aW9ucz8uZmFpbHVyZUxhYmVsID8/IGxhYmVsO1xuXHRcdGNvbnN0IHJlZiA9IChkZXNjcmlwdG9yIGFzIElHaXRIdWJQbHVnaW5Tb3VyY2UgfCBJR2l0VXJsUGx1Z2luU291cmNlKS5yZWY7XG5cblx0XHRhd2FpdCB0aGlzLl9jbG9uZVJlcG9zaXRvcnkocmVwb0RpciwgdGhpcy5fY2xvbmVVcmwoZGVzY3JpcHRvciksIHByb2dyZXNzVGl0bGUsIGZhaWx1cmVMYWJlbCwgcmVmKTtcblx0XHRhd2FpdCB0aGlzLl9jaGVja291dFJldmlzaW9uKHJlcG9EaXIsIGRlc2NyaXB0b3IsIGZhaWx1cmVMYWJlbCk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SW5zdGFsbFVyaShjYWNoZVJvb3QsIGRlc2NyaXB0b3IpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlKGNhY2hlUm9vdDogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gcGx1Z2luLnNvdXJjZURlc2NyaXB0b3I7XG5cdFx0Y29uc3QgcmVwb0RpciA9IHRoaXMuX2dldFJlcG9EaXIoY2FjaGVSb290LCBkZXNjcmlwdG9yKTtcblx0XHRjb25zdCByZXBvRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlcG9EaXIpO1xuXHRcdGlmICghcmVwb0V4aXN0cykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHt0aGlzLmtpbmR9XSBDYW5ub3QgdXBkYXRlIHBsdWdpbiAnJHtvcHRpb25zPy5wbHVnaW5OYW1lID8/IHBsdWdpbi5uYW1lfSc6IHNvdXJjZSByZXBvc2l0b3J5IG5vdCBjbG9uZWRgKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVMYWJlbCA9IG9wdGlvbnM/LnBsdWdpbk5hbWUgPz8gcGx1Z2luLm5hbWU7XG5cdFx0Y29uc3QgZmFpbHVyZUxhYmVsID0gb3B0aW9ucz8uZmFpbHVyZUxhYmVsID8/IHVwZGF0ZUxhYmVsO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRvVXBkYXRlID0gYXN5bmMgKGN0cz86IENhbmNlbGxhdGlvblRva2VuU291cmNlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGdpdCA9IGRlc2NyaXB0b3IgYXMgSUdpdEh1YlBsdWdpblNvdXJjZSB8IElHaXRVcmxQbHVnaW5Tb3VyY2U7XG5cdFx0XHRcdGxldCBjaGFuZ2VkOiBib29sZWFuO1xuXHRcdFx0XHRpZiAoZ2l0LnNoYSkge1xuXHRcdFx0XHRcdGNvbnN0IGhlYWRCZWZvcmUgPSBhd2FpdCB0aGlzLl9wbHVnaW5HaXQucmV2UGFyc2UocmVwb0RpciwgJ0hFQUQnKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3BsdWdpbkdpdC5mZXRjaChyZXBvRGlyLCBjdHM/LnRva2VuKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jaGVja291dFJldmlzaW9uKHJlcG9EaXIsIGRlc2NyaXB0b3IsIGZhaWx1cmVMYWJlbCwgY3RzPy50b2tlbik7XG5cdFx0XHRcdFx0Y29uc3QgaGVhZEFmdGVyID0gYXdhaXQgdGhpcy5fcGx1Z2luR2l0LnJldlBhcnNlKHJlcG9EaXIsICdIRUFEJykuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRjaGFuZ2VkID0gaGVhZEJlZm9yZSAhPT0gaGVhZEFmdGVyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoYW5nZWQgPSBhd2FpdCB0aGlzLl9wbHVnaW5HaXQucHVsbChyZXBvRGlyLCBjdHM/LnRva2VuKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jaGVja291dFJldmlzaW9uKHJlcG9EaXIsIGRlc2NyaXB0b3IsIGZhaWx1cmVMYWJlbCwgY3RzPy50b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNoYW5nZWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAob3B0aW9ucz8uc2lsZW50KSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBkb1VwZGF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndXBkYXRpbmdQbHVnaW5Tb3VyY2UnLCBcIlVwZGF0aW5nIHBsdWdpbiAnezB9Jy4uLlwiLCB1cGRhdGVMYWJlbCksXG5cdFx0XHRcdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCgpID0+IGRvVXBkYXRlKGN0cyksXG5cdFx0XHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSksXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7dGhpcy5raW5kfV0gRmFpbGVkIHRvIHVwZGF0ZSBwbHVnaW4gc291cmNlICcke3VwZGF0ZUxhYmVsfSc6YCwgZXJyKTtcblx0XHRcdGlmICghb3B0aW9ucz8uc2lsZW50KSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3B1bGxQbHVnaW5Tb3VyY2VGYWlsZWQnLCBcIkZhaWxlZCB0byB1cGRhdGUgcGx1Z2luICd7MH0nOiB7MX1cIiwgZmFpbHVyZUxhYmVsLCBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBpbnRlcm5hbCBoZWxwZXJzIC0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nsb25lUmVwb3NpdG9yeShyZXBvRGlyOiBVUkksIGNsb25lVXJsOiBzdHJpbmcsIHByb2dyZXNzVGl0bGU6IHN0cmluZywgZmFpbHVyZUxhYmVsOiBzdHJpbmcsIHJlZj86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdHRpdGxlOiBwcm9ncmVzc1RpdGxlLFxuXHRcdFx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGRpcm5hbWUocmVwb0RpcikpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3BsdWdpbkdpdC5jbG9uZVJlcG9zaXRvcnkoY2xvbmVVcmwsIHJlcG9EaXIsIHJlZiwgY3RzLnRva2VuKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSksXG5cdFx0XHQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7dGhpcy5raW5kfV0gRmFpbGVkIHRvIGNsb25lICR7Y2xvbmVVcmx9OmAsIGVycik7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Nsb25lRmFpbGVkJywgXCJGYWlsZWQgdG8gaW5zdGFsbCBwbHVnaW4gJ3swfSc6IHsxfVwiLCBmYWlsdXJlTGFiZWwsIGVycj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKSksXG5cdFx0XHR9KTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jaGVja291dFJldmlzaW9uKHJlcG9EaXI6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IsIGZhaWx1cmVMYWJlbDogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2l0ID0gZGVzY3JpcHRvciBhcyBJR2l0SHViUGx1Z2luU291cmNlIHwgSUdpdFVybFBsdWdpblNvdXJjZTtcblx0XHRpZiAoIWdpdC5zaGEgJiYgIWdpdC5yZWYpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKGdpdC5zaGEpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcGx1Z2luR2l0LmNoZWNrb3V0KHJlcG9EaXIsIGdpdC5zaGEsIHRydWUsIHRva2VuKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gZ2l0LnJlZiBpcyBndWFyYW50ZWVkIG5vbi1udWxsaXNoIGJ5IHRoZSBndWFyZCBhYm92ZVxuXHRcdFx0YXdhaXQgdGhpcy5fcGx1Z2luR2l0LmNoZWNrb3V0KHJlcG9EaXIsIGdpdC5yZWYhLCB1bmRlZmluZWQsIHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFske3RoaXMua2luZH1dIEZhaWxlZCB0byBjaGVja291dCByZXZpc2lvbiBmb3IgJyR7ZmFpbHVyZUxhYmVsfSc6YCwgZXJyKTtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2hlY2tvdXRQbHVnaW5Tb3VyY2VGYWlsZWQnLCBcIkZhaWxlZCB0byBjaGVja291dCBwbHVnaW4gJ3swfScgdG8gcmVxdWVzdGVkIHJldmlzaW9uOiB7MX1cIiwgZmFpbHVyZUxhYmVsLCBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpLFxuXHRcdFx0fSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUmVsYXRpdmVQYXRoIFx1MjAxNCBwbHVnaW4gbGl2ZXMgaW5zaWRlIGEgc2hhcmVkIG1hcmtldHBsYWNlIHJlcG9zaXRvcnlcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY2xhc3MgUmVsYXRpdmVQYXRoUGx1Z2luU291cmNlIGltcGxlbWVudHMgSVBsdWdpblNvdXJjZSB7XG5cdHJlYWRvbmx5IGtpbmQgPSBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aDtcblxuXHRnZXRJbnN0YWxsVXJpKF9jYWNoZVJvb3Q6IFVSSSwgX2Rlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZSBnZXRQbHVnaW5JbnN0YWxsVXJpKCkgZm9yIHJlbGF0aXZlLXBhdGggc291cmNlcycpO1xuXHR9XG5cblx0YXN5bmMgZW5zdXJlKF9jYWNoZVJvb3Q6IFVSSSwgX3BsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBfb3B0aW9ucz86IElFbnN1cmVSZXBvc2l0b3J5T3B0aW9ucyk6IFByb21pc2U8VVJJPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVc2UgZW5zdXJlUmVwb3NpdG9yeSgpIGZvciByZWxhdGl2ZS1wYXRoIHNvdXJjZXMnKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZShfY2FjaGVSb290OiBVUkksIF9wbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgX29wdGlvbnM/OiBJUHVsbFJlcG9zaXRvcnlPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVc2UgcHVsbFJlcG9zaXRvcnkoKSBmb3IgcmVsYXRpdmUtcGF0aCBzb3VyY2VzJyk7XG5cdH1cblxuXHRnZXRDbGVhbnVwVGFyZ2V0KF9jYWNoZVJvb3Q6IFVSSSwgX2Rlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0TGFiZWwoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiAoZGVzY3JpcHRvciBhcyB7IHBhdGg6IHN0cmluZyB9KS5wYXRoIHx8ICcuJztcblx0fVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEdpdEh1YiBcdTIwMTQgYHsgc291cmNlOiBcImdpdGh1YlwiLCByZXBvOiBcIm93bmVyL3JlcG9cIiB9YFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBHaXRIdWJQbHVnaW5Tb3VyY2UgZXh0ZW5kcyBBYnN0cmFjdEdpdFBsdWdpblNvdXJjZSB7XG5cdHJlYWRvbmx5IGtpbmQgPSBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YjtcblxuXHQvKiogUmV0dXJucyB0aGUgVVJJIHdoZXJlIHRoZSBwbHVnaW4gY29udGVudCBsaXZlcyAocmVwbyByb290ICsgb3B0aW9uYWwgc3ViLXBhdGgpLiAqL1xuXHRnZXRJbnN0YWxsVXJpKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0Y29uc3QgcmVwb0RpciA9IHRoaXMuX2dldFJlcG9EaXIoY2FjaGVSb290LCBkZXNjcmlwdG9yKTtcblx0XHRjb25zdCBnaCA9IGRlc2NyaXB0b3IgYXMgSUdpdEh1YlBsdWdpblNvdXJjZTtcblx0XHRpZiAoZ2gucGF0aCkge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZFBhdGggPSBnaC5wYXRoLnRyaW0oKS5yZXBsYWNlKC9eXFwuP1xcLyt8XFwvKyQvZywgJycpO1xuXHRcdFx0aWYgKG5vcm1hbGl6ZWRQYXRoKSB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKHJlcG9EaXIsIG5vcm1hbGl6ZWRQYXRoKTtcblx0XHRcdFx0aWYgKGlzRXF1YWxPclBhcmVudCh0YXJnZXQsIHJlcG9EaXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVwb0Rpcjtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIHRoZSBjbG9uZWQgcmVwb3NpdG9yeSByb290ICh3aXRob3V0IHN1Yi1wYXRoKS4gKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRSZXBvRGlyKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0Y29uc3QgZ2ggPSBkZXNjcmlwdG9yIGFzIElHaXRIdWJQbHVnaW5Tb3VyY2U7XG5cdFx0Y29uc3QgW293bmVyLCByZXBvXSA9IGdoLnJlcG8uc3BsaXQoJy8nKTtcblx0XHRyZXR1cm4gam9pblBhdGgoY2FjaGVSb290LCAnZ2l0aHViLmNvbScsIG93bmVyLCByZXBvLCAuLi5naXRSZXZpc2lvbkNhY2hlU3VmZml4KGdoLnJlZiwgZ2guc2hhKSk7XG5cdH1cblxuXHRnZXRMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgZ2ggPSBkZXNjcmlwdG9yIGFzIElHaXRIdWJQbHVnaW5Tb3VyY2U7XG5cdFx0cmV0dXJuIGdoLnBhdGggPyBgJHtnaC5yZXBvfS8ke2doLnBhdGh9YCA6IGdoLnJlcG87XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2Nsb25lVXJsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYGh0dHBzOi8vZ2l0aHViLmNvbS8keyhkZXNjcmlwdG9yIGFzIElHaXRIdWJQbHVnaW5Tb3VyY2UpLnJlcG99LmdpdGA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2Rpc3BsYXlMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIChkZXNjcmlwdG9yIGFzIElHaXRIdWJQbHVnaW5Tb3VyY2UpLnJlcG87XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBHaXRVcmwgXHUyMDE0IGB7IHNvdXJjZTogXCJ1cmxcIiwgdXJsOiBcImh0dHBzOi8vXHUyMDI2L3JlcG8uZ2l0XCIgfWBcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY2xhc3MgR2l0VXJsUGx1Z2luU291cmNlIGV4dGVuZHMgQWJzdHJhY3RHaXRQbHVnaW5Tb3VyY2Uge1xuXHRyZWFkb25seSBraW5kID0gUGx1Z2luU291cmNlS2luZC5HaXRVcmw7XG5cblx0LyoqIFJldHVybnMgdGhlIFVSSSB3aGVyZSB0aGUgcGx1Z2luIGNvbnRlbnQgbGl2ZXMgKHJlcG8gcm9vdCArIG9wdGlvbmFsIHN1Yi1wYXRoKS4gKi9cblx0Z2V0SW5zdGFsbFVyaShjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkkge1xuXHRcdGNvbnN0IHJlcG9EaXIgPSB0aGlzLl9nZXRSZXBvRGlyKGNhY2hlUm9vdCwgZGVzY3JpcHRvcik7XG5cdFx0Y29uc3QgZ2l0ID0gZGVzY3JpcHRvciBhcyBJR2l0VXJsUGx1Z2luU291cmNlO1xuXHRcdGlmIChnaXQucGF0aCkge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZFBhdGggPSBnaXQucGF0aC50cmltKCkucmVwbGFjZSgvXlxcLj9cXC8rfFxcLyskL2csICcnKTtcblx0XHRcdGlmIChub3JtYWxpemVkUGF0aCkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChyZXBvRGlyLCBub3JtYWxpemVkUGF0aCk7XG5cdFx0XHRcdGlmIChpc0VxdWFsT3JQYXJlbnQodGFyZ2V0LCByZXBvRGlyKSkge1xuXHRcdFx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlcG9EaXI7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgY2xvbmVkIHJlcG9zaXRvcnkgcm9vdCAod2l0aG91dCBzdWItcGF0aCkuICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0UmVwb0RpcihjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkkge1xuXHRcdGNvbnN0IGdpdCA9IGRlc2NyaXB0b3IgYXMgSUdpdFVybFBsdWdpblNvdXJjZTtcblx0XHRjb25zdCBzZWdtZW50cyA9IHRoaXMuX2dpdFVybENhY2hlU2VnbWVudHMoZ2l0LnVybCwgZ2l0LnJlZiwgZ2l0LnNoYSk7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGNhY2hlUm9vdCwgLi4uc2VnbWVudHMpO1xuXHR9XG5cblx0Z2V0TGFiZWwoZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGdpdCA9IGRlc2NyaXB0b3IgYXMgSUdpdFVybFBsdWdpblNvdXJjZTtcblx0XHRyZXR1cm4gZ2l0LnBhdGggPyBgJHtnaXQudXJsfS8ke2dpdC5wYXRofWAgOiBnaXQudXJsO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jbG9uZVVybChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIChkZXNjcmlwdG9yIGFzIElHaXRVcmxQbHVnaW5Tb3VyY2UpLnVybDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZGlzcGxheUxhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKGRlc2NyaXB0b3IgYXMgSUdpdFVybFBsdWdpblNvdXJjZSkudXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2l0VXJsQ2FjaGVTZWdtZW50cyh1cmw6IHN0cmluZywgcmVmPzogc3RyaW5nLCBzaGE/OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IFVSSS5wYXJzZSh1cmwpO1xuXHRcdFx0Y29uc3QgYXV0aG9yaXR5ID0gKHBhcnNlZC5hdXRob3JpdHkgfHwgJ3Vua25vd24nKS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgJ18nKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0Y29uc3QgcGF0aFBhcnQgPSBwYXJzZWQucGF0aC5yZXBsYWNlKC9eXFwvKy8sICcnKS5yZXBsYWNlKC9cXC5naXQkL2ksICcnKS5yZXBsYWNlKC9cXC8rJC9nLCAnJyk7XG5cdFx0XHRjb25zdCBzZWdtZW50cyA9IHBhdGhQYXJ0LnNwbGl0KCcvJykubWFwKHMgPT4gcy5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgJ18nKSk7XG5cdFx0XHRyZXR1cm4gW2F1dGhvcml0eSwgLi4uc2VnbWVudHMsIC4uLmdpdFJldmlzaW9uQ2FjaGVTdWZmaXgocmVmLCBzaGEpXTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbJ2dpdCcsIHVybC5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgJ18nKSwgLi4uZ2l0UmV2aXNpb25DYWNoZVN1ZmZpeChyZWYsIHNoYSldO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEJhc2UgZm9yIHBhY2thZ2UtbWFuYWdlci1iYXNlZCBzb3VyY2VzIChucG0sIHBpcClcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RQYWNrYWdlUGx1Z2luU291cmNlIGltcGxlbWVudHMgSVBsdWdpblNvdXJjZSB7XG5cdGFic3RyYWN0IHJlYWRvbmx5IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFic3RyYWN0IGdldEluc3RhbGxVcmkoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJO1xuXHRhYnN0cmFjdCBnZXRMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZztcblxuXHRnZXRDbGVhbnVwVGFyZ2V0KGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldENhY2hlRGlyKGNhY2hlUm9vdCwgZGVzY3JpcHRvcik7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBwYXJlbnQgZGlyZWN0b3J5IChwcmVmaXggLyB0YXJnZXQpIHdoZXJlIHRoZSBwYWNrYWdlXG5cdCAqIG1hbmFnZXIgaW5zdGFsbHMgaW50by4gVGhpcyBpcyBhYm92ZSB0aGUgYWN0dWFsIHBsdWdpbiBjb250ZW50IGRpci5cblx0ICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0Q2FjaGVEaXIoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJO1xuXG5cdC8qKiBCdWlsZCB0aGUgdGVybWluYWwgY29tbWFuZCBhcmdzIGZvciBpbnN0YWxsLiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2J1aWxkSW5zdGFsbEFyZ3MoaW5zdGFsbERpcjogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IHN0cmluZ1tdO1xuXG5cdC8qKiBIdW1hbi1yZWFkYWJsZSBwYWNrYWdlIG1hbmFnZXIgbmFtZSBmb3IgbWVzc2FnZXMuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXQgX21hbmFnZXJOYW1lKCk6IHN0cmluZztcblxuXHRhc3luYyBlbnN1cmUoY2FjaGVSb290OiBVUkksIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBfb3B0aW9ucz86IElFbnN1cmVSZXBvc2l0b3J5T3B0aW9ucyk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgY2FjaGVEaXIgPSB0aGlzLl9nZXRDYWNoZURpcihjYWNoZVJvb3QsIHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yKTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoY2FjaGVEaXIpO1xuXHRcdHJldHVybiBjYWNoZURpcjtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZShjYWNoZVJvb3Q6IFVSSSwgcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4sIF9vcHRpb25zPzogSVB1bGxSZXBvc2l0b3J5T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIEZvciBwYWNrYWdlLW1hbmFnZXIgc291cmNlcywgXCJ1cGRhdGVcIiByZS1ydW5zIGluc3RhbGwuXG5cdFx0Y29uc3QgaW5zdGFsbERpciA9IHRoaXMuX2dldENhY2hlRGlyKGNhY2hlUm9vdCwgcGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpO1xuXHRcdGNvbnN0IHBsdWdpbkRpciA9IHRoaXMuZ2V0SW5zdGFsbFVyaShjYWNoZVJvb3QsIHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yKTtcblx0XHRhd2FpdCB0aGlzLnJ1bkluc3RhbGwoaW5zdGFsbERpciwgcGx1Z2luRGlyLCBwbHVnaW4sIHsgc2lsZW50OiBfb3B0aW9ucz8uc2lsZW50IH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5zdGFsbChpbnN0YWxsRGlyOiBVUkksIHBsdWdpbkRpcjogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3B0aW9ucz86IHsgc2lsZW50PzogYm9vbGVhbiB9KTogUHJvbWlzZTx7IHBsdWdpbkRpcjogVVJJIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gdGhpcy5fYnVpbGRJbnN0YWxsQXJncyhpbnN0YWxsRGlyLCBwbHVnaW4pO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBmb3JtYXRTaGVsbENvbW1hbmQoYXJncyk7XG5cdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgdGhpcy5fY29uZmlybVRlcm1pbmFsQ29tbWFuZChwbHVnaW4ubmFtZSwgY29tbWFuZCwgb3B0aW9ucz8uc2lsZW50KTtcblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9ncmVzc1RpdGxlID0gbG9jYWxpemUoJ2luc3RhbGxpbmdQYWNrYWdlUGx1Z2luJywgXCJJbnN0YWxsaW5nIHswfSBwbHVnaW4gJ3sxfScuLi5cIiwgdGhpcy5fbWFuYWdlck5hbWUsIHBsdWdpbi5uYW1lKTtcblx0XHRjb25zdCB7IHN1Y2Nlc3MsIHRlcm1pbmFsIH0gPSBhd2FpdCB0aGlzLl9ydW5UZXJtaW5hbENvbW1hbmQoY29tbWFuZCwgcHJvZ3Jlc3NUaXRsZSk7XG5cdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhwbHVnaW5EaXIpO1xuXHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3BhY2thZ2VQbHVnaW5Ob3RGb3VuZCcsIFwiezB9IHBhY2thZ2UgJ3sxfScgd2FzIG5vdCBmb3VuZCBhZnRlciBpbnN0YWxsYXRpb24uXCIsIHRoaXMuX21hbmFnZXJOYW1lLCB0aGlzLmdldExhYmVsKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yKSksXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGVybWluYWw/LmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4geyBwbHVnaW5EaXIgfTtcblx0fVxuXG5cdC8vIC0tIHRlcm1pbmFsIGhlbHBlcnMgKG1vdmVkIGZyb20gUGx1Z2luSW5zdGFsbFNlcnZpY2UpIC0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbmZpcm1UZXJtaW5hbENvbW1hbmQocGx1Z2luTmFtZTogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcsIHNpbGVudD86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoc2lsZW50KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IG4gPSB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1QbHVnaW5JbnN0YWxsTm90aWZpY2F0aW9uJywgXCJQbHVnaW4gJ3swfScgd2FudHMgdG8gcnVuOiB7MX1cIiwgcGx1Z2luTmFtZSwgY29tbWFuZCksXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHRuZXcgQWN0aW9uKCdpbnN0YWxsUGx1Z2luJywgbG9jYWxpemUoJ2luc3RhbGwnLCBcIkluc3RhbGxcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4gcmVzb2x2ZSh0cnVlKSksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdEV2ZW50Lm9uY2Uobi5vbkRpZENsb3NlKSgoKSA9PiByZXNvbHZlKGZhbHNlKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybVBsdWdpbkluc3RhbGwnLCBcIkluc3RhbGwgUGx1Z2luICd7MH0nP1wiLCBwbHVnaW5OYW1lKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1QbHVnaW5JbnN0YWxsRGV0YWlsJywgXCJUaGlzIHdpbGwgcnVuIHRoZSBmb2xsb3dpbmcgY29tbWFuZCBpbiBhIHRlcm1pbmFsOlxcblxcbnswfVwiLCBjb21tYW5kKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAnY29uZmlybUluc3RhbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZJbnN0YWxsXCIpLFxuXHRcdH0pO1xuXHRcdHJldHVybiBjb25maXJtZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5UZXJtaW5hbENvbW1hbmQoY29tbWFuZDogc3RyaW5nLCBwcm9ncmVzc1RpdGxlOiBzdHJpbmcpIHtcblx0XHRsZXQgdGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdHRpdGxlOiBwcm9ncmVzc1RpdGxlLFxuXHRcdFx0XHRcdGNhbmNlbGxhYmxlOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRlcm1pbmFsID0gYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgncGx1Z2luSW5zdGFsbFRlcm1pbmFsJywgXCJQbHVnaW4gSW5zdGFsbFwiKSxcblx0XHRcdFx0XHRcdFx0Zm9yY2VTaGVsbEludGVncmF0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRpc1RyYW5zaWVudDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0aXNGZWF0dXJlVGVybWluYWw6IHRydWUsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGF3YWl0IHRlcm1pbmFsLnByb2Nlc3NSZWFkeTtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwpO1xuXG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZFJlc3VsdFByb21pc2UgPSB0aGlzLl93YWl0Rm9yVGVybWluYWxDb21tYW5kQ29tcGxldGlvbih0ZXJtaW5hbCk7XG5cdFx0XHRcdFx0YXdhaXQgdGVybWluYWwucnVuQ29tbWFuZChjb21tYW5kLCB0cnVlKTtcblx0XHRcdFx0XHRjb25zdCBleGl0Q29kZSA9IGF3YWl0IGNvbW1hbmRSZXN1bHRQcm9taXNlO1xuXHRcdFx0XHRcdGlmIChleGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd0ZXJtaW5hbENvbW1hbmRFeGl0Q29kZScsIFwiQ29tbWFuZCBleGl0ZWQgd2l0aCBjb2RlIHswfVwiLCBleGl0Q29kZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHRlcm1pbmFsIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbJHt0aGlzLmtpbmR9XSBUZXJtaW5hbCBjb21tYW5kIGZhaWxlZDpgLCBlcnIpO1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0ZXJtaW5hbENvbW1hbmRGYWlsZWQnLCBcIlBsdWdpbiBpbnN0YWxsYXRpb24gY29tbWFuZCBmYWlsZWQ6IHswfVwiLCBlcnI/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycikpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgdGVybWluYWwgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93YWl0Rm9yVGVybWluYWxDb21tYW5kQ29tcGxldGlvbih0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRsZXQgaXNSZXNvbHZlZCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCByZXNvbHZlQW5kRGlzcG9zZSA9IChleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCA9PiB7XG5cdFx0XHRcdGlmIChpc1Jlc29sdmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoZXhpdENvZGUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYXR0YWNoQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIgPSAoKTogdm9pZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB0ZXJtaW5hbC5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRcdFx0aWYgKCFjb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb21tYW5kRGV0ZWN0aW9uLm9uQ29tbWFuZEZpbmlzaGVkKChjb21tYW5kOiBJVGVybWluYWxDb21tYW5kKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZUFuZERpc3Bvc2UoY29tbWFuZC5leGl0Q29kZSA/PyAwKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fTtcblxuXHRcdFx0YXR0YWNoQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXJtaW5hbC5jYXBhYmlsaXRpZXMub25EaWRBZGRDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSgoKSA9PiBhdHRhY2hDb21tYW5kRmluaXNoZWRMaXN0ZW5lcigpKSk7XG5cblx0XHRcdGNvbnN0IHRpbWVvdXRIYW5kbGU6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+ID0gdGltZW91dCgxMjBfMDAwKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGltZW91dEhhbmRsZS5jYW5jZWwoKSkpO1xuXHRcdFx0dm9pZCB0aW1lb3V0SGFuZGxlLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNSZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMua2luZH1dIFRlcm1pbmFsIGNvbW1hbmQgY29tcGxldGlvbiB0aW1lZCBvdXRgKTtcblx0XHRcdFx0cmVzb2x2ZUFuZERpc3Bvc2UodW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gbnBtIFx1MjAxNCBgeyBzb3VyY2U6IFwibnBtXCIsIHBhY2thZ2U6IFwiQG9yZy9wbHVnaW5cIiB9YFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBOcG1QbHVnaW5Tb3VyY2UgZXh0ZW5kcyBBYnN0cmFjdFBhY2thZ2VQbHVnaW5Tb3VyY2Uge1xuXHRyZWFkb25seSBraW5kID0gUGx1Z2luU291cmNlS2luZC5OcG07XG5cdHByb3RlY3RlZCByZWFkb25seSBfbWFuYWdlck5hbWUgPSAnbnBtJztcblxuXHRnZXRJbnN0YWxsVXJpKGNhY2hlUm9vdDogVVJJLCBkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IFVSSSB7XG5cdFx0Y29uc3QgbnBtID0gZGVzY3JpcHRvciBhcyBJTnBtUGx1Z2luU291cmNlO1xuXHRcdHJldHVybiBqb2luUGF0aChjYWNoZVJvb3QsICducG0nLCBzYW5pdGl6ZUNhY2hlU2VnbWVudChucG0ucGFja2FnZSksICdub2RlX21vZHVsZXMnLCBucG0ucGFja2FnZSk7XG5cdH1cblxuXHRnZXRMYWJlbChkZXNjcmlwdG9yOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgbnBtID0gZGVzY3JpcHRvciBhcyBJTnBtUGx1Z2luU291cmNlO1xuXHRcdHJldHVybiBucG0udmVyc2lvbiA/IGAke25wbS5wYWNrYWdlfUAke25wbS52ZXJzaW9ufWAgOiBucG0ucGFja2FnZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Q2FjaGVEaXIoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHtcblx0XHRjb25zdCBucG0gPSBkZXNjcmlwdG9yIGFzIElOcG1QbHVnaW5Tb3VyY2U7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGNhY2hlUm9vdCwgJ25wbScsIHNhbml0aXplQ2FjaGVTZWdtZW50KG5wbS5wYWNrYWdlKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2J1aWxkSW5zdGFsbEFyZ3MoaW5zdGFsbERpcjogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBucG0gPSBwbHVnaW4uc291cmNlRGVzY3JpcHRvciBhcyBJTnBtUGx1Z2luU291cmNlO1xuXHRcdGNvbnN0IHBhY2thZ2VTcGVjID0gbnBtLnZlcnNpb24gPyBgJHtucG0ucGFja2FnZX1AJHtucG0udmVyc2lvbn1gIDogbnBtLnBhY2thZ2U7XG5cdFx0Y29uc3QgYXJncyA9IFsnbnBtJywgJ2luc3RhbGwnLCAnLS1wcmVmaXgnLCBpbnN0YWxsRGlyLmZzUGF0aCwgcGFja2FnZVNwZWNdO1xuXHRcdGlmIChucG0ucmVnaXN0cnkpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS1yZWdpc3RyeScsIG5wbS5yZWdpc3RyeSk7XG5cdFx0fVxuXHRcdHJldHVybiBhcmdzO1xuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gcGlwIFx1MjAxNCBgeyBzb3VyY2U6IFwicGlwXCIsIHBhY2thZ2U6IFwibXktcGx1Z2luXCIgfWBcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY2xhc3MgUGlwUGx1Z2luU291cmNlIGV4dGVuZHMgQWJzdHJhY3RQYWNrYWdlUGx1Z2luU291cmNlIHtcblx0cmVhZG9ubHkga2luZCA9IFBsdWdpblNvdXJjZUtpbmQuUGlwO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21hbmFnZXJOYW1lID0gJ3BpcCc7XG5cblx0Z2V0SW5zdGFsbFVyaShjYWNoZVJvb3Q6IFVSSSwgZGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IpOiBVUkkge1xuXHRcdGNvbnN0IHBpcCA9IGRlc2NyaXB0b3IgYXMgSVBpcFBsdWdpblNvdXJjZTtcblx0XHRyZXR1cm4gam9pblBhdGgoY2FjaGVSb290LCAncGlwJywgc2FuaXRpemVDYWNoZVNlZ21lbnQocGlwLnBhY2thZ2UpKTtcblx0fVxuXG5cdGdldExhYmVsKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0XHRjb25zdCBwaXAgPSBkZXNjcmlwdG9yIGFzIElQaXBQbHVnaW5Tb3VyY2U7XG5cdFx0cmV0dXJuIHBpcC52ZXJzaW9uID8gYCR7cGlwLnBhY2thZ2V9PT0ke3BpcC52ZXJzaW9ufWAgOiBwaXAucGFja2FnZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Q2FjaGVEaXIoY2FjaGVSb290OiBVUkksIGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKTogVVJJIHtcblx0XHRjb25zdCBwaXAgPSBkZXNjcmlwdG9yIGFzIElQaXBQbHVnaW5Tb3VyY2U7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGNhY2hlUm9vdCwgJ3BpcCcsIHNhbml0aXplQ2FjaGVTZWdtZW50KHBpcC5wYWNrYWdlKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2J1aWxkSW5zdGFsbEFyZ3MoaW5zdGFsbERpcjogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBwaXAgPSBwbHVnaW4uc291cmNlRGVzY3JpcHRvciBhcyBJUGlwUGx1Z2luU291cmNlO1xuXHRcdGNvbnN0IHBhY2thZ2VTcGVjID0gcGlwLnZlcnNpb24gPyBgJHtwaXAucGFja2FnZX09PSR7cGlwLnZlcnNpb259YCA6IHBpcC5wYWNrYWdlO1xuXHRcdGNvbnN0IGFyZ3MgPSBbJ3BpcCcsICdpbnN0YWxsJywgJy0tdGFyZ2V0JywgaW5zdGFsbERpci5mc1BhdGgsIHBhY2thZ2VTcGVjXTtcblx0XHRpZiAocGlwLnJlZ2lzdHJ5KSB7XG5cdFx0XHRhcmdzLnB1c2goJy0taW5kZXgtdXJsJywgcGlwLnJlZ2lzdHJ5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGFyZ3M7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjO0FBQ3ZCLFNBQTRCLGVBQWU7QUFDM0MsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLGlCQUFpQixnQkFBZ0I7QUFDbkQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUywwQkFBaUQ7QUFDMUQsU0FBNEIsd0JBQXdCO0FBRXBELFNBQW9JLHdCQUF3QjtBQUU1SixTQUFTLHlCQUF5QjtBQU1sQyxTQUFTLHFCQUFxQixNQUFzQjtBQUNuRCxTQUFPLEtBQUssUUFBUSxpQkFBaUIsR0FBRztBQUN6QztBQUVBLFNBQVMsdUJBQXVCLEtBQWMsS0FBd0I7QUFDckUsTUFBSSxLQUFLO0FBQ1IsV0FBTyxDQUFDLE9BQU8scUJBQXFCLEdBQUcsQ0FBQyxFQUFFO0FBQUEsRUFDM0M7QUFDQSxNQUFJLEtBQUs7QUFDUixXQUFPLENBQUMsT0FBTyxxQkFBcUIsR0FBRyxDQUFDLEVBQUU7QUFBQSxFQUMzQztBQUNBLFNBQU8sQ0FBQztBQUNUO0FBRUEsU0FBUyxlQUFlLE9BQXVCO0FBQzlDLE1BQUksV0FBVztBQUNkLFdBQU8sSUFBSSxNQUFNLFFBQVEsVUFBVSxL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
