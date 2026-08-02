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
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { match as globMatch } from "../../../base/common/glob.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { posix, win32 } from "../../../base/common/path.js";
import { OperatingSystem, OS } from "../../../base/common/platform.js";
import { arch } from "../../../base/common/process.js";
import { ExtUri } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { matchesDomainPattern, normalizeDomain } from "../../networkFilter/common/domainMatcher.js";
import { AgentNetworkDomainSettingId } from "../../networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from "./settings.js";
import { IWindowsMxcTerminalSandboxRuntime } from "./terminalSandboxMxcRuntime.js";
import { getTerminalSandboxReadAllowListForCommands } from "./terminalSandboxReadAllowList.js";
import { getTerminalSandboxRuntimeConfigurationForCommands } from "./terminalSandboxRuntimeConfigurationPerOperation.js";
import { TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from "./terminalSandboxService.js";
let TerminalSandboxEngine = class extends Disposable {
  constructor(_host, _fileService, _logService, _windowsMxcRuntime) {
    super();
    this._host = _host;
    this._fileService = _fileService;
    this._logService = _logService;
    this._windowsMxcRuntime = _windowsMxcRuntime;
    this._sandboxSettingsId = generateUuid();
    this._runtimeResolved = false;
    this._runAsNode = false;
    this._enableWeakerNestedSandbox = false;
    this._apparmorRemediationRequested = false;
    this._needsForceUpdateConfigFile = true;
    this._commandAllowListKeywords = [];
    this._commandAllowListCommandDetails = [];
    this._commandAllowNetwork = false;
    this._os = OS;
    this._defaultWritePaths = [];
    this._fileSystemPathExtUri = new ExtUri(() => this._os === OperatingSystem.Windows);
    this._buildSandboxPayload = (commandLine, policy, workingDirectory, containerName, containment) => {
      return this._host.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
    };
    this._pathJoin = (...segments) => {
      const path = this._os === OperatingSystem.Windows ? win32 : posix;
      return path.join(...segments);
    };
    this._register(Event.runAndSubscribe(this._host.onDidChangeSandboxSettings, () => {
      this.setNeedsForceUpdateConfigFile();
    }));
    this._register(this._host.onDidChangeRoots(() => this.setNeedsForceUpdateConfigFile()));
  }
  async isEnabled(precheckInputs) {
    return this._isSandboxConfiguredEnabled(precheckInputs);
  }
  async isSandboxAllowNetworkEnabled(precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return false;
    }
    return this._isSandboxAllowNetworkConfigured();
  }
  areUnsandboxedCommandsAllowed() {
    return this._areUnsandboxedCommandsAllowed();
  }
  areRetryWithAllowNetworkRequestsAllowed() {
    return this._areRetryWithAllowNetworkRequestsAllowed();
  }
  async getOS() {
    this._os = await this._host.getOS();
    return this._os;
  }
  getTempDir() {
    return this._tempDir;
  }
  setNeedsForceUpdateConfigFile() {
    this._needsForceUpdateConfigFile = true;
  }
  getResolvedNetworkDomains() {
    const allowedDomains = this._host.getSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains) ?? [];
    const deniedDomains = this._host.getSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains) ?? [];
    return { allowedDomains, deniedDomains };
  }
  async wrapCommand(command, requestUnsandboxedExecution, shell, cwd, commandDetails, requestAllowNetwork) {
    const allowUnsandboxedCommands = this._areUnsandboxedCommandsAllowed();
    const retryWithAllowNetworkRequests = this._areRetryWithAllowNetworkRequestsAllowed();
    const shouldInspectBlockedDomains = requestUnsandboxedExecution !== true && requestAllowNetwork !== true && (retryWithAllowNetworkRequests || allowUnsandboxedCommands);
    const blockedDomainResult = shouldInspectBlockedDomains ? this._getBlockedDomains(command) : { blockedDomains: [], deniedDomains: [] };
    const requiresPreflightAllowNetwork = retryWithAllowNetworkRequests && blockedDomainResult.blockedDomains.length > 0;
    const allowNetworkForCommand = requestUnsandboxedExecution !== true && (requestAllowNetwork === true && retryWithAllowNetworkRequests || requiresPreflightAllowNetwork);
    const normalizedCommandDetails = this._normalizeCommandDetails(commandDetails ?? []);
    const normalizedCommandKeywords = this._normalizeCommandKeywords(normalizedCommandDetails.map((c) => c.keyword));
    const currentReadAllowListPaths = getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails);
    const nextReadAllowListPaths = getTerminalSandboxReadAllowListForCommands(this._os, normalizedCommandKeywords, normalizedCommandDetails);
    const currentRuntimeConfiguration = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
    const nextRuntimeConfiguration = getTerminalSandboxRuntimeConfigurationForCommands(this._os, normalizedCommandDetails);
    const shouldRefreshConfig = this._commandAllowListKeywords.length === 0 || this._needsForceUpdateConfigFile || !this._areStringArraysEqual(this._commandAllowListKeywords, normalizedCommandKeywords) || !this._areStringArraysEqual(currentReadAllowListPaths, nextReadAllowListPaths) || !this._areObjectsEqual(currentRuntimeConfiguration, nextRuntimeConfiguration) || this._commandCwd?.toString() !== cwd?.toString() || this._commandAllowNetwork !== allowNetworkForCommand || this._os === OperatingSystem.Windows && (this._commandLine !== command || this._commandShell !== shell);
    if (shouldRefreshConfig) {
      this._commandAllowListKeywords = normalizedCommandKeywords;
      this._commandAllowListCommandDetails = normalizedCommandDetails;
      this._commandCwd = cwd;
      this._commandLine = command;
      this._commandShell = shell;
      this._commandAllowNetwork = allowNetworkForCommand;
      await this.getSandboxConfigPath(true);
    }
    if (!this._sandboxConfigPath || !this._tempDir) {
      throw new Error("Sandbox config path or temp dir not initialized");
    }
    if (!requestUnsandboxedExecution && !retryWithAllowNetworkRequests && allowUnsandboxedCommands && blockedDomainResult.blockedDomains.length > 0) {
      return {
        command: this._wrapUnsandboxedCommand(command, shell, cwd),
        isSandboxWrapped: false,
        blockedDomains: blockedDomainResult.blockedDomains,
        deniedDomains: blockedDomainResult.deniedDomains,
        requiresUnsandboxConfirmation: true
      };
    }
    if (requestUnsandboxedExecution && allowUnsandboxedCommands) {
      return {
        command: this._wrapUnsandboxedCommand(command, shell, cwd),
        isSandboxWrapped: false
      };
    }
    const allowNetworkConfirmationMetadata = requiresPreflightAllowNetwork ? {
      blockedDomains: blockedDomainResult.blockedDomains,
      deniedDomains: blockedDomainResult.deniedDomains
    } : void 0;
    if (this._os === OperatingSystem.Windows) {
      if (!this._mxcPath) {
        throw new Error("MXC executable path not resolved");
      }
      return {
        command: this._windowsMxcRuntime.wrapCommand(this._mxcPath, this._sandboxConfigPath),
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : void 0,
        ...allowNetworkConfirmationMetadata
      };
    }
    if (!this._execPath) {
      throw new Error("Executable path not set to run sandbox commands");
    }
    if (!this._srtPath) {
      throw new Error("Sandbox runtime path not resolved");
    }
    if (!this._rgPath) {
      throw new Error("Ripgrep path not resolved");
    }
    const commandToRunInSandbox = this._getSandboxCommandWithPreservedCwd(command, cwd);
    const sandboxRuntimeCommand = `PATH="$PATH:${this._pathDirname(this._rgPath)}" TMPDIR="${this._tempDir.path}" CLAUDE_TMPDIR="${this._tempDir.path}" "${this._execPath}" "${this._srtPath}" --settings "${this._sandboxConfigPath}" -c ${this._quoteShellArgument(commandToRunInSandbox)}`;
    if (this._runAsNode) {
      const nodeSandboxRuntimeCommand = `ELECTRON_RUN_AS_NODE=1 ${sandboxRuntimeCommand}`;
      return {
        command: this._wrapSandboxRuntimeCommandForLaunch(nodeSandboxRuntimeCommand, cwd),
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : void 0,
        ...allowNetworkConfirmationMetadata
      };
    }
    return {
      command: this._wrapSandboxRuntimeCommandForLaunch(sandboxRuntimeCommand, cwd),
      isSandboxWrapped: true,
      requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : void 0,
      ...allowNetworkConfirmationMetadata
    };
  }
  async checkForSandboxingPrereqs(forceRefresh = false, precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return {
        enabled: false,
        sandboxConfigPath: void 0,
        failedCheck: void 0
      };
    }
    const sandboxConfigPath = await this.getSandboxConfigPath(forceRefresh, precheckInputs);
    if (!sandboxConfigPath) {
      return {
        enabled: true,
        sandboxConfigPath,
        failedCheck: TerminalSandboxPrerequisiteCheck.Config
      };
    }
    if (!await this._checkSandboxDependencies(forceRefresh)) {
      const missingDependencies = await this.getMissingSandboxDependencies();
      if (missingDependencies.length === 0 && this._sandboxDependencyStatus?.bubblewrapUsable === false) {
        if (this._sandboxDependencyStatus.apparmorRestrictsUnprivilegedUserNamespaces !== true || forceRefresh && this._apparmorRemediationRequested) {
          if (!this._enableWeakerNestedSandbox) {
            this._enableWeakerNestedSandbox = true;
            await this.getSandboxConfigPath(true, precheckInputs);
          }
          return {
            enabled: true,
            sandboxConfigPath: this._sandboxConfigPath,
            failedCheck: void 0
          };
        }
        this._apparmorRemediationRequested = true;
        return {
          enabled: true,
          sandboxConfigPath,
          failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
          remediations: this._getBubblewrapRemediations(),
          detail: this._sandboxDependencyStatus.bubblewrapError
        };
      }
      return {
        enabled: true,
        sandboxConfigPath,
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies,
        canInstallMissingDependencies: !!this._sandboxDependencyStatus?.dependencyInstallCommand
      };
    }
    return {
      enabled: true,
      sandboxConfigPath,
      failedCheck: void 0
    };
  }
  async checkFileAccess(permission, paths, precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return { allowed: true, denied: [] };
    }
    await this._resolveRuntimeInfo();
    if (!this._tempDir) {
      await this._initTempDir();
    }
    const configFilePath = this._tempDir ? this._getUriPath(URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`)) : void 0;
    const accessPaths = await this._getFileSystemAccessPaths(configFilePath);
    const denied = [];
    for (const path of paths) {
      if (!path || !await this._hasFileSystemAccess(permission, path, accessPaths)) {
        denied.push(path);
      }
    }
    return { allowed: denied.length === 0, denied };
  }
  async getSandboxConfigPath(forceRefresh = false, precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return void 0;
    }
    await this._resolveRuntimeInfo();
    if (!this._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
      this._sandboxConfigPath = await this._createSandboxConfig();
      this._needsForceUpdateConfigFile = false;
    }
    return this._sandboxConfigPath;
  }
  async getMissingSandboxDependencies() {
    const os = await this.getOS();
    if (os === OperatingSystem.Windows) {
      return [];
    }
    if (!this._sandboxDependencyStatus) {
      this._sandboxDependencyStatus = await this._host.checkSandboxDependencies();
    }
    const missing = [];
    if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.bubblewrapInstalled) {
      missing.push("bubblewrap");
    }
    if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.socatInstalled) {
      missing.push("socat");
    }
    return missing;
  }
  /**
   * Deletes the sandbox temp directory if one was created. Hosts are expected
   * to invoke this from their shutdown / disposal path; the engine itself does
   * not delete the directory on `dispose()` because shutdown joiners need to
   * be coordinated externally.
   */
  async cleanupTempDir() {
    if (!this._tempDir) {
      return;
    }
    try {
      await this._fileService.del(this._tempDir, { recursive: true, useTrash: false });
    } catch (error) {
      this._logService.warn("TerminalSandboxEngine: Failed to delete sandbox temp dir", error);
    }
  }
  // ---- private helpers ----------------------------------------------------
  async _checkSandboxDependencies(forceRefresh = false) {
    const os = await this.getOS();
    if (os === OperatingSystem.Windows) {
      return true;
    }
    if (!forceRefresh && this._sandboxDependencyStatus) {
      return this._sandboxDependencyStatus.bubblewrapInstalled && this._sandboxDependencyStatus.bubblewrapUsable && this._sandboxDependencyStatus.socatInstalled;
    }
    const status = await this._host.checkSandboxDependencies();
    this._sandboxDependencyStatus = status;
    if (status && !status.bubblewrapInstalled) {
      this._logService.warn("TerminalSandboxEngine: bubblewrap (bwrap) is not installed");
    } else if (status && !status.bubblewrapUsable) {
      this._logService.warn("TerminalSandboxEngine: bubblewrap (bwrap) is installed but failed its capability check", status.bubblewrapError);
    }
    if (status && !status.socatInstalled) {
      this._logService.warn("TerminalSandboxEngine: socat is not installed");
    }
    return status ? status.bubblewrapInstalled && status.bubblewrapUsable && status.socatInstalled : true;
  }
  _getBubblewrapRemediations() {
    return [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction];
  }
  _quoteShellArgument(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
  _getSandboxCommandWithPreservedCwd(command, cwd) {
    if (this._os !== OperatingSystem.Linux || !cwd?.path || cwd.path === this._tempDir?.path) {
      return command;
    }
    return `cd ${this._quoteShellArgument(cwd.path)} && ${command}`;
  }
  _wrapSandboxRuntimeCommandForLaunch(sandboxRuntimeCommand, cwd) {
    const tempDirPath = this._tempDir?.path;
    return this._os === OperatingSystem.Linux && cwd?.path && tempDirPath && cwd.path !== tempDirPath ? `cd ${this._quoteShellArgument(tempDirPath)}; ${sandboxRuntimeCommand}` : sandboxRuntimeCommand;
  }
  _wrapUnsandboxedCommand(command, shell, cwd) {
    if (this._os === OperatingSystem.Windows) {
      return this._windowsMxcRuntime.wrapUnsandboxedCommand(command);
    }
    if (!this._tempDir?.path) {
      return command;
    }
    const commandWithPreservedCwd = this._getSandboxCommandWithPreservedCwd(command, cwd);
    if (!shell) {
      return `(TMPDIR="${this._tempDir.path}"; export TMPDIR; ${commandWithPreservedCwd})`;
    }
    return `env TMPDIR="${this._tempDir.path}" ${this._quoteShellArgument(shell)} -c ${this._quoteShellArgument(commandWithPreservedCwd)}`;
  }
  _getBlockedDomains(command) {
    if (this._isSandboxAllowNetworkConfigured()) {
      return { blockedDomains: [], deniedDomains: [] };
    }
    const domains = this._extractDomains(command);
    if (domains.length === 0) {
      return { blockedDomains: [], deniedDomains: [] };
    }
    const { allowedDomains, deniedDomains } = this.getResolvedNetworkDomains();
    const blockedDomains = /* @__PURE__ */ new Set();
    const explicitlyDeniedDomains = /* @__PURE__ */ new Set();
    for (const domain of domains) {
      if (deniedDomains.some((pattern) => matchesDomainPattern(domain, pattern))) {
        blockedDomains.add(domain);
        explicitlyDeniedDomains.add(domain);
        continue;
      }
      if (!allowedDomains.some((pattern) => matchesDomainPattern(domain, pattern))) {
        blockedDomains.add(domain);
      }
    }
    return {
      blockedDomains: [...blockedDomains],
      deniedDomains: [...explicitlyDeniedDomains]
    };
  }
  _extractDomains(command) {
    const domains = /* @__PURE__ */ new Set();
    let match;
    TerminalSandboxEngine._urlRegex.lastIndex = 0;
    while ((match = TerminalSandboxEngine._urlRegex.exec(command)) !== null) {
      const domain = this._extractDomainFromUrl(match[0]);
      if (domain) {
        domains.add(domain);
      }
    }
    TerminalSandboxEngine._sshRemoteRegex.lastIndex = 0;
    while ((match = TerminalSandboxEngine._sshRemoteRegex.exec(command)) !== null) {
      const domain = normalizeDomain(match[1], true);
      if (domain) {
        domains.add(domain);
      }
    }
    TerminalSandboxEngine._hostRegex.lastIndex = 0;
    while ((match = TerminalSandboxEngine._hostRegex.exec(command)) !== null) {
      const domain = normalizeDomain(match[1]);
      if (domain) {
        domains.add(domain);
      }
    }
    return [...domains];
  }
  _extractDomainFromUrl(value) {
    try {
      const authority = URI.parse(value).authority;
      return normalizeDomain(authority, true);
    } catch {
      return void 0;
    }
  }
  _normalizeCommandKeywords(commandKeywords) {
    return [...new Set(commandKeywords.map((keyword) => keyword.toLowerCase()))].sort();
  }
  _normalizeCommandDetails(commandDetails) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const command of commandDetails) {
      const normalizedCommand = { keyword: command.keyword.toLowerCase(), args: [...command.args] };
      const key = JSON.stringify(normalizedCommand);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(normalizedCommand);
      }
    }
    return result.sort((a, b) => a.keyword.localeCompare(b.keyword) || a.args.join("\0").localeCompare(b.args.join("\0")));
  }
  _areStringArraysEqual(a, b) {
    return a.length === b.length && a.every((keyword, index) => keyword === b[index]);
  }
  _areObjectsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  _isSandboxAllowedByPrecheckInputs(precheckInputs) {
    return precheckInputs?.isDefaultApprovalPermissionEnabled !== false;
  }
  async _isSandboxConfiguredEnabled(precheckInputs) {
    if (!this._isSandboxAllowedByPrecheckInputs(precheckInputs)) {
      return false;
    }
    await this.getOS();
    if (this._os === OperatingSystem.Windows) {
      const value2 = this._getSandboxConfiguredWindowsEnabledValue();
      return isAgentSandboxEnabledValue(value2);
    }
    const value = this._getSandboxConfiguredEnabledValue();
    return isAgentSandboxEnabledValue(value);
  }
  async _resolveRuntimeInfo() {
    if (this._runtimeResolved) {
      return;
    }
    this._runtimeResolved = true;
    const runtimeInfo = await this._host.getRuntimeInfo();
    this._appRoot = runtimeInfo.appRoot;
    this._execPath = runtimeInfo.execPath;
    this._runAsNode = runtimeInfo.runAsNode ?? false;
    this._userHome = await this._host.getUserHome();
    this._srtPath = this._pathJoin(this._appRoot, "node_modules", "@vscode", "sandbox-runtime", "dist", "cli.js");
    const nativeModulesDir = runtimeInfo.nativeModulesDir ?? "node_modules";
    const rgPlatform = this._os === OperatingSystem.Windows ? "win32" : this._os === OperatingSystem.Macintosh ? "darwin" : "linux";
    const rgBinary = this._os === OperatingSystem.Windows ? "rg.exe" : "rg";
    this._rgPath = this._pathJoin(this._appRoot, nativeModulesDir, "@vscode", "ripgrep-universal", "bin", `${rgPlatform}-${arch}`, rgBinary);
    this._mxcPath = this._windowsMxcRuntime.getExecutablePath(this._appRoot, nativeModulesDir, runtimeInfo.arch);
  }
  async _createSandboxConfig() {
    if (await this.isEnabled() && !this._tempDir) {
      await this._initTempDir();
    }
    if (!this._tempDir) {
      return void 0;
    }
    const allowNetwork = this._commandAllowNetwork || await this.isSandboxAllowNetworkEnabled();
    const linuxFileSystemSetting = this._os === OperatingSystem.Linux ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem) ?? {} : {};
    const macFileSystemSetting = this._os === OperatingSystem.Macintosh ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxMacFileSystem) ?? {} : {};
    const windowsFileSystemSetting = this._os === OperatingSystem.Windows ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem) ?? {} : {};
    const windowsSchemaVersion = this._os === OperatingSystem.Windows ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion) : void 0;
    const runtimeSetting = {
      ...this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime),
      ...this._enableWeakerNestedSandbox ? { enableWeakerNestedSandbox: true } : void 0
    };
    const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
    const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowRead");
    const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowWrite");
    const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
    const configFilePath = this._getUriPath(configFileUri);
    let allowWritePaths = [];
    let allowReadPaths = [];
    let denyReadPaths = [];
    let denyWritePaths;
    if (this._os === OperatingSystem.Windows) {
      const filesystemPolicy = await this._getWindowsMxcFilesystemPolicy();
      const env = await this._getWindowsMxcEnvironment();
      allowWritePaths = await this._resolveFileSystemPaths([
        ...await this._updateAllowWritePathsWithWorkspaceFolders(windowsFileSystemSetting.allowWrite),
        ...filesystemPolicy.readwritePaths
      ]);
      allowReadPaths = await this._resolveFileSystemPaths([...windowsFileSystemSetting.allowRead ?? [], ...filesystemPolicy.readonlyPaths]);
      denyReadPaths = await this._resolveFileSystemPaths(windowsFileSystemSetting.denyRead ?? []);
      this._windowsMxcEnvironment = env;
    } else if (this._os === OperatingSystem.Macintosh) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...macFileSystemSetting.denyRead ?? [], configFilePath]));
      denyWritePaths = macFileSystemSetting.denyWrite ? await this._resolveFileSystemPaths(macFileSystemSetting.denyWrite) : void 0;
    } else if (this._os === OperatingSystem.Linux) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...linuxFileSystemSetting.denyRead ?? [], configFilePath]));
      denyWritePaths = await this._resolveFileSystemPaths(linuxFileSystemSetting.denyWrite);
    }
    const sandboxSettings = this._os === OperatingSystem.Windows ? await this._windowsMxcRuntime.createConfig({
      command: this._commandLine ?? "",
      shell: this._commandShell,
      cwd: this._commandCwd ?? this._getDefaultWindowsMxcCwd(),
      tempDir: this._tempDir,
      schemaVersion: windowsSchemaVersion,
      allowNetwork,
      allowReadPaths,
      allowWritePaths,
      denyReadPaths,
      env: this._windowsMxcEnvironment ?? []
    }, this._buildSandboxPayload) : {
      network: allowNetwork ? { allowedDomains: [], deniedDomains: [], enabled: false } : this.getResolvedNetworkDomains(),
      filesystem: {
        denyRead: denyReadPaths,
        allowRead: allowReadPaths,
        allowWrite: allowWritePaths,
        denyWrite: denyWritePaths
      }
    };
    if (this._os !== OperatingSystem.Windows) {
      const sandboxRuntimeSettings = sandboxSettings;
      this._mergeAdditionalSandboxConfigProperties(sandboxRuntimeSettings, runtimeSetting);
      this._mergeAdditionalSandboxConfigProperties(sandboxRuntimeSettings, commandRuntimeSetting);
      if (this._os === OperatingSystem.Macintosh) {
        sandboxRuntimeSettings.allowPty ??= true;
      }
    }
    this._sandboxConfigPath = configFilePath;
    await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, "	")), { overwrite: true });
    return this._sandboxConfigPath;
  }
  async _getFileSystemAccessPaths(configFilePath) {
    const linuxFileSystemSetting = this._os === OperatingSystem.Linux ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem) ?? {} : {};
    const macFileSystemSetting = this._os === OperatingSystem.Macintosh ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxMacFileSystem) ?? {} : {};
    const windowsFileSystemSetting = this._os === OperatingSystem.Windows ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem) ?? {} : {};
    const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
    const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowRead");
    const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowWrite");
    let allowWritePaths = [];
    let allowReadPaths = [];
    let denyReadPaths = [];
    let denyWritePaths;
    if (this._os === OperatingSystem.Windows) {
      const filesystemPolicy = await this._getWindowsMxcFilesystemPolicy();
      allowWritePaths = await this._resolveFileSystemPaths([
        ...await this._updateAllowWritePathsWithWorkspaceFolders(windowsFileSystemSetting.allowWrite),
        ...filesystemPolicy.readwritePaths
      ]);
      allowReadPaths = await this._resolveFileSystemPaths([...windowsFileSystemSetting.allowRead ?? [], ...filesystemPolicy.readonlyPaths]);
      denyReadPaths = await this._resolveFileSystemPaths(windowsFileSystemSetting.denyRead ?? []);
    } else if (this._os === OperatingSystem.Macintosh) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...macFileSystemSetting.denyRead ?? [], ...configFilePath ? [configFilePath] : []]));
      denyWritePaths = macFileSystemSetting.denyWrite ? await this._resolveFileSystemPaths(macFileSystemSetting.denyWrite) : void 0;
    } else if (this._os === OperatingSystem.Linux) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...linuxFileSystemSetting.denyRead ?? [], ...configFilePath ? [configFilePath] : []]));
      denyWritePaths = await this._resolveFileSystemPaths(linuxFileSystemSetting.denyWrite);
    }
    return { allowReadPaths, allowWritePaths, denyReadPaths, denyWritePaths };
  }
  async _hasFileSystemAccess(permission, path, accessPaths) {
    const resolvedPaths = await this._resolveFileSystemPath(path);
    if (permission === "write") {
      if (this._os === OperatingSystem.Windows && this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyReadPaths)) {
        return false;
      }
      if (this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyWritePaths ?? [])) {
        return false;
      }
      return this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.allowWritePaths);
    }
    if (this._matchesAnyFileSystemPath(resolvedPaths, [...accessPaths.allowReadPaths, ...accessPaths.allowWritePaths])) {
      return true;
    }
    return !this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyReadPaths);
  }
  _matchesAnyFileSystemPath(paths, matchers) {
    return paths.some((path) => matchers.some((matcher) => this._matchesFileSystemPath(path, matcher)));
  }
  /**
   * Returns whether a candidate filesystem path is covered by a sandbox allow/deny
   * matcher. Both values are normalized with the target sandbox OS semantics before
   * comparison. Non-glob matchers are treated as exact-or-parent matches; glob
   * matchers are evaluated with VS Code's glob matcher.
   *
   * Examples:
   * - Linux/macOS: `/workspace/project/src/file.ts` matches `/workspace/project`.
   * - Linux/macOS: `/workspace/project2/file.ts` does not match `/workspace/project`.
   * - Windows: `C:\Repo\src\file.ts` matches `c:/repo` because matching is
   *   case-insensitive and backslashes are normalized to `/`.
   * - Glob: `/workspace/project/package.json` matches `/workspace/project/*.json`.
   */
  _matchesFileSystemPath(path, matcher) {
    const normalizedPath = this._normalizeFileSystemAccessPath(path);
    const normalizedMatcher = this._normalizeFileSystemAccessPath(matcher, true);
    const ignoreCase = this._os === OperatingSystem.Windows;
    if (this._containsGlobPattern(normalizedMatcher)) {
      return globMatch(normalizedMatcher, normalizedPath, { ignoreCase });
    }
    return this._fileSystemPathExtUri.isEqualOrParent(this._toFileSystemAccessUri(normalizedPath), this._toFileSystemAccessUri(normalizedMatcher));
  }
  /**
   * Converts a normalized sandbox filesystem path into a pseudo URI so the common
   * `ExtUri.isEqualOrParent` comparer can be used instead of deprecated string
   * path helpers. A non-`file` scheme is intentional: it keeps comparison on the
   * URI path component and avoids converting through the host OS' native `fsPath`
   * rules, which may differ from the sandbox target OS.
   *
   * Examples:
   * - `/workspace/project` becomes `terminal-sandbox-path:/workspace/project`.
   * - `C:/Repo` becomes `terminal-sandbox-path:/C:/Repo` so Windows drive paths
   *   are still valid URI paths for comparison.
   */
  _toFileSystemAccessUri(path) {
    return URI.from({ scheme: "terminal-sandbox-path", path: path.startsWith("/") ? path : `/${path}` });
  }
  /**
   * Normalizes a path or matcher into the form used for sandbox access checks.
   * On Windows, backslashes are converted to `/` and URI-shaped drive paths like
   * `/C:/Users/me` are converted to `C:/Users/me`. Unless `preserveGlob` is true
   * for a glob matcher, the path is POSIX-normalized to remove redundant `.`/`..`
   * segments. Trailing slashes are removed except for filesystem roots.
   *
   * Examples:
   * - Linux/macOS: `/workspace/../workspace/app/` becomes `/workspace/app`.
   * - Windows: `C:\Users\me\project\` becomes `C:/Users/me/project`.
   * - Windows: `/C:/Users/me/project` becomes `C:/Users/me/project`.
   * - Glob with `preserveGlob=true`: `/workspace/project/*.json` keeps the glob
   *   pattern intact for `globMatch`.
   */
  _normalizeFileSystemAccessPath(path, preserveGlob = false) {
    let normalizedPath = this._os === OperatingSystem.Windows ? path.replace(/\\/g, "/") : path;
    if (this._os === OperatingSystem.Windows && /^\/[a-zA-Z]:($|\/)/.test(normalizedPath)) {
      normalizedPath = normalizedPath.slice(1);
    }
    if (!preserveGlob || !this._containsGlobPattern(normalizedPath)) {
      normalizedPath = posix.normalize(normalizedPath);
    }
    if (normalizedPath.length > 1 && normalizedPath.endsWith("/") && !/^[a-zA-Z]:\/$/.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(/\/+$/, "");
    }
    return normalizedPath;
  }
  _containsGlobPattern(path) {
    return /[*?{\[]/.test(path);
  }
  _getCommandRuntimeFileSystemPaths(runtimeSetting, key) {
    const filesystem = runtimeSetting.filesystem;
    if (!this._isObjectForSandboxConfigMerge(filesystem)) {
      return [];
    }
    const paths = filesystem[key];
    if (!Array.isArray(paths)) {
      return [];
    }
    return paths.filter((path) => typeof path === "string");
  }
  _mergeAdditionalSandboxConfigProperties(target, additional) {
    for (const [key, value] of Object.entries(additional)) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = value;
        continue;
      }
      const existingValue = target[key];
      if (this._isObjectForSandboxConfigMerge(existingValue) && this._isObjectForSandboxConfigMerge(value)) {
        this._mergeAdditionalSandboxConfigProperties(existingValue, value);
      }
    }
  }
  _isObjectForSandboxConfigMerge(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  async _getWindowsMxcFilesystemPolicy() {
    if (!this._windowsMxcFilesystemPolicy) {
      this._windowsMxcFilesystemPolicy = await this._host.getWindowsMxcFilesystemPolicy() ?? { readonlyPaths: [], readwritePaths: [] };
    }
    return this._windowsMxcFilesystemPolicy;
  }
  async _getWindowsMxcEnvironment() {
    if (!this._windowsMxcEnvironment) {
      this._windowsMxcEnvironment = await this._host.getWindowsMxcEnvironment() ?? [];
    }
    return this._windowsMxcEnvironment;
  }
  _pathDirname(path) {
    return (this._os === OperatingSystem.Windows ? win32 : posix).dirname(path);
  }
  _getUriPath(uri) {
    return this._os === OperatingSystem.Windows ? this._windowsMxcRuntime.toWindowsPath(uri) : uri.path;
  }
  async _initTempDir() {
    if (!await this.isEnabled()) {
      return;
    }
    this._needsForceUpdateConfigFile = true;
    this._tempDir = await this._host.getSandboxTempDir();
    if (this._tempDir) {
      await this._fileService.createFolder(this._tempDir);
      this._defaultWritePaths.push(this._getUriPath(this._tempDir));
    } else {
      this._logService.warn("TerminalSandboxEngine: Cannot create sandbox settings file because no tmpDir is available in this environment");
    }
  }
  async _updateAllowWritePathsWithWorkspaceFolders(configuredAllowWrite, commandRuntimeAllowWrite = []) {
    const writeRootPaths = this._host.getWriteRoots().map((folder) => this._getUriPath(folder));
    return [.../* @__PURE__ */ new Set([...writeRootPaths, ...this._defaultWritePaths, ...await this._getWorkspaceStorageReadPaths(), ...configuredAllowWrite ?? [], ...commandRuntimeAllowWrite])];
  }
  _updateDenyReadPathsWithHome(configuredDenyRead) {
    if (this._os === OperatingSystem.Windows) {
      return [...new Set(configuredDenyRead ?? [])];
    }
    const userHome = this._userHome ? this._getUriPath(this._userHome) : void 0;
    return [.../* @__PURE__ */ new Set([...configuredDenyRead ?? [], ...userHome ? [userHome] : []])];
  }
  async _updateAllowReadPathsWithAllowWrite(configuredAllowRead, allowWrite, commandRuntimeAllowRead = []) {
    return [.../* @__PURE__ */ new Set([...configuredAllowRead ?? [], ...getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails), ...commandRuntimeAllowRead, ...this._getSandboxRuntimeReadPaths(), ...await this._getWorkspaceStorageReadPaths(), ...allowWrite])];
  }
  async _resolveFileSystemPaths(paths) {
    const resolvedPaths = await Promise.all((paths ?? []).map((path) => this._resolveFileSystemPath(path)));
    const seenPaths = /* @__PURE__ */ new Set();
    return resolvedPaths.flat().filter((path) => {
      const comparisonKey = this._getFileSystemPathComparisonKey(path);
      if (seenPaths.has(comparisonKey)) {
        return false;
      }
      seenPaths.add(comparisonKey);
      return true;
    });
  }
  _getFileSystemPathComparisonKey(path) {
    return this._os === OperatingSystem.Windows ? path.replace(/\//g, "\\").toLowerCase() : path;
  }
  async _resolveFileSystemPath(path) {
    const expandedPath = this._os === OperatingSystem.Linux ? this._expandHomePath(path) : path;
    if (!this._isAbsoluteFileSystemPath(expandedPath)) {
      return [expandedPath];
    }
    try {
      const realpath = await this._fileService.realpath(this._toFileSystemResource(expandedPath));
      const resolvedPath = realpath ? this._getUriPath(realpath) : void 0;
      return resolvedPath && resolvedPath !== expandedPath ? [expandedPath, resolvedPath] : [expandedPath];
    } catch {
      return [expandedPath];
    }
  }
  _isAbsoluteFileSystemPath(path) {
    return (this._os === OperatingSystem.Windows ? win32 : posix).isAbsolute(path);
  }
  _toFileSystemResource(path) {
    if (this._os === OperatingSystem.Windows) {
      return this._toWindowsFileSystemResource(path);
    }
    return this._userHome?.with({ path }) ?? this._tempDir?.with({ path }) ?? this._host.getWriteRoots()[0]?.with({ path }) ?? URI.file(path);
  }
  _toWindowsFileSystemResource(path) {
    const normalizedPath = path.replace(/\\/g, "/");
    if (/^\/\/[^/]/.test(normalizedPath)) {
      const firstPathSeparator = normalizedPath.indexOf("/", 2);
      if (firstPathSeparator === -1) {
        return URI.from({ scheme: "file", authority: normalizedPath.slice(2), path: "/" });
      }
      return URI.from({ scheme: "file", authority: normalizedPath.slice(2, firstPathSeparator), path: normalizedPath.slice(firstPathSeparator) || "/" });
    }
    if (/^[a-zA-Z]:($|\/)/.test(normalizedPath)) {
      return URI.from({ scheme: "file", path: `/${normalizedPath[0].toLowerCase()}${normalizedPath.slice(1)}` });
    }
    if (/^\/[a-zA-Z]:($|\/)/.test(normalizedPath)) {
      return URI.from({ scheme: "file", path: `/${normalizedPath[1].toLowerCase()}${normalizedPath.slice(2)}` });
    }
    return URI.from({ scheme: "file", path: normalizedPath });
  }
  _expandHomePath(path) {
    const userHome = this._userHome?.path;
    if (!userHome) {
      return path;
    }
    if (path === "~") {
      return userHome;
    }
    if (path.startsWith("~/")) {
      return this._pathJoin(userHome, path.slice(2));
    }
    return path;
  }
  _getSandboxRuntimeReadPaths() {
    if (!this._appRoot) {
      return [];
    }
    if (this._os === OperatingSystem.Windows) {
      return this._windowsMxcRuntime.getRuntimeReadPaths(this._appRoot, this._mxcPath);
    }
    const paths = [this._appRoot];
    if (this._execPath) {
      for (const path of [this._execPath, this._pathDirname(this._execPath)]) {
        if (!this._isPathUnderAppRoot(path)) {
          paths.push(path);
        }
      }
    }
    return paths;
  }
  _isPathUnderAppRoot(path) {
    if (!this._appRoot) {
      return false;
    }
    return path === this._appRoot || path.startsWith(`${this._appRoot}${this._os === OperatingSystem.Windows ? win32.sep : posix.sep}`);
  }
  async _getWorkspaceStorageReadPaths() {
    const root = await this._host.getWorkspaceStorageReadRoot();
    return root ? [this._getUriPath(root)] : [];
  }
  _getDefaultWindowsMxcCwd() {
    return this._host.getWriteRoots()[0];
  }
  _getSandboxConfiguredEnabledValue() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled) ?? AgentSandboxEnabledValue.Off;
  }
  _getSandboxConfiguredWindowsEnabledValue() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled) ?? AgentSandboxEnabledValue.Off;
  }
  _isSandboxAllowNetworkConfigured() {
    if (this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork) === true) {
      return true;
    }
    if (this._os === OperatingSystem.Windows) {
      return this._getSandboxConfiguredWindowsEnabledValue() === AgentSandboxEnabledValue.AllowNetwork;
    }
    return this._getSandboxConfiguredEnabledValue() === AgentSandboxEnabledValue.AllowNetwork;
  }
  _areUnsandboxedCommandsAllowed() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
  }
  _areRetryWithAllowNetworkRequestsAllowed() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
  }
};
TerminalSandboxEngine._urlRegex = /(?:https?|wss?):\/\/[^\s'"`|&;<>]+/gi;
TerminalSandboxEngine._sshRemoteRegex = /(?:^|[\s'"`])(?:[^\s@:'"`]+@)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::[^\s'"`|&;<>]+)(?=$|[\s'"`|&;<>])/gi;
TerminalSandboxEngine._hostRegex = /(?:^|[\s'"`(=])([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)?(?=(?:\/[^\s'"`|&;<>]*)?(?:$|[\s'"`)\]|,;|&<>]))/gi;
TerminalSandboxEngine = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWindowsMxcTerminalSandboxRuntime)
], TerminalSandboxEngine);
export {
  TerminalSandboxEngine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveEVuZ2luZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbWF0Y2ggYXMgZ2xvYk1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFyY2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IEV4dFVyaSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzRG9tYWluUGF0dGVybiwgbm9ybWFsaXplRG9tYWluIH0gZnJvbSAnLi4vLi4vbmV0d29ya0ZpbHRlci9jb21tb24vZG9tYWluTWF0Y2hlci5qcyc7XG5pbXBvcnQgeyBBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9uZXR3b3JrRmlsdGVyL2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJU2FuZGJveERlcGVuZGVuY3lTdGF0dXMsIHR5cGUgSVdpbmRvd3NNeGNDb25maWcsIElXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSwgdHlwZSBJV2luZG93c014Y1BvbGljeUNvbnRhaW5tZW50LCB0eXBlIElXaW5kb3dzTXhjU2FuZGJveFBvbGljeSB9IGZyb20gJy4vc2FuZGJveEhlbHBlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLCBBZ2VudFNhbmRib3hTZXR0aW5nSWQsIGlzQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlIH0gZnJvbSAnLi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUgfSBmcm9tICcuL3Rlcm1pbmFsU2FuZGJveE14Y1J1bnRpbWUuanMnO1xuaW1wb3J0IHsgZ2V0VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEZvckNvbW1hbmRzIH0gZnJvbSAnLi90ZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0LmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uRm9yQ29tbWFuZHMgfSBmcm9tICcuL3Rlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uUGVyT3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNhbmRib3hDb21tYW5kLCBJVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc0NoZWNrUmVzdWx0LCBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMsIElUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVja1Jlc3VsdCwgSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMsIElUZXJtaW5hbFNhbmRib3hXcmFwUmVzdWx0LCBUZXJtaW5hbFNhbmRib3hGaWxlQWNjZXNzUGVybWlzc2lvbiwgVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2ssIFRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24gfSBmcm9tICcuL3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nIHtcblx0ZGVueVJlYWQ/OiBzdHJpbmdbXTtcblx0YWxsb3dSZWFkPzogc3RyaW5nW107XG5cdGFsbG93V3JpdGU/OiBzdHJpbmdbXTtcblx0ZGVueVdyaXRlPzogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBJVGVybWluYWxTYW5kYm94RmlsZVN5c3RlbUFjY2Vzc1BhdGhzIHtcblx0YWxsb3dSZWFkUGF0aHM6IHN0cmluZ1tdO1xuXHRhbGxvd1dyaXRlUGF0aHM6IHN0cmluZ1tdO1xuXHRkZW55UmVhZFBhdGhzOiBzdHJpbmdbXTtcblx0ZGVueVdyaXRlUGF0aHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xufVxuXG4vKiogUnVudGltZSBpbmZvcm1hdGlvbiBuZWVkZWQgdG8gbGF1bmNoIHRoZSBzYW5kYm94LXJ1bnRpbWUgQ0xJLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxTYW5kYm94UnVudGltZUluZm8ge1xuXHQvKiogRGlyZWN0b3J5IHRoYXQgY29udGFpbnMgYG5vZGVfbW9kdWxlcy9AdnNjb2RlL3NhbmRib3gtcnVudGltZWAgYW5kIGBub2RlX21vZHVsZXMvQHZzY29kZS9yaXBncmVwYC4gKi9cblx0YXBwUm9vdDogc3RyaW5nO1xuXHQvKipcblx0ICogTmFtZSBvZiB0aGUgZGlyZWN0b3J5IChyZWxhdGl2ZSB0byB7QGxpbmsgYXBwUm9vdH0pIHRoYXQgaG9sZHMgdGhlIG5hdGl2ZVxuXHQgKiBiaW5hcmllcyBgcmlwZ3JlcC11bml2ZXJzYWxgIGFuZCBgQG1pY3Jvc29mdC9teGMtc2RrYC4gSW4gYSBwYWNrYWdlZCBkZXNrdG9wXG5cdCAqIGJ1aWxkIHRoZXNlIGFyZSB1bnBhY2tlZCBmcm9tIHRoZSBhcmNoaXZlIGludG8gYG5vZGVfbW9kdWxlcy5hc2FyLnVucGFja2VkYDtcblx0ICogaW4gZGV2IGFuZCBvbiByZW1vdGUgdGhleSBsaXZlIGluIHBsYWluIGBub2RlX21vZHVsZXNgLiBEZWZhdWx0cyB0b1xuXHQgKiBgbm9kZV9tb2R1bGVzYC4gTm90ZSB0aGUgc2FuZGJveC1ydW50aW1lIENMSSBpdHNlbGYgaXMgYWx3YXlzIHJlc29sdmVkIGZyb21cblx0ICogcGxhaW4gYG5vZGVfbW9kdWxlc2AgKGl0IGlzIGR1cGxpY2F0ZWQgb3V0IG9mIHRoZSBhcmNoaXZlKSBiZWNhdXNlIGl0IGlzXG5cdCAqIHNwYXduZWQgYXMgYSBzdGFuZGFsb25lIE5vZGUgc3VicHJvY2VzcyB3aXRob3V0IHRoZSBBU0FSIHJlc29sdXRpb24gaG9vay5cblx0ICovXG5cdG5hdGl2ZU1vZHVsZXNEaXI/OiBzdHJpbmc7XG5cdC8qKiBQYXRoIG9mIHRoZSBub2RlL2VsZWN0cm9uIGV4ZWN1dGFibGUgdXNlZCB0byBydW4gc2FuZGJveC1ydW50aW1lLiAqL1xuXHRleGVjUGF0aD86IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSB0aGUgZW5naW5lIHByZWZpeGVzIHRoZSB3cmFwcGVkIGNvbW1hbmQgd2l0aCBgRUxFQ1RST05fUlVOX0FTX05PREU9MWBcblx0ICogc28gdGhlIEVsZWN0cm9uIGJpbmFyeSBhY3RzIGFzIGEgTm9kZS5qcyBleGVjdXRhYmxlLiBTZXQgYnkgaG9zdHMgdGhhdCByZXNvbHZlXG5cdCAqIGFuIEVsZWN0cm9uLWJhc2VkIGV4ZWMgcGF0aCAodGhlIGxvY2FsIHdvcmtiZW5jaCk7IGxlYXZlIHVuZGVmaW5lZCAvIGZhbHNlIHdoZW5cblx0ICogYGV4ZWNQYXRoYCBhbHJlYWR5IHBvaW50cyBhdCBhIHJlYWwgYG5vZGVgIGJpbmFyeSAocmVtb3RlLCBhZ2VudCBob3N0KS5cblx0ICovXG5cdHJ1bkFzTm9kZT86IGJvb2xlYW47XG5cdC8qKiBDUFUgYXJjaGl0ZWN0dXJlIG9mIHRoZSBlbnZpcm9ubWVudCB0aGF0IHJ1bnMgdGhlIHNhbmRib3ggcnVudGltZS4gKi9cblx0YXJjaD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBIb3N0IGFkYXB0ZXIgdGhhdCBzdXBwbGllcyB0aGUgZW5naW5lIHdpdGggZW52aXJvbm1lbnQvd29ya3NwYWNlIGRhdGEgdGhlXG4gKiBwbGF0Zm9ybSBsYXllciBjYW5ub3QgcmVzb2x2ZSBvbiBpdHMgb3duLiBIb3N0cyAod29ya2JlbmNoLCBhZ2VudCBob3N0KVxuICogaW1wbGVtZW50IHRoaXMgdG8gYnJpZGdlIHRoZWlyIHBlci1lbnZpcm9ubWVudCBzZXJ2aWNlcyAoYElSZW1vdGVBZ2VudFNlcnZpY2VgLFxuICogYElXb3Jrc3BhY2VDb250ZXh0U2VydmljZWAsIGBJRW52aXJvbm1lbnRTZXJ2aWNlYCwgYElQcm9kdWN0U2VydmljZWAsXG4gKiBgSVNhbmRib3hIZWxwZXJTZXJ2aWNlYCwgXHUyMDI2KSBpbnRvIHRoZSBlbmdpbmUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsU2FuZGJveEVuZ2luZUhvc3Qge1xuXHQvKiogRWZmZWN0aXZlIE9TIHVzZWQgYnkgc2FuZGJveCBkZWNpc2lvbnMuIE1heSBiZSB0aGUgcmVtb3RlIE9TIGluIHdvcmtiZW5jaC4gKi9cblx0Z2V0T1MoKTogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+O1xuXHQvKiogUmVzb2x2ZXMgYXBwIHJvb3QgKyBub2RlL2VsZWN0cm9uIGV4ZWMgcGF0aCAoYWZ0ZXIgdGhlIHJlbW90ZSBlbnYgaXMga25vd24sIGlmIGFwcGxpY2FibGUpLiAqL1xuXHRnZXRSdW50aW1lSW5mbygpOiBQcm9taXNlPElUZXJtaW5hbFNhbmRib3hSdW50aW1lSW5mbz47XG5cdC8qKiBSZXNvbHZlcyB0aGUgdXNlciBob21lIHVzZWQgZm9yIGB+YC1leHBhbnNpb24gYW5kIHRoZSBkZWZhdWx0IGRlbnktcmVhZCBlbnRyeS4gKi9cblx0Z2V0VXNlckhvbWUoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGRpcmVjdG9yeSB0aGUgZW5naW5lIGNyZWF0ZXMgYW5kIHVzZXMgYXMgaXRzIHNhbmRib3ggdGVtcCBkaXJcblx0ICogKHNhbmRib3gtc2V0dGluZ3MgSlNPTiBmaWxlIGxpdmVzIGhlcmUpLiBNYXkgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIG5vXG5cdCAqIHN1aXRhYmxlIGxvY2F0aW9uIGV4aXN0cywgaW4gd2hpY2ggY2FzZSBzYW5kYm94aW5nIGlzIGRpc2FibGVkLlxuXHQgKi9cblx0Z2V0U2FuZGJveFRlbXBEaXIoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHQvKiogUGF0aCBhZGRlZCB0byBgYWxsb3dSZWFkYCBhbmQgYGFsbG93V3JpdGVgIGZvciB0aGUgZW5naW5lJ3Mgd29ya3NwYWNlL3Nlc3Npb24gc3RvcmFnZSBhcmVhLiAqL1xuXHRnZXRXb3Jrc3BhY2VTdG9yYWdlUmVhZFJvb3QoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHQvKiogUm9vdHMgdGhhdCBtdXN0IGJlIHdyaXRhYmxlIGluc2lkZSB0aGUgc2FuZGJveCAod29ya3NwYWNlIGZvbGRlcnMgLyBzZXNzaW9uIGN3ZHMpLiAqL1xuXHRnZXRXcml0ZVJvb3RzKCk6IHJlYWRvbmx5IFVSSVtdO1xuXHQvKiogRmlyZXMgd2hlbiB7QGxpbmsgZ2V0V3JpdGVSb290c30gb3Ige0BsaW5rIGdldFdvcmtzcGFjZVN0b3JhZ2VSZWFkUm9vdH0gY2hhbmdlLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJvb3RzOiBFdmVudDx2b2lkPjtcblx0LyoqIFJlc29sdmVzIHRoZSBpbnN0YWxsZWQgc2FuZGJveC1kZXBlbmRlbmN5IHN0YXR1cyAoYnViYmxld3JhcCwgc29jYXQpLiAqL1xuXHRjaGVja1NhbmRib3hEZXBlbmRlbmNpZXMoKTogUHJvbWlzZTxJU2FuZGJveERlcGVuZGVuY3lTdGF0dXMgfCB1bmRlZmluZWQ+O1xuXHQvKiogUmVzb2x2ZXMgaG9zdCBmaWxlc3lzdGVtIHBvbGljeSBmcmFnbWVudHMgbmVlZGVkIGJ5IHRoZSBXaW5kb3dzIE1YQyBwcm9jZXNzIGNvbnRhaW5lci4gKi9cblx0Z2V0V2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3koKTogUHJvbWlzZTxJV2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3kgfCB1bmRlZmluZWQ+O1xuXHQvKiogUmVzb2x2ZXMgaG9zdCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgbmVlZGVkIGJ5IHRoZSBXaW5kb3dzIE1YQyBwcm9jZXNzIGNvbnRhaW5lci4gKi9cblx0Z2V0V2luZG93c014Y0Vudmlyb25tZW50KCk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+O1xuXHQvKiogQnVpbGRzIGEgV2luZG93cyBNWEMgcGF5bG9hZCBmcm9tIGEgdGFyZ2V0LWVudmlyb25tZW50IE1YQyBzYW5kYm94IHBvbGljeS4gKi9cblx0YnVpbGRXaW5kb3dzTXhjU2FuZGJveFBheWxvYWQoY29tbWFuZExpbmU6IHN0cmluZywgcG9saWN5OiBJV2luZG93c014Y1NhbmRib3hQb2xpY3ksIHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcsIGNvbnRhaW5lck5hbWU/OiBzdHJpbmcsIGNvbnRhaW5tZW50PzogSVdpbmRvd3NNeGNQb2xpY3lDb250YWlubWVudCk6IFByb21pc2U8SVdpbmRvd3NNeGNDb25maWcgfCB1bmRlZmluZWQ+O1xuXHQvKipcblx0ICogUmV0dXJucyB0aGUgZWZmZWN0aXZlIHZhbHVlIG9mIGEgc2FuZGJveC1yZWxhdGVkIGNvbmZpZ3VyYXRpb24gc2V0dGluZyxcblx0ICogb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2V0dGluZyBpcyBub3QgY29uZmlndXJlZC5cblx0ICovXG5cdGdldFNhbmRib3hTZXR0aW5nPFQ+KHNldHRpbmdJZDogQWdlbnRTYW5kYm94U2V0dGluZ0lkIHwgQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkKTogVCB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gYW55IHZhbHVlIHJldHVybmVkIGJ5IHtAbGluayBnZXRTYW5kYm94U2V0dGluZ30gbWF5IGhhdmVcblx0ICogY2hhbmdlZC4gVGhlIGVuZ2luZSBpbnZhbGlkYXRlcyBpdHMgc2FuZGJveC1jb25maWcgZmlsZSBvbiBlYWNoIGV2ZW50LlxuXHQgKiBJbXBsZW1lbnRhdGlvbnMgc2hvdWxkIHByZS1maWx0ZXIgdG8gc2FuZGJveC1yZWxldmFudCBrZXlzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTYW5kYm94U2V0dGluZ3M6IEV2ZW50PHZvaWQ+O1xufVxuXG4vKipcbiAqIENvcmUgc2FuZGJveCBlbmdpbmUuIEVuY2Fwc3VsYXRlcyB0aGUgcGxhdGZvcm0tYWdub3N0aWMgbG9naWMgZm9yIHdyYXBwaW5nXG4gKiBjb21tYW5kcyBpbiBhIHNhbmRib3ggcnVudGltZTogZW5hYmxlZG5lc3MgY2hlY2tzLCBjb21tYW5kLWxpbmUgd3JhcHBpbmcsXG4gKiBzYW5kYm94LWNvbmZpZyBnZW5lcmF0aW9uLCBuZXR3b3JrLWRvbWFpbiBleHRyYWN0aW9uIGFuZCBwcmVyZXF1aXNpdGUgY2hlY2tzLlxuICpcbiAqIEhvc3RzICh3b3JrYmVuY2ggLyBhZ2VudCBob3N0KSBjb25zdHJ1Y3QgYW4gZW5naW5lIHdpdGggYSBob3N0IGFkYXB0ZXIgdGhhdFxuICogc3VwcGxpZXMgd29ya3NwYWNlL3JlbW90ZS1zcGVjaWZpYyBkYXRhLCB0aGVuIGZvcndhcmQgdGhlaXIgcHVibGljIHNlcnZpY2VcbiAqIG1ldGhvZHMgdG8gdGhlIGVuZ2luZSBhbmQgYWRkIHRoZWlyIG93biBob3N0LXNwZWNpZmljIGNvbmNlcm5zXG4gKiAoY2hhdCBlbGljaXRhdGlvbiwgbGlmZWN5Y2xlIGhvb2tzLCBcdTIwMjYpIG9uIHRvcC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcm1pbmFsU2FuZGJveEVuZ2luZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfdXJsUmVnZXggPSAvKD86aHR0cHM/fHdzcz8pOlxcL1xcL1teXFxzJ1wiYHwmOzw+XSsvZ2k7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9zc2hSZW1vdGVSZWdleCA9IC8oPzpefFtcXHMnXCJgXSkoPzpbXlxcc0A6J1wiYF0rQCk/KFthLXpBLVowLTkuLV0rXFwuW2EtekEtWl17Mix9KSg/OjpbXlxccydcImB8Jjs8Pl0rKSg/PSR8W1xccydcImB8Jjs8Pl0pL2dpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfaG9zdFJlZ2V4ID0gLyg/Ol58W1xccydcImAoPV0pKFthLXpBLVowLTkuLV0rXFwuW2EtekEtWl17Mix9KSg/OjpcXGQrKT8oPz0oPzpcXC9bXlxccydcImB8Jjs8Pl0qKT8oPzokfFtcXHMnXCJgKVxcXXwsO3wmPD5dKSkvZ2k7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2FuZGJveFNldHRpbmdzSWQ6IHN0cmluZyA9IGdlbmVyYXRlVXVpZCgpO1xuXHRwcml2YXRlIF9ydW50aW1lUmVzb2x2ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYXBwUm9vdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leGVjUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9ydW5Bc05vZGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfdXNlckhvbWU6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3J0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZ1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbXhjUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93aW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeTogSVdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93aW5kb3dzTXhjRW52aXJvbm1lbnQ6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zYW5kYm94Q29uZmlnUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zYW5kYm94RGVwZW5kZW5jeVN0YXR1czogSVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lbmFibGVXZWFrZXJOZXN0ZWRTYW5kYm94ID0gZmFsc2U7XG5cdHByaXZhdGUgX2FwcGFybW9yUmVtZWRpYXRpb25SZXF1ZXN0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbmVlZHNGb3JjZVVwZGF0ZUNvbmZpZ0ZpbGUgPSB0cnVlO1xuXHRwcml2YXRlIF90ZW1wRGlyOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1hbmRBbGxvd0xpc3RLZXl3b3JkczogcmVhZG9ubHkgc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfY29tbWFuZEFsbG93TGlzdENvbW1hbmREZXRhaWxzOiByZWFkb25seSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdID0gW107XG5cdHByaXZhdGUgX2NvbW1hbmRDd2Q6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWFuZExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWFuZFNoZWxsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1hbmRBbGxvd05ldHdvcmsgPSBmYWxzZTtcblx0cHJpdmF0ZSBfb3M6IE9wZXJhdGluZ1N5c3RlbSA9IE9TO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0V3JpdGVQYXRoczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZVN5c3RlbVBhdGhFeHRVcmkgPSBuZXcgRXh0VXJpKCgpID0+IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG9zdDogSVRlcm1pbmFsU2FuZGJveEVuZ2luZUhvc3QsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lIHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvd3NNeGNSdW50aW1lOiBJV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2hvc3Qub25EaWRDaGFuZ2VTYW5kYm94U2V0dGluZ3MsICgpID0+IHtcblx0XHRcdHRoaXMuc2V0TmVlZHNGb3JjZVVwZGF0ZUNvbmZpZ0ZpbGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faG9zdC5vbkRpZENoYW5nZVJvb3RzKCgpID0+IHRoaXMuc2V0TmVlZHNGb3JjZVVwZGF0ZUNvbmZpZ0ZpbGUoKSkpO1xuXHR9XG5cblx0YXN5bmMgaXNFbmFibGVkKHByZWNoZWNrSW5wdXRzPzogSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzU2FuZGJveENvbmZpZ3VyZWRFbmFibGVkKHByZWNoZWNrSW5wdXRzKTtcblx0fVxuXG5cdGFzeW5jIGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQocHJlY2hlY2tJbnB1dHM/OiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl9pc1NhbmRib3hDb25maWd1cmVkRW5hYmxlZChwcmVjaGVja0lucHV0cykpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pc1NhbmRib3hBbGxvd05ldHdvcmtDb25maWd1cmVkKCk7XG5cdH1cblxuXHRhcmVVbnNhbmRib3hlZENvbW1hbmRzQWxsb3dlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJlVW5zYW5kYm94ZWRDb21tYW5kc0FsbG93ZWQoKTtcblx0fVxuXG5cdGFyZVJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzQWxsb3dlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJlUmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHNBbGxvd2VkKCk7XG5cdH1cblxuXHRhc3luYyBnZXRPUygpOiBQcm9taXNlPE9wZXJhdGluZ1N5c3RlbT4ge1xuXHRcdHRoaXMuX29zID0gYXdhaXQgdGhpcy5faG9zdC5nZXRPUygpO1xuXHRcdHJldHVybiB0aGlzLl9vcztcblx0fVxuXG5cdGdldFRlbXBEaXIoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVtcERpcjtcblx0fVxuXG5cdHNldE5lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlKCk6IHZvaWQge1xuXHRcdHRoaXMuX25lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlID0gdHJ1ZTtcblx0fVxuXG5cdGdldFJlc29sdmVkTmV0d29ya0RvbWFpbnMoKTogSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMge1xuXHRcdGNvbnN0IGFsbG93ZWREb21haW5zID0gdGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxzdHJpbmdbXT4oQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkFsbG93ZWROZXR3b3JrRG9tYWlucykgPz8gW107XG5cdFx0Y29uc3QgZGVuaWVkRG9tYWlucyA9IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8c3RyaW5nW10+KEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5EZW5pZWROZXR3b3JrRG9tYWlucykgPz8gW107XG5cdFx0cmV0dXJuIHsgYWxsb3dlZERvbWFpbnMsIGRlbmllZERvbWFpbnMgfTtcblx0fVxuXG5cdGFzeW5jIHdyYXBDb21tYW5kKGNvbW1hbmQ6IHN0cmluZywgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPzogYm9vbGVhbiwgc2hlbGw/OiBzdHJpbmcsIGN3ZD86IFVSSSwgY29tbWFuZERldGFpbHM/OiByZWFkb25seSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdLCByZXF1ZXN0QWxsb3dOZXR3b3JrPzogYm9vbGVhbik6IFByb21pc2U8SVRlcm1pbmFsU2FuZGJveFdyYXBSZXN1bHQ+IHtcblx0XHRjb25zdCBhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMgPSB0aGlzLl9hcmVVbnNhbmRib3hlZENvbW1hbmRzQWxsb3dlZCgpO1xuXHRcdGNvbnN0IHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzID0gdGhpcy5fYXJlUmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHNBbGxvd2VkKCk7XG5cdFx0Y29uc3Qgc2hvdWxkSW5zcGVjdEJsb2NrZWREb21haW5zID0gcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uICE9PSB0cnVlICYmIHJlcXVlc3RBbGxvd05ldHdvcmsgIT09IHRydWUgJiYgKHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzIHx8IGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyk7XG5cdFx0Y29uc3QgYmxvY2tlZERvbWFpblJlc3VsdCA9IHNob3VsZEluc3BlY3RCbG9ja2VkRG9tYWlucyA/IHRoaXMuX2dldEJsb2NrZWREb21haW5zKGNvbW1hbmQpIDogeyBibG9ja2VkRG9tYWluczogW10sIGRlbmllZERvbWFpbnM6IFtdIH07XG5cdFx0Y29uc3QgcmVxdWlyZXNQcmVmbGlnaHRBbGxvd05ldHdvcmsgPSByZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cyAmJiBibG9ja2VkRG9tYWluUmVzdWx0LmJsb2NrZWREb21haW5zLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3QgYWxsb3dOZXR3b3JrRm9yQ29tbWFuZCA9IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiAhPT0gdHJ1ZSAmJiAoKHJlcXVlc3RBbGxvd05ldHdvcmsgPT09IHRydWUgJiYgcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMpIHx8IHJlcXVpcmVzUHJlZmxpZ2h0QWxsb3dOZXR3b3JrKTtcblx0XHRjb25zdCBub3JtYWxpemVkQ29tbWFuZERldGFpbHMgPSB0aGlzLl9ub3JtYWxpemVDb21tYW5kRGV0YWlscyhjb21tYW5kRGV0YWlscyA/PyBbXSk7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZENvbW1hbmRLZXl3b3JkcyA9IHRoaXMuX25vcm1hbGl6ZUNvbW1hbmRLZXl3b3Jkcyhub3JtYWxpemVkQ29tbWFuZERldGFpbHMubWFwKGMgPT4gYy5rZXl3b3JkKSk7XG5cdFx0Y29uc3QgY3VycmVudFJlYWRBbGxvd0xpc3RQYXRocyA9IGdldFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RGb3JDb21tYW5kcyh0aGlzLl9vcywgdGhpcy5fY29tbWFuZEFsbG93TGlzdEtleXdvcmRzLCB0aGlzLl9jb21tYW5kQWxsb3dMaXN0Q29tbWFuZERldGFpbHMpO1xuXHRcdGNvbnN0IG5leHRSZWFkQWxsb3dMaXN0UGF0aHMgPSBnZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yQ29tbWFuZHModGhpcy5fb3MsIG5vcm1hbGl6ZWRDb21tYW5kS2V5d29yZHMsIG5vcm1hbGl6ZWRDb21tYW5kRGV0YWlscyk7XG5cdFx0Y29uc3QgY3VycmVudFJ1bnRpbWVDb25maWd1cmF0aW9uID0gZ2V0VGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25Gb3JDb21tYW5kcyh0aGlzLl9vcywgdGhpcy5fY29tbWFuZEFsbG93TGlzdENvbW1hbmREZXRhaWxzKTtcblx0XHRjb25zdCBuZXh0UnVudGltZUNvbmZpZ3VyYXRpb24gPSBnZXRUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkZvckNvbW1hbmRzKHRoaXMuX29zLCBub3JtYWxpemVkQ29tbWFuZERldGFpbHMpO1xuXHRcdGNvbnN0IHNob3VsZFJlZnJlc2hDb25maWcgPSB0aGlzLl9jb21tYW5kQWxsb3dMaXN0S2V5d29yZHMubGVuZ3RoID09PSAwXG5cdFx0XHR8fCB0aGlzLl9uZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZVxuXHRcdFx0fHwgIXRoaXMuX2FyZVN0cmluZ0FycmF5c0VxdWFsKHRoaXMuX2NvbW1hbmRBbGxvd0xpc3RLZXl3b3Jkcywgbm9ybWFsaXplZENvbW1hbmRLZXl3b3Jkcylcblx0XHRcdHx8ICF0aGlzLl9hcmVTdHJpbmdBcnJheXNFcXVhbChjdXJyZW50UmVhZEFsbG93TGlzdFBhdGhzLCBuZXh0UmVhZEFsbG93TGlzdFBhdGhzKVxuXHRcdFx0fHwgIXRoaXMuX2FyZU9iamVjdHNFcXVhbChjdXJyZW50UnVudGltZUNvbmZpZ3VyYXRpb24sIG5leHRSdW50aW1lQ29uZmlndXJhdGlvbilcblx0XHRcdHx8IHRoaXMuX2NvbW1hbmRDd2Q/LnRvU3RyaW5nKCkgIT09IGN3ZD8udG9TdHJpbmcoKVxuXHRcdFx0fHwgdGhpcy5fY29tbWFuZEFsbG93TmV0d29yayAhPT0gYWxsb3dOZXR3b3JrRm9yQ29tbWFuZFxuXHRcdFx0fHwgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyAmJiAodGhpcy5fY29tbWFuZExpbmUgIT09IGNvbW1hbmQgfHwgdGhpcy5fY29tbWFuZFNoZWxsICE9PSBzaGVsbCkpO1xuXHRcdGlmIChzaG91bGRSZWZyZXNoQ29uZmlnKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kQWxsb3dMaXN0S2V5d29yZHMgPSBub3JtYWxpemVkQ29tbWFuZEtleXdvcmRzO1xuXHRcdFx0dGhpcy5fY29tbWFuZEFsbG93TGlzdENvbW1hbmREZXRhaWxzID0gbm9ybWFsaXplZENvbW1hbmREZXRhaWxzO1xuXHRcdFx0dGhpcy5fY29tbWFuZEN3ZCA9IGN3ZDtcblx0XHRcdHRoaXMuX2NvbW1hbmRMaW5lID0gY29tbWFuZDtcblx0XHRcdHRoaXMuX2NvbW1hbmRTaGVsbCA9IHNoZWxsO1xuXHRcdFx0dGhpcy5fY29tbWFuZEFsbG93TmV0d29yayA9IGFsbG93TmV0d29ya0ZvckNvbW1hbmQ7XG5cdFx0XHRhd2FpdCB0aGlzLmdldFNhbmRib3hDb25maWdQYXRoKHRydWUpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc2FuZGJveENvbmZpZ1BhdGggfHwgIXRoaXMuX3RlbXBEaXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2FuZGJveCBjb25maWcgcGF0aCBvciB0ZW1wIGRpciBub3QgaW5pdGlhbGl6ZWQnKTtcblx0XHR9XG5cblx0XHQvLyBJZiBwZXItY29tbWFuZCBuZXR3b3JrIHJlbGF4YXRpb24gaXMgZGlzYWJsZWQsIHByZXNlcnZlIHRoZSBleGlzdGluZ1xuXHRcdC8vIHVuc2FuZGJveCBmYWxsYmFjayBmb3IgY29tbWFuZHMgd2l0aCBzdGF0aWNhbGx5LWRldGVjdGVkIGJsb2NrZWQgZG9tYWlucy5cblx0XHRpZiAoIXJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiAmJiAhcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMgJiYgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzICYmIGJsb2NrZWREb21haW5SZXN1bHQuYmxvY2tlZERvbWFpbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29tbWFuZDogdGhpcy5fd3JhcFVuc2FuZGJveGVkQ29tbWFuZChjb21tYW5kLCBzaGVsbCwgY3dkKSxcblx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZDogZmFsc2UsXG5cdFx0XHRcdGJsb2NrZWREb21haW5zOiBibG9ja2VkRG9tYWluUmVzdWx0LmJsb2NrZWREb21haW5zLFxuXHRcdFx0XHRkZW5pZWREb21haW5zOiBibG9ja2VkRG9tYWluUmVzdWx0LmRlbmllZERvbWFpbnMsXG5cdFx0XHRcdHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uOiB0cnVlLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBJZiByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gaXMgdHJ1ZSwgbmVlZCB0byBlbnN1cmUgZW52IHZhcmlhYmxlcyBzZXQgZHVyaW5nIHNhbmRib3ggc3RpbGwgYXBwbHkuXG5cdFx0aWYgKHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiAmJiBhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbW1hbmQ6IHRoaXMuX3dyYXBVbnNhbmRib3hlZENvbW1hbmQoY29tbWFuZCwgc2hlbGwsIGN3ZCksXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxvd05ldHdvcmtDb25maXJtYXRpb25NZXRhZGF0YSA9IHJlcXVpcmVzUHJlZmxpZ2h0QWxsb3dOZXR3b3JrID8ge1xuXHRcdFx0YmxvY2tlZERvbWFpbnM6IGJsb2NrZWREb21haW5SZXN1bHQuYmxvY2tlZERvbWFpbnMsXG5cdFx0XHRkZW5pZWREb21haW5zOiBibG9ja2VkRG9tYWluUmVzdWx0LmRlbmllZERvbWFpbnMsXG5cdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdGlmICghdGhpcy5fbXhjUGF0aCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01YQyBleGVjdXRhYmxlIHBhdGggbm90IHJlc29sdmVkJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb21tYW5kOiB0aGlzLl93aW5kb3dzTXhjUnVudGltZS53cmFwQ29tbWFuZCh0aGlzLl9teGNQYXRoLCB0aGlzLl9zYW5kYm94Q29uZmlnUGF0aCksXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHRcdHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uOiBhbGxvd05ldHdvcmtGb3JDb21tYW5kICYmICF0aGlzLl9pc1NhbmRib3hBbGxvd05ldHdvcmtDb25maWd1cmVkKCkgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHQuLi5hbGxvd05ldHdvcmtDb25maXJtYXRpb25NZXRhZGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9leGVjUGF0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeGVjdXRhYmxlIHBhdGggbm90IHNldCB0byBydW4gc2FuZGJveCBjb21tYW5kcycpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3NydFBhdGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2FuZGJveCBydW50aW1lIHBhdGggbm90IHJlc29sdmVkJyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fcmdQYXRoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JpcGdyZXAgcGF0aCBub3QgcmVzb2x2ZWQnKTtcblx0XHR9XG5cdFx0Ly8gVXNlIEVMRUNUUk9OX1JVTl9BU19OT0RFPTEgdG8gbWFrZSBFbGVjdHJvbiBleGVjdXRhYmxlIGJlaGF2ZSBhcyBOb2RlLmpzXG5cdFx0Ly8gVE1QRElSIG11c3QgYmUgc2V0IGFzIGVudmlyb25tZW50IHZhcmlhYmxlIGJlZm9yZSB0aGUgY29tbWFuZFxuXHRcdC8vIFF1b3RlIHNoZWxsIGFyZ3VtZW50cyBzbyB0aGUgd3JhcHBlZCBjb21tYW5kIGNhbm5vdCBicmVhayBvdXQgb2YgdGhlIG91dGVyIHNoZWxsLlxuXHRcdGNvbnN0IGNvbW1hbmRUb1J1bkluU2FuZGJveCA9IHRoaXMuX2dldFNhbmRib3hDb21tYW5kV2l0aFByZXNlcnZlZEN3ZChjb21tYW5kLCBjd2QpO1xuXHRcdGNvbnN0IHNhbmRib3hSdW50aW1lQ29tbWFuZCA9IGBQQVRIPVwiJFBBVEg6JHt0aGlzLl9wYXRoRGlybmFtZSh0aGlzLl9yZ1BhdGgpfVwiIFRNUERJUj1cIiR7dGhpcy5fdGVtcERpci5wYXRofVwiIENMQVVERV9UTVBESVI9XCIke3RoaXMuX3RlbXBEaXIucGF0aH1cIiBcIiR7dGhpcy5fZXhlY1BhdGh9XCIgXCIke3RoaXMuX3NydFBhdGh9XCIgLS1zZXR0aW5ncyBcIiR7dGhpcy5fc2FuZGJveENvbmZpZ1BhdGh9XCIgLWMgJHt0aGlzLl9xdW90ZVNoZWxsQXJndW1lbnQoY29tbWFuZFRvUnVuSW5TYW5kYm94KX1gO1xuXHRcdC8vIE9uIHdvcmtiZW5jaCBFbGVjdHJvbiBidWlsZHMgdGhlIGV4ZWMgcGF0aCBwb2ludHMgYXQgdGhlIEVsZWN0cm9uIGJpbmFyeSwgc28gd2Vcblx0XHQvLyBwcmVmaXggYEVMRUNUUk9OX1JVTl9BU19OT0RFPTFgIHRvIG1ha2UgaXQgYmVoYXZlIGFzIE5vZGUuanMuIFJlbW90ZSB3b3JrYmVuY2ggYW5kXG5cdFx0Ly8gdGhlIGFnZW50IGhvc3QgYWxyZWFkeSByZXNvbHZlIGEgcmVhbCBgbm9kZWAgYmluYXJ5IGFuZCB0aGUgaG9zdCBjbGVhcnMgdGhlIGZsYWcuXG5cdFx0aWYgKHRoaXMuX3J1bkFzTm9kZSkge1xuXHRcdFx0Y29uc3Qgbm9kZVNhbmRib3hSdW50aW1lQ29tbWFuZCA9IGBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xICR7c2FuZGJveFJ1bnRpbWVDb21tYW5kfWA7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb21tYW5kOiB0aGlzLl93cmFwU2FuZGJveFJ1bnRpbWVDb21tYW5kRm9yTGF1bmNoKG5vZGVTYW5kYm94UnVudGltZUNvbW1hbmQsIGN3ZCksXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHRcdHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uOiBhbGxvd05ldHdvcmtGb3JDb21tYW5kICYmICF0aGlzLl9pc1NhbmRib3hBbGxvd05ldHdvcmtDb25maWd1cmVkKCkgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHQuLi5hbGxvd05ldHdvcmtDb25maXJtYXRpb25NZXRhZGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRjb21tYW5kOiB0aGlzLl93cmFwU2FuZGJveFJ1bnRpbWVDb21tYW5kRm9yTGF1bmNoKHNhbmRib3hSdW50aW1lQ29tbWFuZCwgY3dkKSxcblx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbjogYWxsb3dOZXR3b3JrRm9yQ29tbWFuZCAmJiAhdGhpcy5faXNTYW5kYm94QWxsb3dOZXR3b3JrQ29uZmlndXJlZCgpID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdC4uLmFsbG93TmV0d29ya0NvbmZpcm1hdGlvbk1ldGFkYXRhLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBjaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKGZvcmNlUmVmcmVzaDogYm9vbGVhbiA9IGZhbHNlLCBwcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyk6IFByb21pc2U8SVRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrUmVzdWx0PiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5faXNTYW5kYm94Q29uZmlndXJlZEVuYWJsZWQocHJlY2hlY2tJbnB1dHMpKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhbmRib3hDb25maWdQYXRoID0gYXdhaXQgdGhpcy5nZXRTYW5kYm94Q29uZmlnUGF0aChmb3JjZVJlZnJlc2gsIHByZWNoZWNrSW5wdXRzKTtcblx0XHRpZiAoIXNhbmRib3hDb25maWdQYXRoKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aCxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkNvbmZpZyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzKGZvcmNlUmVmcmVzaCkpKSB7XG5cdFx0XHRjb25zdCBtaXNzaW5nRGVwZW5kZW5jaWVzID0gYXdhaXQgdGhpcy5nZXRNaXNzaW5nU2FuZGJveERlcGVuZGVuY2llcygpO1xuXHRcdFx0aWYgKG1pc3NpbmdEZXBlbmRlbmNpZXMubGVuZ3RoID09PSAwICYmIHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzPy5idWJibGV3cmFwVXNhYmxlID09PSBmYWxzZSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMuYXBwYXJtb3JSZXN0cmljdHNVbnByaXZpbGVnZWRVc2VyTmFtZXNwYWNlcyAhPT0gdHJ1ZSB8fCAoZm9yY2VSZWZyZXNoICYmIHRoaXMuX2FwcGFybW9yUmVtZWRpYXRpb25SZXF1ZXN0ZWQpKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9lbmFibGVXZWFrZXJOZXN0ZWRTYW5kYm94KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lbmFibGVXZWFrZXJOZXN0ZWRTYW5kYm94ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZ2V0U2FuZGJveENvbmZpZ1BhdGgodHJ1ZSwgcHJlY2hlY2tJbnB1dHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiB0aGlzLl9zYW5kYm94Q29uZmlnUGF0aCxcblx0XHRcdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hcHBhcm1vclJlbWVkaWF0aW9uUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHNhbmRib3hDb25maWdQYXRoLFxuXHRcdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwLFxuXHRcdFx0XHRcdHJlbWVkaWF0aW9uczogdGhpcy5fZ2V0QnViYmxld3JhcFJlbWVkaWF0aW9ucygpLFxuXHRcdFx0XHRcdGRldGFpbDogdGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMuYnViYmxld3JhcEVycm9yLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGgsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5EZXBlbmRlbmNpZXMsXG5cdFx0XHRcdG1pc3NpbmdEZXBlbmRlbmNpZXMsXG5cdFx0XHRcdGNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzOiAhIXRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzPy5kZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0c2FuZGJveENvbmZpZ1BhdGgsXG5cdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBjaGVja0ZpbGVBY2Nlc3MocGVybWlzc2lvbjogVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc1Blcm1pc3Npb24sIHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSwgcHJlY2hlY2tJbnB1dHM/OiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMpOiBQcm9taXNlPElUZXJtaW5hbFNhbmRib3hGaWxlQWNjZXNzQ2hlY2tSZXN1bHQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl9pc1NhbmRib3hDb25maWd1cmVkRW5hYmxlZChwcmVjaGVja0lucHV0cykpKSB7XG5cdFx0XHRyZXR1cm4geyBhbGxvd2VkOiB0cnVlLCBkZW5pZWQ6IFtdIH07XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVJ1bnRpbWVJbmZvKCk7XG5cdFx0aWYgKCF0aGlzLl90ZW1wRGlyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9pbml0VGVtcERpcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ0ZpbGVQYXRoID0gdGhpcy5fdGVtcERpciA/IHRoaXMuX2dldFVyaVBhdGgoVVJJLmpvaW5QYXRoKHRoaXMuX3RlbXBEaXIsIGB2c2NvZGUtc2FuZGJveC1zZXR0aW5ncy0ke3RoaXMuX3NhbmRib3hTZXR0aW5nc0lkfS5qc29uYCkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFjY2Vzc1BhdGhzID0gYXdhaXQgdGhpcy5fZ2V0RmlsZVN5c3RlbUFjY2Vzc1BhdGhzKGNvbmZpZ0ZpbGVQYXRoKTtcblx0XHRjb25zdCBkZW5pZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG5cdFx0XHRpZiAoIXBhdGggfHwgIWF3YWl0IHRoaXMuX2hhc0ZpbGVTeXN0ZW1BY2Nlc3MocGVybWlzc2lvbiwgcGF0aCwgYWNjZXNzUGF0aHMpKSB7XG5cdFx0XHRcdGRlbmllZC5wdXNoKHBhdGgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGFsbG93ZWQ6IGRlbmllZC5sZW5ndGggPT09IDAsIGRlbmllZCB9O1xuXHR9XG5cblx0YXN5bmMgZ2V0U2FuZGJveENvbmZpZ1BhdGgoZm9yY2VSZWZyZXNoOiBib29sZWFuID0gZmFsc2UsIHByZWNoZWNrSW5wdXRzPzogSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl9pc1NhbmRib3hDb25maWd1cmVkRW5hYmxlZChwcmVjaGVja0lucHV0cykpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlUnVudGltZUluZm8oKTtcblx0XHRpZiAoIXRoaXMuX3NhbmRib3hDb25maWdQYXRoIHx8IGZvcmNlUmVmcmVzaCB8fCB0aGlzLl9uZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZSkge1xuXHRcdFx0dGhpcy5fc2FuZGJveENvbmZpZ1BhdGggPSBhd2FpdCB0aGlzLl9jcmVhdGVTYW5kYm94Q29uZmlnKCk7XG5cdFx0XHR0aGlzLl9uZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZSA9IGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2FuZGJveENvbmZpZ1BhdGg7XG5cdH1cblxuXHRhc3luYyBnZXRNaXNzaW5nU2FuZGJveERlcGVuZGVuY2llcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3Qgb3MgPSBhd2FpdCB0aGlzLmdldE9TKCk7XG5cdFx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMpIHtcblx0XHRcdHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzID0gYXdhaXQgdGhpcy5faG9zdC5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXMoKTtcblx0XHR9XG5cblx0XHRjb25zdCBtaXNzaW5nOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmICh0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cyAmJiAhdGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMuYnViYmxld3JhcEluc3RhbGxlZCkge1xuXHRcdFx0bWlzc2luZy5wdXNoKCdidWJibGV3cmFwJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cyAmJiAhdGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMuc29jYXRJbnN0YWxsZWQpIHtcblx0XHRcdG1pc3NpbmcucHVzaCgnc29jYXQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1pc3Npbmc7XG5cdH1cblxuXHQvKipcblx0ICogRGVsZXRlcyB0aGUgc2FuZGJveCB0ZW1wIGRpcmVjdG9yeSBpZiBvbmUgd2FzIGNyZWF0ZWQuIEhvc3RzIGFyZSBleHBlY3RlZFxuXHQgKiB0byBpbnZva2UgdGhpcyBmcm9tIHRoZWlyIHNodXRkb3duIC8gZGlzcG9zYWwgcGF0aDsgdGhlIGVuZ2luZSBpdHNlbGYgZG9lc1xuXHQgKiBub3QgZGVsZXRlIHRoZSBkaXJlY3Rvcnkgb24gYGRpc3Bvc2UoKWAgYmVjYXVzZSBzaHV0ZG93biBqb2luZXJzIG5lZWQgdG9cblx0ICogYmUgY29vcmRpbmF0ZWQgZXh0ZXJuYWxseS5cblx0ICovXG5cdGFzeW5jIGNsZWFudXBUZW1wRGlyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fdGVtcERpcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHRoaXMuX3RlbXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogZmFsc2UgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignVGVybWluYWxTYW5kYm94RW5naW5lOiBGYWlsZWQgdG8gZGVsZXRlIHNhbmRib3ggdGVtcCBkaXInLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBwcml2YXRlIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoZWNrU2FuZGJveERlcGVuZGVuY2llcyhmb3JjZVJlZnJlc2ggPSBmYWxzZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG9zID0gYXdhaXQgdGhpcy5nZXRPUygpO1xuXHRcdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICghZm9yY2VSZWZyZXNoICYmIHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMuYnViYmxld3JhcEluc3RhbGxlZCAmJiB0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cy5idWJibGV3cmFwVXNhYmxlICYmIHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzLnNvY2F0SW5zdGFsbGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXR1cyA9IGF3YWl0IHRoaXMuX2hvc3QuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzKCk7XG5cdFx0dGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMgPSBzdGF0dXM7XG5cblx0XHRpZiAoc3RhdHVzICYmICFzdGF0dXMuYnViYmxld3JhcEluc3RhbGxlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdUZXJtaW5hbFNhbmRib3hFbmdpbmU6IGJ1YmJsZXdyYXAgKGJ3cmFwKSBpcyBub3QgaW5zdGFsbGVkJyk7XG5cdFx0fSBlbHNlIGlmIChzdGF0dXMgJiYgIXN0YXR1cy5idWJibGV3cmFwVXNhYmxlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1Rlcm1pbmFsU2FuZGJveEVuZ2luZTogYnViYmxld3JhcCAoYndyYXApIGlzIGluc3RhbGxlZCBidXQgZmFpbGVkIGl0cyBjYXBhYmlsaXR5IGNoZWNrJywgc3RhdHVzLmJ1YmJsZXdyYXBFcnJvcik7XG5cdFx0fVxuXHRcdGlmIChzdGF0dXMgJiYgIXN0YXR1cy5zb2NhdEluc3RhbGxlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdUZXJtaW5hbFNhbmRib3hFbmdpbmU6IHNvY2F0IGlzIG5vdCBpbnN0YWxsZWQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdHVzID8gc3RhdHVzLmJ1YmJsZXdyYXBJbnN0YWxsZWQgJiYgc3RhdHVzLmJ1YmJsZXdyYXBVc2FibGUgJiYgc3RhdHVzLnNvY2F0SW5zdGFsbGVkIDogdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEJ1YmJsZXdyYXBSZW1lZGlhdGlvbnMoKTogcmVhZG9ubHkgVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbltdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gW1Rlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24uRGlzYWJsZVVucHJpdmlsYWdlZHVzZXJuYW1lc3BhY2VSZXN0cmljdGlvbl07XG5cdH1cblxuXHRwcml2YXRlIF9xdW90ZVNoZWxsQXJndW1lbnQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAnJHt2YWx1ZS5yZXBsYWNlKC8nL2csIGAnXFxcXCcnYCl9J2A7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTYW5kYm94Q29tbWFuZFdpdGhQcmVzZXJ2ZWRDd2QoY29tbWFuZDogc3RyaW5nLCBjd2Q6IFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX29zICE9PSBPcGVyYXRpbmdTeXN0ZW0uTGludXggfHwgIWN3ZD8ucGF0aCB8fCBjd2QucGF0aCA9PT0gdGhpcy5fdGVtcERpcj8ucGF0aCkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmQ7XG5cdFx0fVxuXHRcdHJldHVybiBgY2QgJHt0aGlzLl9xdW90ZVNoZWxsQXJndW1lbnQoY3dkLnBhdGgpfSAmJiAke2NvbW1hbmR9YDtcblx0fVxuXG5cdHByaXZhdGUgX3dyYXBTYW5kYm94UnVudGltZUNvbW1hbmRGb3JMYXVuY2goc2FuZGJveFJ1bnRpbWVDb21tYW5kOiBzdHJpbmcsIGN3ZDogVVJJIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCB0ZW1wRGlyUGF0aCA9IHRoaXMuX3RlbXBEaXI/LnBhdGg7XG5cdFx0cmV0dXJuIHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTGludXggJiYgY3dkPy5wYXRoICYmIHRlbXBEaXJQYXRoICYmIGN3ZC5wYXRoICE9PSB0ZW1wRGlyUGF0aFxuXHRcdFx0PyBgY2QgJHt0aGlzLl9xdW90ZVNoZWxsQXJndW1lbnQodGVtcERpclBhdGgpfTsgJHtzYW5kYm94UnVudGltZUNvbW1hbmR9YFxuXHRcdFx0OiBzYW5kYm94UnVudGltZUNvbW1hbmQ7XG5cdH1cblxuXHRwcml2YXRlIF93cmFwVW5zYW5kYm94ZWRDb21tYW5kKGNvbW1hbmQ6IHN0cmluZywgc2hlbGw/OiBzdHJpbmcsIGN3ZD86IFVSSSk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3dpbmRvd3NNeGNSdW50aW1lLndyYXBVbnNhbmRib3hlZENvbW1hbmQoY29tbWFuZCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdGVtcERpcj8ucGF0aCkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbW1hbmRXaXRoUHJlc2VydmVkQ3dkID0gdGhpcy5fZ2V0U2FuZGJveENvbW1hbmRXaXRoUHJlc2VydmVkQ3dkKGNvbW1hbmQsIGN3ZCk7XG5cdFx0aWYgKCFzaGVsbCkge1xuXHRcdFx0cmV0dXJuIGAoVE1QRElSPVwiJHt0aGlzLl90ZW1wRGlyLnBhdGh9XCI7IGV4cG9ydCBUTVBESVI7ICR7Y29tbWFuZFdpdGhQcmVzZXJ2ZWRDd2R9KWA7XG5cdFx0fVxuXHRcdHJldHVybiBgZW52IFRNUERJUj1cIiR7dGhpcy5fdGVtcERpci5wYXRofVwiICR7dGhpcy5fcXVvdGVTaGVsbEFyZ3VtZW50KHNoZWxsKX0gLWMgJHt0aGlzLl9xdW90ZVNoZWxsQXJndW1lbnQoY29tbWFuZFdpdGhQcmVzZXJ2ZWRDd2QpfWA7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRCbG9ja2VkRG9tYWlucyhjb21tYW5kOiBzdHJpbmcpOiB7IGJsb2NrZWREb21haW5zOiBzdHJpbmdbXTsgZGVuaWVkRG9tYWluczogc3RyaW5nW10gfSB7XG5cdFx0aWYgKHRoaXMuX2lzU2FuZGJveEFsbG93TmV0d29ya0NvbmZpZ3VyZWQoKSkge1xuXHRcdFx0cmV0dXJuIHsgYmxvY2tlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGRvbWFpbnMgPSB0aGlzLl9leHRyYWN0RG9tYWlucyhjb21tYW5kKTtcblx0XHRpZiAoZG9tYWlucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IGJsb2NrZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10gfTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFsbG93ZWREb21haW5zLCBkZW5pZWREb21haW5zIH0gPSB0aGlzLmdldFJlc29sdmVkTmV0d29ya0RvbWFpbnMoKTtcblx0XHRjb25zdCBibG9ja2VkRG9tYWlucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGV4cGxpY2l0bHlEZW5pZWREb21haW5zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBkb21haW4gb2YgZG9tYWlucykge1xuXHRcdFx0aWYgKGRlbmllZERvbWFpbnMuc29tZShwYXR0ZXJuID0+IG1hdGNoZXNEb21haW5QYXR0ZXJuKGRvbWFpbiwgcGF0dGVybikpKSB7XG5cdFx0XHRcdGJsb2NrZWREb21haW5zLmFkZChkb21haW4pO1xuXHRcdFx0XHRleHBsaWNpdGx5RGVuaWVkRG9tYWlucy5hZGQoZG9tYWluKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWFsbG93ZWREb21haW5zLnNvbWUocGF0dGVybiA9PiBtYXRjaGVzRG9tYWluUGF0dGVybihkb21haW4sIHBhdHRlcm4pKSkge1xuXHRcdFx0XHRibG9ja2VkRG9tYWlucy5hZGQoZG9tYWluKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJsb2NrZWREb21haW5zOiBbLi4uYmxvY2tlZERvbWFpbnNdLFxuXHRcdFx0ZGVuaWVkRG9tYWluczogWy4uLmV4cGxpY2l0bHlEZW5pZWREb21haW5zXSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdERvbWFpbnMoY29tbWFuZDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGRvbWFpbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cblx0XHRUZXJtaW5hbFNhbmRib3hFbmdpbmUuX3VybFJlZ2V4Lmxhc3RJbmRleCA9IDA7XG5cdFx0d2hpbGUgKChtYXRjaCA9IFRlcm1pbmFsU2FuZGJveEVuZ2luZS5fdXJsUmVnZXguZXhlYyhjb21tYW5kKSkgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGRvbWFpbiA9IHRoaXMuX2V4dHJhY3REb21haW5Gcm9tVXJsKG1hdGNoWzBdKTtcblx0XHRcdGlmIChkb21haW4pIHtcblx0XHRcdFx0ZG9tYWlucy5hZGQoZG9tYWluKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRUZXJtaW5hbFNhbmRib3hFbmdpbmUuX3NzaFJlbW90ZVJlZ2V4Lmxhc3RJbmRleCA9IDA7XG5cdFx0d2hpbGUgKChtYXRjaCA9IFRlcm1pbmFsU2FuZGJveEVuZ2luZS5fc3NoUmVtb3RlUmVnZXguZXhlYyhjb21tYW5kKSkgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGRvbWFpbiA9IG5vcm1hbGl6ZURvbWFpbihtYXRjaFsxXSwgdHJ1ZSk7XG5cdFx0XHRpZiAoZG9tYWluKSB7XG5cdFx0XHRcdGRvbWFpbnMuYWRkKGRvbWFpbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0VGVybWluYWxTYW5kYm94RW5naW5lLl9ob3N0UmVnZXgubGFzdEluZGV4ID0gMDtcblx0XHR3aGlsZSAoKG1hdGNoID0gVGVybWluYWxTYW5kYm94RW5naW5lLl9ob3N0UmVnZXguZXhlYyhjb21tYW5kKSkgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGRvbWFpbiA9IG5vcm1hbGl6ZURvbWFpbihtYXRjaFsxXSk7XG5cdFx0XHRpZiAoZG9tYWluKSB7XG5cdFx0XHRcdGRvbWFpbnMuYWRkKGRvbWFpbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5kb21haW5zXTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3REb21haW5Gcm9tVXJsKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhdXRob3JpdHkgPSBVUkkucGFyc2UodmFsdWUpLmF1dGhvcml0eTtcblx0XHRcdHJldHVybiBub3JtYWxpemVEb21haW4oYXV0aG9yaXR5LCB0cnVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplQ29tbWFuZEtleXdvcmRzKGNvbW1hbmRLZXl3b3JkczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFsuLi5uZXcgU2V0KGNvbW1hbmRLZXl3b3Jkcy5tYXAoa2V5d29yZCA9PiBrZXl3b3JkLnRvTG93ZXJDYXNlKCkpKV0uc29ydCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplQ29tbWFuZERldGFpbHMoY29tbWFuZERldGFpbHM6IHJlYWRvbmx5IElUZXJtaW5hbFNhbmRib3hDb21tYW5kW10pOiBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdIHtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmREZXRhaWxzKSB7XG5cdFx0XHRjb25zdCBub3JtYWxpemVkQ29tbWFuZCA9IHsga2V5d29yZDogY29tbWFuZC5rZXl3b3JkLnRvTG93ZXJDYXNlKCksIGFyZ3M6IFsuLi5jb21tYW5kLmFyZ3NdIH07XG5cdFx0XHRjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeShub3JtYWxpemVkQ29tbWFuZCk7XG5cdFx0XHRpZiAoIXNlZW4uaGFzKGtleSkpIHtcblx0XHRcdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRcdFx0cmVzdWx0LnB1c2gobm9ybWFsaXplZENvbW1hbmQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0LnNvcnQoKGEsIGIpID0+IGEua2V5d29yZC5sb2NhbGVDb21wYXJlKGIua2V5d29yZCkgfHwgYS5hcmdzLmpvaW4oJ1xcMCcpLmxvY2FsZUNvbXBhcmUoYi5hcmdzLmpvaW4oJ1xcMCcpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcmVTdHJpbmdBcnJheXNFcXVhbChhOiByZWFkb25seSBzdHJpbmdbXSwgYjogcmVhZG9ubHkgc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gYS5sZW5ndGggPT09IGIubGVuZ3RoICYmIGEuZXZlcnkoKGtleXdvcmQsIGluZGV4KSA9PiBrZXl3b3JkID09PSBiW2luZGV4XSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcmVPYmplY3RzRXF1YWwoYTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGI6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGEpID09PSBKU09OLnN0cmluZ2lmeShiKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzU2FuZGJveEFsbG93ZWRCeVByZWNoZWNrSW5wdXRzKHByZWNoZWNrSW5wdXRzOiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcHJlY2hlY2tJbnB1dHM/LmlzRGVmYXVsdEFwcHJvdmFsUGVybWlzc2lvbkVuYWJsZWQgIT09IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaXNTYW5kYm94Q29uZmlndXJlZEVuYWJsZWQocHJlY2hlY2tJbnB1dHM/OiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuX2lzU2FuZGJveEFsbG93ZWRCeVByZWNoZWNrSW5wdXRzKHByZWNoZWNrSW5wdXRzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmdldE9TKCk7XG5cdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9nZXRTYW5kYm94Q29uZmlndXJlZFdpbmRvd3NFbmFibGVkVmFsdWUoKTtcblx0XHRcdHJldHVybiBpc0FnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSh2YWx1ZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fZ2V0U2FuZGJveENvbmZpZ3VyZWRFbmFibGVkVmFsdWUoKTtcblx0XHRyZXR1cm4gaXNBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVJ1bnRpbWVJbmZvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9ydW50aW1lUmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcnVudGltZVJlc29sdmVkID0gdHJ1ZTtcblx0XHRjb25zdCBydW50aW1lSW5mbyA9IGF3YWl0IHRoaXMuX2hvc3QuZ2V0UnVudGltZUluZm8oKTtcblx0XHR0aGlzLl9hcHBSb290ID0gcnVudGltZUluZm8uYXBwUm9vdDtcblx0XHR0aGlzLl9leGVjUGF0aCA9IHJ1bnRpbWVJbmZvLmV4ZWNQYXRoO1xuXHRcdHRoaXMuX3J1bkFzTm9kZSA9IHJ1bnRpbWVJbmZvLnJ1bkFzTm9kZSA/PyBmYWxzZTtcblx0XHR0aGlzLl91c2VySG9tZSA9IGF3YWl0IHRoaXMuX2hvc3QuZ2V0VXNlckhvbWUoKTtcblx0XHR0aGlzLl9zcnRQYXRoID0gdGhpcy5fcGF0aEpvaW4odGhpcy5fYXBwUm9vdCwgJ25vZGVfbW9kdWxlcycsICdAdnNjb2RlJywgJ3NhbmRib3gtcnVudGltZScsICdkaXN0JywgJ2NsaS5qcycpO1xuXHRcdGNvbnN0IG5hdGl2ZU1vZHVsZXNEaXIgPSBydW50aW1lSW5mby5uYXRpdmVNb2R1bGVzRGlyID8/ICdub2RlX21vZHVsZXMnO1xuXHRcdGNvbnN0IHJnUGxhdGZvcm0gPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyAnd2luMzInIDogdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggPyAnZGFyd2luJyA6ICdsaW51eCc7XG5cdFx0Y29uc3QgcmdCaW5hcnkgPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyAncmcuZXhlJyA6ICdyZyc7XG5cdFx0dGhpcy5fcmdQYXRoID0gdGhpcy5fcGF0aEpvaW4odGhpcy5fYXBwUm9vdCwgbmF0aXZlTW9kdWxlc0RpciwgJ0B2c2NvZGUnLCAncmlwZ3JlcC11bml2ZXJzYWwnLCAnYmluJywgYCR7cmdQbGF0Zm9ybX0tJHthcmNofWAsIHJnQmluYXJ5KTtcblx0XHR0aGlzLl9teGNQYXRoID0gdGhpcy5fd2luZG93c014Y1J1bnRpbWUuZ2V0RXhlY3V0YWJsZVBhdGgodGhpcy5fYXBwUm9vdCwgbmF0aXZlTW9kdWxlc0RpciwgcnVudGltZUluZm8uYXJjaCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVTYW5kYm94Q29uZmlnKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKChhd2FpdCB0aGlzLmlzRW5hYmxlZCgpKSAmJiAhdGhpcy5fdGVtcERpcikge1xuXHRcdFx0YXdhaXQgdGhpcy5faW5pdFRlbXBEaXIoKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl90ZW1wRGlyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbG93TmV0d29yayA9IHRoaXMuX2NvbW1hbmRBbGxvd05ldHdvcmsgfHwgYXdhaXQgdGhpcy5pc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkKCk7XG5cdFx0Y29uc3QgbGludXhGaWxlU3lzdGVtU2V0dGluZyA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHRcdD8gdGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxJVGVybWluYWxTYW5kYm94RmlsZVN5c3RlbVNldHRpbmc+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hMaW51eEZpbGVTeXN0ZW0pID8/IHt9XG5cdFx0XHQ6IHt9O1xuXHRcdGNvbnN0IG1hY0ZpbGVTeXN0ZW1TZXR0aW5nID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2hcblx0XHRcdD8gdGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxJVGVybWluYWxTYW5kYm94RmlsZVN5c3RlbVNldHRpbmc+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hNYWNGaWxlU3lzdGVtKSA/PyB7fVxuXHRcdFx0OiB7fTtcblx0XHRjb25zdCB3aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcgPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3Ncblx0XHRcdD8gdGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxJVGVybWluYWxTYW5kYm94RmlsZVN5c3RlbVNldHRpbmc+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzRmlsZVN5c3RlbSkgPz8ge31cblx0XHRcdDoge307XG5cdFx0Y29uc3Qgd2luZG93c1NjaGVtYVZlcnNpb24gPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3Ncblx0XHRcdD8gdGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxzdHJpbmc+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzU2NoZW1hVmVyc2lvbilcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJ1bnRpbWVTZXR0aW5nID0ge1xuXHRcdFx0Li4udGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFkdmFuY2VkUnVudGltZSksXG5cdFx0XHQuLi4odGhpcy5fZW5hYmxlV2Vha2VyTmVzdGVkU2FuZGJveCA/IHsgZW5hYmxlV2Vha2VyTmVzdGVkU2FuZGJveDogdHJ1ZSB9IDogdW5kZWZpbmVkKSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbW1hbmRSdW50aW1lU2V0dGluZyA9IGdldFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uRm9yQ29tbWFuZHModGhpcy5fb3MsIHRoaXMuX2NvbW1hbmRBbGxvd0xpc3RDb21tYW5kRGV0YWlscyk7XG5cdFx0Y29uc3QgY29tbWFuZFJ1bnRpbWVBbGxvd1JlYWRQYXRocyA9IHRoaXMuX2dldENvbW1hbmRSdW50aW1lRmlsZVN5c3RlbVBhdGhzKGNvbW1hbmRSdW50aW1lU2V0dGluZywgJ2FsbG93UmVhZCcpO1xuXHRcdGNvbnN0IGNvbW1hbmRSdW50aW1lQWxsb3dXcml0ZVBhdGhzID0gdGhpcy5fZ2V0Q29tbWFuZFJ1bnRpbWVGaWxlU3lzdGVtUGF0aHMoY29tbWFuZFJ1bnRpbWVTZXR0aW5nLCAnYWxsb3dXcml0ZScpO1xuXHRcdGNvbnN0IGNvbmZpZ0ZpbGVVcmkgPSBVUkkuam9pblBhdGgodGhpcy5fdGVtcERpciwgYHZzY29kZS1zYW5kYm94LXNldHRpbmdzLSR7dGhpcy5fc2FuZGJveFNldHRpbmdzSWR9Lmpzb25gKTtcblx0XHRjb25zdCBjb25maWdGaWxlUGF0aCA9IHRoaXMuX2dldFVyaVBhdGgoY29uZmlnRmlsZVVyaSk7XG5cdFx0bGV0IGFsbG93V3JpdGVQYXRoczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgYWxsb3dSZWFkUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGRlbnlSZWFkUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGRlbnlXcml0ZVBhdGhzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBmaWxlc3lzdGVtUG9saWN5ID0gYXdhaXQgdGhpcy5fZ2V0V2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3koKTtcblx0XHRcdGNvbnN0IGVudiA9IGF3YWl0IHRoaXMuX2dldFdpbmRvd3NNeGNFbnZpcm9ubWVudCgpO1xuXHRcdFx0YWxsb3dXcml0ZVBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhbXG5cdFx0XHRcdC4uLmF3YWl0IHRoaXMuX3VwZGF0ZUFsbG93V3JpdGVQYXRoc1dpdGhXb3Jrc3BhY2VGb2xkZXJzKHdpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1dyaXRlKSxcblx0XHRcdFx0Li4uZmlsZXN5c3RlbVBvbGljeS5yZWFkd3JpdGVQYXRoc1xuXHRcdFx0XSk7XG5cdFx0XHRhbGxvd1JlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoWy4uLih3aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcuYWxsb3dSZWFkID8/IFtdKSwgLi4uZmlsZXN5c3RlbVBvbGljeS5yZWFkb25seVBhdGhzXSk7XG5cdFx0XHRkZW55UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyh3aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQgPz8gW10pO1xuXHRcdFx0dGhpcy5fd2luZG93c014Y0Vudmlyb25tZW50ID0gZW52O1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIHtcblx0XHRcdGFsbG93V3JpdGVQYXRocyA9IChhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKGF3YWl0IHRoaXMuX3VwZGF0ZUFsbG93V3JpdGVQYXRoc1dpdGhXb3Jrc3BhY2VGb2xkZXJzKG1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93V3JpdGUsIGNvbW1hbmRSdW50aW1lQWxsb3dXcml0ZVBhdGhzKSkpLmZpbHRlcihwYXRoID0+IHBhdGggIT09IGNvbmZpZ0ZpbGVQYXRoKTtcblx0XHRcdGFsbG93UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhhd2FpdCB0aGlzLl91cGRhdGVBbGxvd1JlYWRQYXRoc1dpdGhBbGxvd1dyaXRlKG1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93UmVhZCwgYWxsb3dXcml0ZVBhdGhzLCBjb21tYW5kUnVudGltZUFsbG93UmVhZFBhdGhzKSk7XG5cdFx0XHRkZW55UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyh0aGlzLl91cGRhdGVEZW55UmVhZFBhdGhzV2l0aEhvbWUoWy4uLihtYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55UmVhZCA/PyBbXSksIGNvbmZpZ0ZpbGVQYXRoXSkpO1xuXHRcdFx0ZGVueVdyaXRlUGF0aHMgPSBtYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55V3JpdGUgPyBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKG1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlXcml0ZSkgOiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSB7XG5cdFx0XHRhbGxvd1dyaXRlUGF0aHMgPSAoYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhhd2FpdCB0aGlzLl91cGRhdGVBbGxvd1dyaXRlUGF0aHNXaXRoV29ya3NwYWNlRm9sZGVycyhsaW51eEZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93V3JpdGUsIGNvbW1hbmRSdW50aW1lQWxsb3dXcml0ZVBhdGhzKSkpLmZpbHRlcihwYXRoID0+IHBhdGggIT09IGNvbmZpZ0ZpbGVQYXRoKTtcblx0XHRcdGFsbG93UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhhd2FpdCB0aGlzLl91cGRhdGVBbGxvd1JlYWRQYXRoc1dpdGhBbGxvd1dyaXRlKGxpbnV4RmlsZVN5c3RlbVNldHRpbmcuYWxsb3dSZWFkLCBhbGxvd1dyaXRlUGF0aHMsIGNvbW1hbmRSdW50aW1lQWxsb3dSZWFkUGF0aHMpKTtcblx0XHRcdGRlbnlSZWFkUGF0aHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKHRoaXMuX3VwZGF0ZURlbnlSZWFkUGF0aHNXaXRoSG9tZShbLi4uKGxpbnV4RmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQgPz8gW10pLCBjb25maWdGaWxlUGF0aF0pKTtcblx0XHRcdGRlbnlXcml0ZVBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhsaW51eEZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlXcml0ZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNhbmRib3hTZXR0aW5ncyA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IGF3YWl0IHRoaXMuX3dpbmRvd3NNeGNSdW50aW1lLmNyZWF0ZUNvbmZpZyh7XG5cdFx0XHRjb21tYW5kOiB0aGlzLl9jb21tYW5kTGluZSA/PyAnJyxcblx0XHRcdHNoZWxsOiB0aGlzLl9jb21tYW5kU2hlbGwsXG5cdFx0XHRjd2Q6IHRoaXMuX2NvbW1hbmRDd2QgPz8gdGhpcy5fZ2V0RGVmYXVsdFdpbmRvd3NNeGNDd2QoKSxcblx0XHRcdHRlbXBEaXI6IHRoaXMuX3RlbXBEaXIsXG5cdFx0XHRzY2hlbWFWZXJzaW9uOiB3aW5kb3dzU2NoZW1hVmVyc2lvbixcblx0XHRcdGFsbG93TmV0d29yayxcblx0XHRcdGFsbG93UmVhZFBhdGhzLFxuXHRcdFx0YWxsb3dXcml0ZVBhdGhzLFxuXHRcdFx0ZGVueVJlYWRQYXRocyxcblx0XHRcdGVudjogdGhpcy5fd2luZG93c014Y0Vudmlyb25tZW50ID8/IFtdLFxuXHRcdH0sIHRoaXMuX2J1aWxkU2FuZGJveFBheWxvYWQpIDoge1xuXHRcdFx0bmV0d29yazogYWxsb3dOZXR3b3JrID8geyBhbGxvd2VkRG9tYWluczogW10sIGRlbmllZERvbWFpbnM6IFtdLCBlbmFibGVkOiBmYWxzZSB9IDogdGhpcy5nZXRSZXNvbHZlZE5ldHdvcmtEb21haW5zKCksXG5cdFx0XHRmaWxlc3lzdGVtOiB7XG5cdFx0XHRcdGRlbnlSZWFkOiBkZW55UmVhZFBhdGhzLFxuXHRcdFx0XHRhbGxvd1JlYWQ6IGFsbG93UmVhZFBhdGhzLFxuXHRcdFx0XHRhbGxvd1dyaXRlOiBhbGxvd1dyaXRlUGF0aHMsXG5cdFx0XHRcdGRlbnlXcml0ZTogZGVueVdyaXRlUGF0aHMsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0aWYgKHRoaXMuX29zICE9PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0Y29uc3Qgc2FuZGJveFJ1bnRpbWVTZXR0aW5ncyA9IHNhbmRib3hTZXR0aW5ncyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdHRoaXMuX21lcmdlQWRkaXRpb25hbFNhbmRib3hDb25maWdQcm9wZXJ0aWVzKHNhbmRib3hSdW50aW1lU2V0dGluZ3MsIHJ1bnRpbWVTZXR0aW5nKTtcblx0XHRcdHRoaXMuX21lcmdlQWRkaXRpb25hbFNhbmRib3hDb25maWdQcm9wZXJ0aWVzKHNhbmRib3hSdW50aW1lU2V0dGluZ3MsIGNvbW1hbmRSdW50aW1lU2V0dGluZyk7XG5cdFx0XHRpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIHtcblx0XHRcdFx0c2FuZGJveFJ1bnRpbWVTZXR0aW5ncy5hbGxvd1B0eSA/Pz0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc2FuZGJveENvbmZpZ1BhdGggPSBjb25maWdGaWxlUGF0aDtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGaWxlKGNvbmZpZ0ZpbGVVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc2FuZGJveFNldHRpbmdzLCBudWxsLCAnXFx0JykpLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gdGhpcy5fc2FuZGJveENvbmZpZ1BhdGg7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRGaWxlU3lzdGVtQWNjZXNzUGF0aHMoY29uZmlnRmlsZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1BY2Nlc3NQYXRocz4ge1xuXHRcdGNvbnN0IGxpbnV4RmlsZVN5c3RlbVNldHRpbmcgPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4XG5cdFx0XHQ/IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8SVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtKSA/PyB7fVxuXHRcdFx0OiB7fTtcblx0XHRjb25zdCBtYWNGaWxlU3lzdGVtU2V0dGluZyA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoXG5cdFx0XHQ/IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8SVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TWFjRmlsZVN5c3RlbSkgPz8ge31cblx0XHRcdDoge307XG5cdFx0Y29uc3Qgd2luZG93c0ZpbGVTeXN0ZW1TZXR0aW5nID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzXG5cdFx0XHQ/IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8SVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0ZpbGVTeXN0ZW0pID8/IHt9XG5cdFx0XHQ6IHt9O1xuXHRcdGNvbnN0IGNvbW1hbmRSdW50aW1lU2V0dGluZyA9IGdldFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uRm9yQ29tbWFuZHModGhpcy5fb3MsIHRoaXMuX2NvbW1hbmRBbGxvd0xpc3RDb21tYW5kRGV0YWlscyk7XG5cdFx0Y29uc3QgY29tbWFuZFJ1bnRpbWVBbGxvd1JlYWRQYXRocyA9IHRoaXMuX2dldENvbW1hbmRSdW50aW1lRmlsZVN5c3RlbVBhdGhzKGNvbW1hbmRSdW50aW1lU2V0dGluZywgJ2FsbG93UmVhZCcpO1xuXHRcdGNvbnN0IGNvbW1hbmRSdW50aW1lQWxsb3dXcml0ZVBhdGhzID0gdGhpcy5fZ2V0Q29tbWFuZFJ1bnRpbWVGaWxlU3lzdGVtUGF0aHMoY29tbWFuZFJ1bnRpbWVTZXR0aW5nLCAnYWxsb3dXcml0ZScpO1xuXHRcdGxldCBhbGxvd1dyaXRlUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGFsbG93UmVhZFBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBkZW55UmVhZFBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBkZW55V3JpdGVQYXRoczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0Y29uc3QgZmlsZXN5c3RlbVBvbGljeSA9IGF3YWl0IHRoaXMuX2dldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCk7XG5cdFx0XHRhbGxvd1dyaXRlUGF0aHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKFtcblx0XHRcdFx0Li4uYXdhaXQgdGhpcy5fdXBkYXRlQWxsb3dXcml0ZVBhdGhzV2l0aFdvcmtzcGFjZUZvbGRlcnMod2luZG93c0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93V3JpdGUpLFxuXHRcdFx0XHQuLi5maWxlc3lzdGVtUG9saWN5LnJlYWR3cml0ZVBhdGhzXG5cdFx0XHRdKTtcblx0XHRcdGFsbG93UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhbLi4uKHdpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQgPz8gW10pLCAuLi5maWxlc3lzdGVtUG9saWN5LnJlYWRvbmx5UGF0aHNdKTtcblx0XHRcdGRlbnlSZWFkUGF0aHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKHdpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5kZW55UmVhZCA/PyBbXSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCkge1xuXHRcdFx0YWxsb3dXcml0ZVBhdGhzID0gKGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoYXdhaXQgdGhpcy5fdXBkYXRlQWxsb3dXcml0ZVBhdGhzV2l0aFdvcmtzcGFjZUZvbGRlcnMobWFjRmlsZVN5c3RlbVNldHRpbmcuYWxsb3dXcml0ZSwgY29tbWFuZFJ1bnRpbWVBbGxvd1dyaXRlUGF0aHMpKSkuZmlsdGVyKHBhdGggPT4gcGF0aCAhPT0gY29uZmlnRmlsZVBhdGgpO1xuXHRcdFx0YWxsb3dSZWFkUGF0aHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKGF3YWl0IHRoaXMuX3VwZGF0ZUFsbG93UmVhZFBhdGhzV2l0aEFsbG93V3JpdGUobWFjRmlsZVN5c3RlbVNldHRpbmcuYWxsb3dSZWFkLCBhbGxvd1dyaXRlUGF0aHMsIGNvbW1hbmRSdW50aW1lQWxsb3dSZWFkUGF0aHMpKTtcblx0XHRcdGRlbnlSZWFkUGF0aHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKHRoaXMuX3VwZGF0ZURlbnlSZWFkUGF0aHNXaXRoSG9tZShbLi4uKG1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlSZWFkID8/IFtdKSwgLi4uKGNvbmZpZ0ZpbGVQYXRoID8gW2NvbmZpZ0ZpbGVQYXRoXSA6IFtdKV0pKTtcblx0XHRcdGRlbnlXcml0ZVBhdGhzID0gbWFjRmlsZVN5c3RlbVNldHRpbmcuZGVueVdyaXRlID8gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhtYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55V3JpdGUpIDogdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCkge1xuXHRcdFx0YWxsb3dXcml0ZVBhdGhzID0gKGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoYXdhaXQgdGhpcy5fdXBkYXRlQWxsb3dXcml0ZVBhdGhzV2l0aFdvcmtzcGFjZUZvbGRlcnMobGludXhGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1dyaXRlLCBjb21tYW5kUnVudGltZUFsbG93V3JpdGVQYXRocykpKS5maWx0ZXIocGF0aCA9PiBwYXRoICE9PSBjb25maWdGaWxlUGF0aCk7XG5cdFx0XHRhbGxvd1JlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoYXdhaXQgdGhpcy5fdXBkYXRlQWxsb3dSZWFkUGF0aHNXaXRoQWxsb3dXcml0ZShsaW51eEZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93UmVhZCwgYWxsb3dXcml0ZVBhdGhzLCBjb21tYW5kUnVudGltZUFsbG93UmVhZFBhdGhzKSk7XG5cdFx0XHRkZW55UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyh0aGlzLl91cGRhdGVEZW55UmVhZFBhdGhzV2l0aEhvbWUoWy4uLihsaW51eEZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlSZWFkID8/IFtdKSwgLi4uKGNvbmZpZ0ZpbGVQYXRoID8gW2NvbmZpZ0ZpbGVQYXRoXSA6IFtdKV0pKTtcblx0XHRcdGRlbnlXcml0ZVBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhsaW51eEZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlXcml0ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWxsb3dSZWFkUGF0aHMsIGFsbG93V3JpdGVQYXRocywgZGVueVJlYWRQYXRocywgZGVueVdyaXRlUGF0aHMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhc0ZpbGVTeXN0ZW1BY2Nlc3MocGVybWlzc2lvbjogVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc1Blcm1pc3Npb24sIHBhdGg6IHN0cmluZywgYWNjZXNzUGF0aHM6IElUZXJtaW5hbFNhbmRib3hGaWxlU3lzdGVtQWNjZXNzUGF0aHMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXNvbHZlZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRoKHBhdGgpO1xuXHRcdGlmIChwZXJtaXNzaW9uID09PSAnd3JpdGUnKSB7XG5cdFx0XHRpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzICYmIHRoaXMuX21hdGNoZXNBbnlGaWxlU3lzdGVtUGF0aChyZXNvbHZlZFBhdGhzLCBhY2Nlc3NQYXRocy5kZW55UmVhZFBhdGhzKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fbWF0Y2hlc0FueUZpbGVTeXN0ZW1QYXRoKHJlc29sdmVkUGF0aHMsIGFjY2Vzc1BhdGhzLmRlbnlXcml0ZVBhdGhzID8/IFtdKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hlc0FueUZpbGVTeXN0ZW1QYXRoKHJlc29sdmVkUGF0aHMsIGFjY2Vzc1BhdGhzLmFsbG93V3JpdGVQYXRocyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21hdGNoZXNBbnlGaWxlU3lzdGVtUGF0aChyZXNvbHZlZFBhdGhzLCBbLi4uYWNjZXNzUGF0aHMuYWxsb3dSZWFkUGF0aHMsIC4uLmFjY2Vzc1BhdGhzLmFsbG93V3JpdGVQYXRoc10pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuICF0aGlzLl9tYXRjaGVzQW55RmlsZVN5c3RlbVBhdGgocmVzb2x2ZWRQYXRocywgYWNjZXNzUGF0aHMuZGVueVJlYWRQYXRocyk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaGVzQW55RmlsZVN5c3RlbVBhdGgocGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdLCBtYXRjaGVyczogcmVhZG9ubHkgc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcGF0aHMuc29tZShwYXRoID0+IG1hdGNoZXJzLnNvbWUobWF0Y2hlciA9PiB0aGlzLl9tYXRjaGVzRmlsZVN5c3RlbVBhdGgocGF0aCwgbWF0Y2hlcikpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYSBjYW5kaWRhdGUgZmlsZXN5c3RlbSBwYXRoIGlzIGNvdmVyZWQgYnkgYSBzYW5kYm94IGFsbG93L2Rlbnlcblx0ICogbWF0Y2hlci4gQm90aCB2YWx1ZXMgYXJlIG5vcm1hbGl6ZWQgd2l0aCB0aGUgdGFyZ2V0IHNhbmRib3ggT1Mgc2VtYW50aWNzIGJlZm9yZVxuXHQgKiBjb21wYXJpc29uLiBOb24tZ2xvYiBtYXRjaGVycyBhcmUgdHJlYXRlZCBhcyBleGFjdC1vci1wYXJlbnQgbWF0Y2hlczsgZ2xvYlxuXHQgKiBtYXRjaGVycyBhcmUgZXZhbHVhdGVkIHdpdGggVlMgQ29kZSdzIGdsb2IgbWF0Y2hlci5cblx0ICpcblx0ICogRXhhbXBsZXM6XG5cdCAqIC0gTGludXgvbWFjT1M6IGAvd29ya3NwYWNlL3Byb2plY3Qvc3JjL2ZpbGUudHNgIG1hdGNoZXMgYC93b3Jrc3BhY2UvcHJvamVjdGAuXG5cdCAqIC0gTGludXgvbWFjT1M6IGAvd29ya3NwYWNlL3Byb2plY3QyL2ZpbGUudHNgIGRvZXMgbm90IG1hdGNoIGAvd29ya3NwYWNlL3Byb2plY3RgLlxuXHQgKiAtIFdpbmRvd3M6IGBDOlxcUmVwb1xcc3JjXFxmaWxlLnRzYCBtYXRjaGVzIGBjOi9yZXBvYCBiZWNhdXNlIG1hdGNoaW5nIGlzXG5cdCAqICAgY2FzZS1pbnNlbnNpdGl2ZSBhbmQgYmFja3NsYXNoZXMgYXJlIG5vcm1hbGl6ZWQgdG8gYC9gLlxuXHQgKiAtIEdsb2I6IGAvd29ya3NwYWNlL3Byb2plY3QvcGFja2FnZS5qc29uYCBtYXRjaGVzIGAvd29ya3NwYWNlL3Byb2plY3QvKi5qc29uYC5cblx0ICovXG5cdHByaXZhdGUgX21hdGNoZXNGaWxlU3lzdGVtUGF0aChwYXRoOiBzdHJpbmcsIG1hdGNoZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gdGhpcy5fbm9ybWFsaXplRmlsZVN5c3RlbUFjY2Vzc1BhdGgocGF0aCk7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZE1hdGNoZXIgPSB0aGlzLl9ub3JtYWxpemVGaWxlU3lzdGVtQWNjZXNzUGF0aChtYXRjaGVyLCB0cnVlKTtcblx0XHRjb25zdCBpZ25vcmVDYXNlID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzO1xuXHRcdGlmICh0aGlzLl9jb250YWluc0dsb2JQYXR0ZXJuKG5vcm1hbGl6ZWRNYXRjaGVyKSkge1xuXHRcdFx0cmV0dXJuIGdsb2JNYXRjaChub3JtYWxpemVkTWF0Y2hlciwgbm9ybWFsaXplZFBhdGgsIHsgaWdub3JlQ2FzZSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVTeXN0ZW1QYXRoRXh0VXJpLmlzRXF1YWxPclBhcmVudCh0aGlzLl90b0ZpbGVTeXN0ZW1BY2Nlc3NVcmkobm9ybWFsaXplZFBhdGgpLCB0aGlzLl90b0ZpbGVTeXN0ZW1BY2Nlc3NVcmkobm9ybWFsaXplZE1hdGNoZXIpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIG5vcm1hbGl6ZWQgc2FuZGJveCBmaWxlc3lzdGVtIHBhdGggaW50byBhIHBzZXVkbyBVUkkgc28gdGhlIGNvbW1vblxuXHQgKiBgRXh0VXJpLmlzRXF1YWxPclBhcmVudGAgY29tcGFyZXIgY2FuIGJlIHVzZWQgaW5zdGVhZCBvZiBkZXByZWNhdGVkIHN0cmluZ1xuXHQgKiBwYXRoIGhlbHBlcnMuIEEgbm9uLWBmaWxlYCBzY2hlbWUgaXMgaW50ZW50aW9uYWw6IGl0IGtlZXBzIGNvbXBhcmlzb24gb24gdGhlXG5cdCAqIFVSSSBwYXRoIGNvbXBvbmVudCBhbmQgYXZvaWRzIGNvbnZlcnRpbmcgdGhyb3VnaCB0aGUgaG9zdCBPUycgbmF0aXZlIGBmc1BhdGhgXG5cdCAqIHJ1bGVzLCB3aGljaCBtYXkgZGlmZmVyIGZyb20gdGhlIHNhbmRib3ggdGFyZ2V0IE9TLlxuXHQgKlxuXHQgKiBFeGFtcGxlczpcblx0ICogLSBgL3dvcmtzcGFjZS9wcm9qZWN0YCBiZWNvbWVzIGB0ZXJtaW5hbC1zYW5kYm94LXBhdGg6L3dvcmtzcGFjZS9wcm9qZWN0YC5cblx0ICogLSBgQzovUmVwb2AgYmVjb21lcyBgdGVybWluYWwtc2FuZGJveC1wYXRoOi9DOi9SZXBvYCBzbyBXaW5kb3dzIGRyaXZlIHBhdGhzXG5cdCAqICAgYXJlIHN0aWxsIHZhbGlkIFVSSSBwYXRocyBmb3IgY29tcGFyaXNvbi5cblx0ICovXG5cdHByaXZhdGUgX3RvRmlsZVN5c3RlbUFjY2Vzc1VyaShwYXRoOiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlcm1pbmFsLXNhbmRib3gtcGF0aCcsIHBhdGg6IHBhdGguc3RhcnRzV2l0aCgnLycpID8gcGF0aCA6IGAvJHtwYXRofWAgfSk7XG5cdH1cblxuXHQvKipcblx0ICogTm9ybWFsaXplcyBhIHBhdGggb3IgbWF0Y2hlciBpbnRvIHRoZSBmb3JtIHVzZWQgZm9yIHNhbmRib3ggYWNjZXNzIGNoZWNrcy5cblx0ICogT24gV2luZG93cywgYmFja3NsYXNoZXMgYXJlIGNvbnZlcnRlZCB0byBgL2AgYW5kIFVSSS1zaGFwZWQgZHJpdmUgcGF0aHMgbGlrZVxuXHQgKiBgL0M6L1VzZXJzL21lYCBhcmUgY29udmVydGVkIHRvIGBDOi9Vc2Vycy9tZWAuIFVubGVzcyBgcHJlc2VydmVHbG9iYCBpcyB0cnVlXG5cdCAqIGZvciBhIGdsb2IgbWF0Y2hlciwgdGhlIHBhdGggaXMgUE9TSVgtbm9ybWFsaXplZCB0byByZW1vdmUgcmVkdW5kYW50IGAuYC9gLi5gXG5cdCAqIHNlZ21lbnRzLiBUcmFpbGluZyBzbGFzaGVzIGFyZSByZW1vdmVkIGV4Y2VwdCBmb3IgZmlsZXN5c3RlbSByb290cy5cblx0ICpcblx0ICogRXhhbXBsZXM6XG5cdCAqIC0gTGludXgvbWFjT1M6IGAvd29ya3NwYWNlLy4uL3dvcmtzcGFjZS9hcHAvYCBiZWNvbWVzIGAvd29ya3NwYWNlL2FwcGAuXG5cdCAqIC0gV2luZG93czogYEM6XFxVc2Vyc1xcbWVcXHByb2plY3RcXGAgYmVjb21lcyBgQzovVXNlcnMvbWUvcHJvamVjdGAuXG5cdCAqIC0gV2luZG93czogYC9DOi9Vc2Vycy9tZS9wcm9qZWN0YCBiZWNvbWVzIGBDOi9Vc2Vycy9tZS9wcm9qZWN0YC5cblx0ICogLSBHbG9iIHdpdGggYHByZXNlcnZlR2xvYj10cnVlYDogYC93b3Jrc3BhY2UvcHJvamVjdC8qLmpzb25gIGtlZXBzIHRoZSBnbG9iXG5cdCAqICAgcGF0dGVybiBpbnRhY3QgZm9yIGBnbG9iTWF0Y2hgLlxuXHQgKi9cblx0cHJpdmF0ZSBfbm9ybWFsaXplRmlsZVN5c3RlbUFjY2Vzc1BhdGgocGF0aDogc3RyaW5nLCBwcmVzZXJ2ZUdsb2I6IGJvb2xlYW4gPSBmYWxzZSk6IHN0cmluZyB7XG5cdFx0bGV0IG5vcm1hbGl6ZWRQYXRoID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gcGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJykgOiBwYXRoO1xuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgL15cXC9bYS16QS1aXTooJHxcXC8pLy50ZXN0KG5vcm1hbGl6ZWRQYXRoKSkge1xuXHRcdFx0bm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVkUGF0aC5zbGljZSgxKTtcblx0XHR9XG5cdFx0aWYgKCFwcmVzZXJ2ZUdsb2IgfHwgIXRoaXMuX2NvbnRhaW5zR2xvYlBhdHRlcm4obm9ybWFsaXplZFBhdGgpKSB7XG5cdFx0XHRub3JtYWxpemVkUGF0aCA9IHBvc2l4Lm5vcm1hbGl6ZShub3JtYWxpemVkUGF0aCk7XG5cdFx0fVxuXHRcdGlmIChub3JtYWxpemVkUGF0aC5sZW5ndGggPiAxICYmIG5vcm1hbGl6ZWRQYXRoLmVuZHNXaXRoKCcvJykgJiYgIS9eW2EtekEtWl06XFwvJC8udGVzdChub3JtYWxpemVkUGF0aCkpIHtcblx0XHRcdG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplZFBhdGgucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG5cdFx0fVxuXHRcdHJldHVybiBub3JtYWxpemVkUGF0aDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRhaW5zR2xvYlBhdHRlcm4ocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9bKj97XFxbXS8udGVzdChwYXRoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1aWxkU2FuZGJveFBheWxvYWQgPSAoY29tbWFuZExpbmU6IHN0cmluZywgcG9saWN5OiBJV2luZG93c014Y1NhbmRib3hQb2xpY3ksIHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcsIGNvbnRhaW5lck5hbWU/OiBzdHJpbmcsIGNvbnRhaW5tZW50PzogSVdpbmRvd3NNeGNQb2xpY3lDb250YWlubWVudCk6IFByb21pc2U8SVdpbmRvd3NNeGNDb25maWcgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdC5idWlsZFdpbmRvd3NNeGNTYW5kYm94UGF5bG9hZChjb21tYW5kTGluZSwgcG9saWN5LCB3b3JraW5nRGlyZWN0b3J5LCBjb250YWluZXJOYW1lLCBjb250YWlubWVudCk7XG5cdH07XG5cblx0cHJpdmF0ZSBfZ2V0Q29tbWFuZFJ1bnRpbWVGaWxlU3lzdGVtUGF0aHMocnVudGltZVNldHRpbmc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBrZXk6ICdhbGxvd1JlYWQnIHwgJ2FsbG93V3JpdGUnKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGZpbGVzeXN0ZW0gPSBydW50aW1lU2V0dGluZy5maWxlc3lzdGVtO1xuXHRcdGlmICghdGhpcy5faXNPYmplY3RGb3JTYW5kYm94Q29uZmlnTWVyZ2UoZmlsZXN5c3RlbSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXRocyA9IGZpbGVzeXN0ZW1ba2V5XTtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGF0aHMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhdGhzLmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+IHR5cGVvZiBwYXRoID09PSAnc3RyaW5nJyk7XG5cdH1cblxuXHRwcml2YXRlIF9tZXJnZUFkZGl0aW9uYWxTYW5kYm94Q29uZmlnUHJvcGVydGllcyh0YXJnZXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBhZGRpdGlvbmFsOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGFkZGl0aW9uYWwpKSB7XG5cdFx0XHRpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0YXJnZXQsIGtleSkpIHtcblx0XHRcdFx0dGFyZ2V0W2tleV0gPSB2YWx1ZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4aXN0aW5nVmFsdWUgPSB0YXJnZXRba2V5XTtcblx0XHRcdGlmICh0aGlzLl9pc09iamVjdEZvclNhbmRib3hDb25maWdNZXJnZShleGlzdGluZ1ZhbHVlKSAmJiB0aGlzLl9pc09iamVjdEZvclNhbmRib3hDb25maWdNZXJnZSh2YWx1ZSkpIHtcblx0XHRcdFx0dGhpcy5fbWVyZ2VBZGRpdGlvbmFsU2FuZGJveENvbmZpZ1Byb3BlcnRpZXMoZXhpc3RpbmdWYWx1ZSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzT2JqZWN0Rm9yU2FuZGJveENvbmZpZ01lcmdlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCk6IFByb21pc2U8SVdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5PiB7XG5cdFx0aWYgKCF0aGlzLl93aW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSkge1xuXHRcdFx0dGhpcy5fd2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3kgPSBhd2FpdCB0aGlzLl9ob3N0LmdldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCkgPz8geyByZWFkb25seVBhdGhzOiBbXSwgcmVhZHdyaXRlUGF0aHM6IFtdIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93aW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFdpbmRvd3NNeGNFbnZpcm9ubWVudCgpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0aWYgKCF0aGlzLl93aW5kb3dzTXhjRW52aXJvbm1lbnQpIHtcblx0XHRcdHRoaXMuX3dpbmRvd3NNeGNFbnZpcm9ubWVudCA9IGF3YWl0IHRoaXMuX2hvc3QuZ2V0V2luZG93c014Y0Vudmlyb25tZW50KCkgPz8gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93aW5kb3dzTXhjRW52aXJvbm1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9wYXRoSm9pbiA9ICguLi5zZWdtZW50czogc3RyaW5nW10pID0+IHtcblx0XHRjb25zdCBwYXRoID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIgOiBwb3NpeDtcblx0XHRyZXR1cm4gcGF0aC5qb2luKC4uLnNlZ21lbnRzKTtcblx0fTtcblxuXHRwcml2YXRlIF9wYXRoRGlybmFtZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIgOiBwb3NpeCkuZGlybmFtZShwYXRoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFVyaVBhdGgodXJpOiBVUkkpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyB0aGlzLl93aW5kb3dzTXhjUnVudGltZS50b1dpbmRvd3NQYXRoKHVyaSkgOiB1cmkucGF0aDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luaXRUZW1wRGlyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuaXNFbmFibGVkKCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX25lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlID0gdHJ1ZTtcblx0XHR0aGlzLl90ZW1wRGlyID0gYXdhaXQgdGhpcy5faG9zdC5nZXRTYW5kYm94VGVtcERpcigpO1xuXHRcdGlmICh0aGlzLl90ZW1wRGlyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIodGhpcy5fdGVtcERpcik7XG5cdFx0XHR0aGlzLl9kZWZhdWx0V3JpdGVQYXRocy5wdXNoKHRoaXMuX2dldFVyaVBhdGgodGhpcy5fdGVtcERpcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1Rlcm1pbmFsU2FuZGJveEVuZ2luZTogQ2Fubm90IGNyZWF0ZSBzYW5kYm94IHNldHRpbmdzIGZpbGUgYmVjYXVzZSBubyB0bXBEaXIgaXMgYXZhaWxhYmxlIGluIHRoaXMgZW52aXJvbm1lbnQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVBbGxvd1dyaXRlUGF0aHNXaXRoV29ya3NwYWNlRm9sZGVycyhjb25maWd1cmVkQWxsb3dXcml0ZTogc3RyaW5nW10gfCB1bmRlZmluZWQsIGNvbW1hbmRSdW50aW1lQWxsb3dXcml0ZTogc3RyaW5nW10gPSBbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCB3cml0ZVJvb3RQYXRocyA9IHRoaXMuX2hvc3QuZ2V0V3JpdGVSb290cygpLm1hcChmb2xkZXIgPT4gdGhpcy5fZ2V0VXJpUGF0aChmb2xkZXIpKTtcblx0XHRyZXR1cm4gWy4uLm5ldyBTZXQoWy4uLndyaXRlUm9vdFBhdGhzLCAuLi50aGlzLl9kZWZhdWx0V3JpdGVQYXRocywgLi4uYXdhaXQgdGhpcy5fZ2V0V29ya3NwYWNlU3RvcmFnZVJlYWRQYXRocygpLCAuLi4oY29uZmlndXJlZEFsbG93V3JpdGUgPz8gW10pLCAuLi5jb21tYW5kUnVudGltZUFsbG93V3JpdGVdKV07XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVEZW55UmVhZFBhdGhzV2l0aEhvbWUoY29uZmlndXJlZERlbnlSZWFkOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHN0cmluZ1tdIHtcblx0XHQvLyBUT0RPOiBPbiBXaW5kb3dzLCBkZW55IHJlYWQgb24gaG9tZSBkaXJlY3RvcnkuXG5cdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIFsuLi5uZXcgU2V0KGNvbmZpZ3VyZWREZW55UmVhZCA/PyBbXSldO1xuXHRcdH1cblx0XHRjb25zdCB1c2VySG9tZSA9IHRoaXMuX3VzZXJIb21lID8gdGhpcy5fZ2V0VXJpUGF0aCh0aGlzLl91c2VySG9tZSkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIFsuLi5uZXcgU2V0KFsuLi4oY29uZmlndXJlZERlbnlSZWFkID8/IFtdKSwgLi4uKHVzZXJIb21lID8gW3VzZXJIb21lXSA6IFtdKV0pXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUFsbG93UmVhZFBhdGhzV2l0aEFsbG93V3JpdGUoY29uZmlndXJlZEFsbG93UmVhZDogc3RyaW5nW10gfCB1bmRlZmluZWQsIGFsbG93V3JpdGU6IHN0cmluZ1tdLCBjb21tYW5kUnVudGltZUFsbG93UmVhZDogc3RyaW5nW10gPSBbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gWy4uLm5ldyBTZXQoWy4uLihjb25maWd1cmVkQWxsb3dSZWFkID8/IFtdKSwgLi4uZ2V0VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEZvckNvbW1hbmRzKHRoaXMuX29zLCB0aGlzLl9jb21tYW5kQWxsb3dMaXN0S2V5d29yZHMsIHRoaXMuX2NvbW1hbmRBbGxvd0xpc3RDb21tYW5kRGV0YWlscyksIC4uLmNvbW1hbmRSdW50aW1lQWxsb3dSZWFkLCAuLi50aGlzLl9nZXRTYW5kYm94UnVudGltZVJlYWRQYXRocygpLCAuLi5hd2FpdCB0aGlzLl9nZXRXb3Jrc3BhY2VTdG9yYWdlUmVhZFBhdGhzKCksIC4uLmFsbG93V3JpdGVdKV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKHBhdGhzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCByZXNvbHZlZFBhdGhzID0gYXdhaXQgUHJvbWlzZS5hbGwoKHBhdGhzID8/IFtdKS5tYXAocGF0aCA9PiB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGgocGF0aCkpKTtcblx0XHRjb25zdCBzZWVuUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRyZXR1cm4gcmVzb2x2ZWRQYXRocy5mbGF0KCkuZmlsdGVyKHBhdGggPT4ge1xuXHRcdFx0Y29uc3QgY29tcGFyaXNvbktleSA9IHRoaXMuX2dldEZpbGVTeXN0ZW1QYXRoQ29tcGFyaXNvbktleShwYXRoKTtcblx0XHRcdGlmIChzZWVuUGF0aHMuaGFzKGNvbXBhcmlzb25LZXkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHNlZW5QYXRocy5hZGQoY29tcGFyaXNvbktleSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEZpbGVTeXN0ZW1QYXRoQ29tcGFyaXNvbktleShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyBwYXRoLnJlcGxhY2UoL1xcLy9nLCAnXFxcXCcpLnRvTG93ZXJDYXNlKCkgOiBwYXRoO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUZpbGVTeXN0ZW1QYXRoKHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBleHBhbmRlZFBhdGggPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4ID8gdGhpcy5fZXhwYW5kSG9tZVBhdGgocGF0aCkgOiBwYXRoO1xuXHRcdGlmICghdGhpcy5faXNBYnNvbHV0ZUZpbGVTeXN0ZW1QYXRoKGV4cGFuZGVkUGF0aCkpIHtcblx0XHRcdHJldHVybiBbZXhwYW5kZWRQYXRoXTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVhbHBhdGggPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFscGF0aCh0aGlzLl90b0ZpbGVTeXN0ZW1SZXNvdXJjZShleHBhbmRlZFBhdGgpKTtcblx0XHRcdGNvbnN0IHJlc29sdmVkUGF0aCA9IHJlYWxwYXRoID8gdGhpcy5fZ2V0VXJpUGF0aChyZWFscGF0aCkgOiB1bmRlZmluZWQ7XG5cdFx0XHQvLyBLZWVwIHRoZSBleHBhbmRlZCBwYXRoICh0aGUgY29uZmlndXJlZCBwYXRoIGFmdGVyIGhvbWUgZXhwYW5zaW9uKSBzbyBwZXJtaXNzaW9ucyBhcHBseSB3aGVuIGFjY2Vzc2VkIHRocm91Z2ggdGhlIHN5bWxpbmsuXG5cdFx0XHQvLyBBbHNvIGluY2x1ZGUgdGhlIHJlc29sdmVkIHBhdGggKHRoZSBjYW5vbmljYWwgc3ltbGluayB0YXJnZXQpIHNvIHRoZSBzYW1lIHBlcm1pc3Npb25zIGFwcGx5IHdoZW4gYWNjZXNzZWQgZGlyZWN0bHkuXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZWRQYXRoICYmIHJlc29sdmVkUGF0aCAhPT0gZXhwYW5kZWRQYXRoID8gW2V4cGFuZGVkUGF0aCwgcmVzb2x2ZWRQYXRoXSA6IFtleHBhbmRlZFBhdGhdO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtleHBhbmRlZFBhdGhdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzQWJzb2x1dGVGaWxlU3lzdGVtUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHdpbjMyIDogcG9zaXgpLmlzQWJzb2x1dGUocGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIF90b0ZpbGVTeXN0ZW1SZXNvdXJjZShwYXRoOiBzdHJpbmcpOiBVUkkge1xuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1dpbmRvd3NGaWxlU3lzdGVtUmVzb3VyY2UocGF0aCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91c2VySG9tZT8ud2l0aCh7IHBhdGggfSkgPz8gdGhpcy5fdGVtcERpcj8ud2l0aCh7IHBhdGggfSkgPz8gdGhpcy5faG9zdC5nZXRXcml0ZVJvb3RzKClbMF0/LndpdGgoeyBwYXRoIH0pID8/IFVSSS5maWxlKHBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9XaW5kb3dzRmlsZVN5c3RlbVJlc291cmNlKHBhdGg6IHN0cmluZyk6IFVSSSB7XG5cdFx0Ly8gTm9ybWFsaXplIFdpbmRvd3Mgc2VwYXJhdG9ycyBmb3IgVVJJIHBhcnNpbmcsIGUuZy4gYEM6XFxVc2Vyc1xcbWVgIGJlY29tZXMgYEM6L1VzZXJzL21lYC5cblx0XHRjb25zdCBub3JtYWxpemVkUGF0aCA9IHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuXHRcdC8vIE1hdGNoIFVOQyBwYXRocywgZS5nLiBgLy9zZXJ2ZXIvc2hhcmUvZm9sZGVyYCBiZWNvbWVzIGBmaWxlOi8vc2VydmVyL3NoYXJlL2ZvbGRlcmAuXG5cdFx0aWYgKC9eXFwvXFwvW14vXS8udGVzdChub3JtYWxpemVkUGF0aCkpIHtcblx0XHRcdGNvbnN0IGZpcnN0UGF0aFNlcGFyYXRvciA9IG5vcm1hbGl6ZWRQYXRoLmluZGV4T2YoJy8nLCAyKTtcblx0XHRcdGlmIChmaXJzdFBhdGhTZXBhcmF0b3IgPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBhdXRob3JpdHk6IG5vcm1hbGl6ZWRQYXRoLnNsaWNlKDIpLCBwYXRoOiAnLycgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgYXV0aG9yaXR5OiBub3JtYWxpemVkUGF0aC5zbGljZSgyLCBmaXJzdFBhdGhTZXBhcmF0b3IpLCBwYXRoOiBub3JtYWxpemVkUGF0aC5zbGljZShmaXJzdFBhdGhTZXBhcmF0b3IpIHx8ICcvJyB9KTtcblx0XHR9XG5cdFx0Ly8gTWF0Y2ggZHJpdmUtbGV0dGVyIHBhdGhzLCBlLmcuIGBDOi9Vc2Vycy9tZWAgYmVjb21lcyBgZmlsZTovLy9jOi9Vc2Vycy9tZWAuXG5cdFx0aWYgKC9eW2EtekEtWl06KCR8XFwvKS8udGVzdChub3JtYWxpemVkUGF0aCkpIHtcblx0XHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiBgLyR7bm9ybWFsaXplZFBhdGhbMF0udG9Mb3dlckNhc2UoKX0ke25vcm1hbGl6ZWRQYXRoLnNsaWNlKDEpfWAgfSk7XG5cdFx0fVxuXHRcdC8vIE1hdGNoIFVSSS1zaGFwZWQgZHJpdmUgcGF0aHMsIGUuZy4gYC9DOi9Vc2Vycy9tZWAgYmVjb21lcyBgZmlsZTovLy9jOi9Vc2Vycy9tZWAuXG5cdFx0aWYgKC9eXFwvW2EtekEtWl06KCR8XFwvKS8udGVzdChub3JtYWxpemVkUGF0aCkpIHtcblx0XHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiBgLyR7bm9ybWFsaXplZFBhdGhbMV0udG9Mb3dlckNhc2UoKX0ke25vcm1hbGl6ZWRQYXRoLnNsaWNlKDIpfWAgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiBub3JtYWxpemVkUGF0aCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2V4cGFuZEhvbWVQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLl91c2VySG9tZT8ucGF0aDtcblx0XHRpZiAoIXVzZXJIb21lKSB7XG5cdFx0XHRyZXR1cm4gcGF0aDtcblx0XHR9XG5cdFx0aWYgKHBhdGggPT09ICd+Jykge1xuXHRcdFx0cmV0dXJuIHVzZXJIb21lO1xuXHRcdH1cblx0XHRpZiAocGF0aC5zdGFydHNXaXRoKCd+LycpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGF0aEpvaW4odXNlckhvbWUsIHBhdGguc2xpY2UoMikpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGF0aDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNhbmRib3hSdW50aW1lUmVhZFBhdGhzKCk6IHN0cmluZ1tdIHtcblx0XHRpZiAoIXRoaXMuX2FwcFJvb3QpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3dpbmRvd3NNeGNSdW50aW1lLmdldFJ1bnRpbWVSZWFkUGF0aHModGhpcy5fYXBwUm9vdCwgdGhpcy5fbXhjUGF0aCk7XG5cdFx0fVxuXHRcdGNvbnN0IHBhdGhzOiBzdHJpbmdbXSA9IFt0aGlzLl9hcHBSb290XTtcblx0XHRpZiAodGhpcy5fZXhlY1BhdGgpIHtcblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBbdGhpcy5fZXhlY1BhdGgsIHRoaXMuX3BhdGhEaXJuYW1lKHRoaXMuX2V4ZWNQYXRoKV0pIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc1BhdGhVbmRlckFwcFJvb3QocGF0aCkpIHtcblx0XHRcdFx0XHRwYXRocy5wdXNoKHBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBwYXRocztcblx0fVxuXG5cdHByaXZhdGUgX2lzUGF0aFVuZGVyQXBwUm9vdChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX2FwcFJvb3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhdGggPT09IHRoaXMuX2FwcFJvb3QgfHwgcGF0aC5zdGFydHNXaXRoKGAke3RoaXMuX2FwcFJvb3R9JHt0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyB3aW4zMi5zZXAgOiBwb3NpeC5zZXB9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRXb3Jrc3BhY2VTdG9yYWdlUmVhZFBhdGhzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCByb290ID0gYXdhaXQgdGhpcy5faG9zdC5nZXRXb3Jrc3BhY2VTdG9yYWdlUmVhZFJvb3QoKTtcblx0XHRyZXR1cm4gcm9vdCA/IFt0aGlzLl9nZXRVcmlQYXRoKHJvb3QpXSA6IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdFdpbmRvd3NNeGNDd2QoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdC5nZXRXcml0ZVJvb3RzKClbMF07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTYW5kYm94Q29uZmlndXJlZEVuYWJsZWRWYWx1ZSgpOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUge1xuXHRcdHJldHVybiB0aGlzLl9ob3N0LmdldFNhbmRib3hTZXR0aW5nPEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZT4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQpID8/IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmY7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTYW5kYm94Q29uZmlndXJlZFdpbmRvd3NFbmFibGVkVmFsdWUoKTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlIHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxBZ2VudFNhbmRib3hFbmFibGVkVmFsdWU+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzRW5hYmxlZCkgPz8gQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZjtcblx0fVxuXG5cdHByaXZhdGUgX2lzU2FuZGJveEFsbG93TmV0d29ya0NvbmZpZ3VyZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8Ym9vbGVhbj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29yaykgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0U2FuZGJveENvbmZpZ3VyZWRXaW5kb3dzRW5hYmxlZFZhbHVlKCkgPT09IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5BbGxvd05ldHdvcms7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRTYW5kYm94Q29uZmlndXJlZEVuYWJsZWRWYWx1ZSgpID09PSBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuQWxsb3dOZXR3b3JrO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXJlVW5zYW5kYm94ZWRDb21tYW5kc0FsbG93ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8Ym9vbGVhbj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9hcmVSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0c0FsbG93ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8Ym9vbGVhbj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzKSA9PT0gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGlCQUFpQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLE9BQU8sYUFBYTtBQUM3QixTQUFTLGlCQUFpQixVQUFVO0FBQ3BDLFNBQVMsWUFBWTtBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNB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
