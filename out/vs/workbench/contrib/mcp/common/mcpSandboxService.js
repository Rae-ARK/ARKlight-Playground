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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../base/common/network.js";
import { dirname, posix, win32 } from "../../../../base/common/path.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { arch } from "../../../../base/common/process.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget, ConfigurationTargetToString } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IMcpResourceScannerService } from "../../../../platform/mcp/common/mcpResourceScannerService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { McpServerTransportType } from "./mcpTypes.js";
const IMcpSandboxService = createDecorator("mcpSandboxService");
let McpSandboxService = class extends Disposable {
  constructor(_fileService, _environmentService, _logService, _mcpResourceScannerService, _remoteAgentService) {
    super();
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._mcpResourceScannerService = _mcpResourceScannerService;
    this._remoteAgentService = _remoteAgentService;
    this._defaultAllowedDomains = ["registry.npmjs.org"];
    // Default allowed domains that are commonly needed for MCP servers, even if the user doesn't specify them in their sandbox config
    this._defaultAllowWritePaths = ["~/.npm"];
    this._sandboxConfigPerConfigurationTarget = /* @__PURE__ */ new Map();
    this._pathJoin = (os, ...segments) => {
      const path = os === OperatingSystem.Windows ? win32 : posix;
      return path.join(...segments);
    };
    this._getPathDelimiter = async (remoteAuthority) => {
      const os = await this._getOperatingSystem(remoteAuthority);
      return os === OperatingSystem.Windows ? win32.delimiter : posix.delimiter;
    };
    this._sandboxSettingsId = generateUuid();
    this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();
  }
  async isEnabled(serverDef, remoteAuthority) {
    const os = await this._getOperatingSystem(remoteAuthority);
    if (os === OperatingSystem.Windows) {
      return false;
    }
    return !!serverDef.sandboxEnabled;
  }
  async launchInSandboxIfEnabled(serverDef, launch, remoteAuthority, configTarget) {
    if (launch.type !== McpServerTransportType.Stdio) {
      return launch;
    }
    if (await this.isEnabled(serverDef, remoteAuthority)) {
      this._logService.trace(`McpSandboxService: Launching with config target ${configTarget}`);
      const launchDetails = await this._resolveSandboxLaunchDetails(configTarget, remoteAuthority, launch.sandbox, launch.cwd);
      const quotedCommand = this._quoteShellArgument(launch.command);
      const quotedArgs = launch.args.map((arg) => this._quoteShellArgument(arg));
      const sandboxArgs = this._getSandboxCommandArgs(quotedCommand, quotedArgs, launchDetails.sandboxConfigPath);
      const sandboxEnv = await this._getSandboxEnvVariables(launch.env, launchDetails.tempDir, launchDetails.rgPath, remoteAuthority);
      if (launchDetails.srtPath) {
        if (launchDetails.execPath) {
          return {
            ...launch,
            command: launchDetails.execPath,
            args: [launchDetails.srtPath, ...sandboxArgs],
            env: sandboxEnv,
            type: McpServerTransportType.Stdio
          };
        } else {
          return {
            ...launch,
            command: launchDetails.srtPath,
            args: sandboxArgs,
            env: sandboxEnv,
            type: McpServerTransportType.Stdio
          };
        }
      }
      if (!launchDetails.execPath) {
        this._logService.warn("McpSandboxService: execPath is unavailable, launching without sandbox runtime wrapper");
      }
      this._logService.debug(`McpSandboxService: launch details for server ${serverDef.label} - command: ${launch.command}, args: ${launch.args.join(" ")}`);
    }
    return launch;
  }
  getSandboxConfigSuggestionMessage(serverLabel, potentialBlocks, existingSandboxConfig) {
    const suggestions = this._getSandboxConfigSuggestions(potentialBlocks, existingSandboxConfig);
    if (!suggestions) {
      return void 0;
    }
    const allowWriteList = suggestions.allowWrite;
    const allowedDomainsList = suggestions.allowedDomains;
    const suggestionLines = [];
    if (allowedDomainsList.length) {
      const shown = allowedDomainsList.map((domain) => `"${domain}"`).join(", ");
      suggestionLines.push(localize("mcpSandboxSuggestion.allowedDomains", "Add to `sandbox.network.allowedDomains`: {0}", shown));
    }
    if (allowWriteList.length) {
      const shown = allowWriteList.map((path) => `"${path}"`).join(", ");
      suggestionLines.push(localize("mcpSandboxSuggestion.allowWrite", "Add to `sandbox.filesystem.allowWrite`: {0}", shown));
    }
    const sandboxConfig = {};
    if (allowedDomainsList.length) {
      sandboxConfig.network = { allowedDomains: [...allowedDomainsList] };
    }
    if (allowWriteList.length) {
      sandboxConfig.filesystem = { allowWrite: [...allowWriteList] };
    }
    return {
      message: localize(
        "mcpSandboxSuggestion.message",
        "The MCP server {0} reported potential sandbox blocks. VS Code found possible sandbox configuration updates:\n{1}",
        serverLabel,
        suggestionLines.join("\n")
      ),
      sandboxConfig
    };
  }
  async applySandboxConfigSuggestion(serverDef, mcpResource, configTarget, potentialBlocks, suggestedSandboxConfig) {
    const scanTarget = this._toMcpResourceTarget(configTarget);
    let didChange = false;
    await this._mcpResourceScannerService.updateSandboxConfig((data) => {
      const existingSandbox = data.sandbox;
      const suggestedAllowedDomains = suggestedSandboxConfig?.network?.allowedDomains ?? [];
      const suggestedAllowWrite = suggestedSandboxConfig?.filesystem?.allowWrite ?? [];
      const currentAllowedDomains = new Set(existingSandbox?.network?.allowedDomains ?? []);
      for (const domain of suggestedAllowedDomains) {
        if (domain && !currentAllowedDomains.has(domain)) {
          currentAllowedDomains.add(domain);
        }
      }
      const currentAllowWrite = new Set(existingSandbox?.filesystem?.allowWrite ?? []);
      for (const path of suggestedAllowWrite) {
        if (path && !currentAllowWrite.has(path)) {
          currentAllowWrite.add(path);
        }
      }
      if (suggestedAllowedDomains.length === 0 && suggestedAllowWrite.length === 0) {
        return data;
      }
      didChange = true;
      const nextSandboxConfig = {};
      if (currentAllowedDomains.size > 0) {
        nextSandboxConfig.network = {
          ...existingSandbox?.network,
          allowedDomains: [...currentAllowedDomains]
        };
      }
      if (currentAllowWrite.size > 0) {
        nextSandboxConfig.filesystem = {
          ...existingSandbox?.filesystem,
          allowWrite: [...currentAllowWrite]
        };
      }
      return {
        ...data,
        sandbox: nextSandboxConfig
      };
    }, mcpResource, scanTarget);
    return didChange;
  }
  _getSandboxConfigSuggestions(potentialBlocks, existingSandboxConfig) {
    if (!potentialBlocks.length) {
      return void 0;
    }
    const allowWrite = /* @__PURE__ */ new Set();
    const allowedDomains = /* @__PURE__ */ new Set();
    const existingAllowWrite = new Set(existingSandboxConfig?.filesystem?.allowWrite ?? []);
    const existingAllowedDomains = new Set(existingSandboxConfig?.network?.allowedDomains ?? []);
    for (const block of potentialBlocks) {
      if (block.kind === "network" && block.host && !existingAllowedDomains.has(block.host)) {
        allowedDomains.add(block.host);
      }
      if (block.kind === "filesystem" && block.path && !existingAllowWrite.has(block.path)) {
        allowWrite.add(block.path);
      }
    }
    if (!allowWrite.size && !allowedDomains.size) {
      return void 0;
    }
    return {
      allowWrite: [...allowWrite],
      allowedDomains: [...allowedDomains]
    };
  }
  _toMcpResourceTarget(configTarget) {
    switch (configTarget) {
      case ConfigurationTarget.USER:
      case ConfigurationTarget.USER_LOCAL:
      case ConfigurationTarget.USER_REMOTE:
        return ConfigurationTarget.USER;
      case ConfigurationTarget.WORKSPACE:
        return ConfigurationTarget.WORKSPACE;
      case ConfigurationTarget.WORKSPACE_FOLDER:
        return ConfigurationTarget.WORKSPACE_FOLDER;
      default:
        return ConfigurationTarget.USER;
    }
  }
  async _resolveSandboxLaunchDetails(configTarget, remoteAuthority, sandboxConfig, launchCwd) {
    const os = await this._getOperatingSystem(remoteAuthority);
    if (os === OperatingSystem.Windows) {
      return { execPath: void 0, srtPath: void 0, rgPath: void 0, sandboxConfigPath: void 0, tempDir: void 0 };
    }
    const appRoot = await this._getAppRoot(remoteAuthority);
    const execPath = await this._getExecPath(os, appRoot, remoteAuthority);
    const tempDir = await this._getTempDir(remoteAuthority);
    const srtPath = this._pathJoin(os, appRoot, "node_modules", "@vscode", "sandbox-runtime", "dist", "cli.js");
    const rgPlatform = os === OperatingSystem.Macintosh ? "darwin" : "linux";
    const rgPath = this._pathJoin(os, appRoot, "node_modules", "@vscode", "ripgrep-universal", "bin", `${rgPlatform}-${arch}`, "rg");
    const sandboxConfigPath = tempDir ? await this._updateSandboxConfig(tempDir, configTarget, sandboxConfig, launchCwd) : void 0;
    this._logService.debug(`McpSandboxService: Updated sandbox config path: ${sandboxConfigPath}`);
    return { execPath, srtPath, rgPath, sandboxConfigPath, tempDir };
  }
  async _getExecPath(os, appRoot, remoteAuthority) {
    if (remoteAuthority) {
      return this._pathJoin(os, appRoot, "node");
    }
    return void 0;
  }
  async _getSandboxEnvVariables(baseEnv, tempDir, rgPath, remoteAuthority) {
    let env = { ...baseEnv };
    if (tempDir) {
      env = { ...env, TMPDIR: tempDir.path, SRT_DEBUG: "true", NODE_USE_ENV_PROXY: "1" };
    }
    if (rgPath) {
      env = { ...env, PATH: env["PATH"] ? `${env["PATH"]}${await this._getPathDelimiter(remoteAuthority)}${dirname(rgPath)}` : dirname(rgPath) };
    }
    if (!remoteAuthority) {
      env = { ...env, ELECTRON_RUN_AS_NODE: "1" };
    }
    env["VSCODE_INSPECTOR_OPTIONS"] = null;
    return env;
  }
  _getSandboxCommandArgs(command, args, sandboxConfigPath) {
    const result = [];
    if (sandboxConfigPath) {
      result.push("--settings", sandboxConfigPath);
      result.push("--");
    }
    result.push(command, ...args);
    return result;
  }
  async _getRemoteEnv(remoteAuthority) {
    if (!remoteAuthority) {
      return null;
    }
    return this._remoteEnvDetailsPromise;
  }
  async _getOperatingSystem(remoteAuthority) {
    const remoteEnv = await this._getRemoteEnv(remoteAuthority);
    if (remoteEnv) {
      return remoteEnv.os;
    }
    return OS;
  }
  async _getAppRoot(remoteAuthority) {
    const remoteEnv = await this._getRemoteEnv(remoteAuthority);
    if (remoteEnv) {
      return remoteEnv.appRoot.path;
    }
    return dirname(FileAccess.asFileUri("").path);
  }
  async _getTempDir(remoteAuthority) {
    const remoteEnv = await this._getRemoteEnv(remoteAuthority);
    if (remoteEnv) {
      return remoteEnv.tmpDir;
    }
    const environmentService = this._environmentService;
    const tempDir = environmentService.tmpDir;
    if (!tempDir) {
      this._logService.warn("McpSandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment");
    }
    return tempDir;
  }
  async _updateSandboxConfig(tempDir, configTarget, sandboxConfig, launchCwd) {
    const normalizedSandboxConfig = this._withDefaultSandboxConfig(sandboxConfig, launchCwd);
    let configFileUri;
    const configTargetKey = ConfigurationTargetToString(configTarget);
    if (this._sandboxConfigPerConfigurationTarget.has(configTargetKey)) {
      configFileUri = URI.parse(this._sandboxConfigPerConfigurationTarget.get(configTargetKey));
    } else {
      configFileUri = URI.joinPath(tempDir, `vscode-${configTargetKey}-mcp-sandbox-settings-${this._sandboxSettingsId}.json`);
      this._sandboxConfigPerConfigurationTarget.set(configTargetKey, configFileUri.toString());
    }
    await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(normalizedSandboxConfig, null, "	")), { overwrite: true });
    return configFileUri.path;
  }
  // this method merges the default allowWrite paths and allowedDomains with the ones provided in the sandbox config, to ensure that the default necessary paths and domains are always included in the sandbox config used for launching,
  //  even if they are not explicitly specified in the config provided by the user or the MCP server config.
  _withDefaultSandboxConfig(sandboxConfig, launchCwd) {
    const mergedAllowWrite = new Set(sandboxConfig?.filesystem?.allowWrite ?? []);
    for (const defaultAllowWrite of this._getDefaultAllowWrite(launchCwd ? [launchCwd] : void 0)) {
      if (defaultAllowWrite) {
        mergedAllowWrite.add(defaultAllowWrite);
      }
    }
    const mergedAllowedDomains = new Set(sandboxConfig?.network?.allowedDomains ?? []);
    for (const defaultAllowedDomain of this._defaultAllowedDomains) {
      if (defaultAllowedDomain) {
        mergedAllowedDomains.add(defaultAllowedDomain);
      }
    }
    return {
      ...sandboxConfig,
      network: {
        allowedDomains: [...mergedAllowedDomains],
        deniedDomains: sandboxConfig?.network?.deniedDomains ?? []
      },
      filesystem: {
        allowWrite: [...mergedAllowWrite],
        denyRead: sandboxConfig?.filesystem?.denyRead ?? [],
        denyWrite: sandboxConfig?.filesystem?.denyWrite ?? []
      }
    };
  }
  _getDefaultAllowWrite(directories) {
    for (const launchCwd of directories ?? []) {
      const trimmed = launchCwd.trim();
      if (trimmed) {
        this._defaultAllowWritePaths.push(trimmed);
      }
    }
    return this._defaultAllowWritePaths;
  }
  _quoteShellArgument(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
};
McpSandboxService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IMcpResourceScannerService),
  __decorateParam(4, IRemoteAgentService)
], McpSandboxService);
export {
  IMcpSandboxService,
  McpSandboxService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2FuZGJveFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFyY2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIENvbmZpZ3VyYXRpb25UYXJnZXRUb1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLCBNY3BSZXNvdXJjZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1jcFNhbmRib3hDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2ssIE1jcFNlcnZlckRlZmluaXRpb24sIE1jcFNlcnZlckxhdW5jaCwgTWNwU2VydmVyVHJhbnNwb3J0U3RkaW8sIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcblxuXG5leHBvcnQgY29uc3QgSU1jcFNhbmRib3hTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElNY3BTYW5kYm94U2VydmljZT4oJ21jcFNhbmRib3hTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcFNhbmRib3hTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRsYXVuY2hJblNhbmRib3hJZkVuYWJsZWQoc2VydmVyRGVmOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBsYXVuY2g6IE1jcFNlcnZlckxhdW5jaCwgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8TWNwU2VydmVyTGF1bmNoPjtcblx0aXNFbmFibGVkKHNlcnZlckRlZjogTWNwU2VydmVyRGVmaW5pdGlvbiwgc2VydmVyTGFiZWw/OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRnZXRTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbk1lc3NhZ2Uoc2VydmVyTGFiZWw6IHN0cmluZywgcG90ZW50aWFsQmxvY2tzOiByZWFkb25seSBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrW10sIGV4aXN0aW5nU2FuZGJveENvbmZpZz86IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbik6IFNhbmRib3hDb25maWdTdWdnZXN0aW9uUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRhcHBseVNhbmRib3hDb25maWdTdWdnZXN0aW9uKHNlcnZlckRlZjogTWNwU2VydmVyRGVmaW5pdGlvbiwgbWNwUmVzb3VyY2U6IFVSSSwgY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCBwb3RlbnRpYWxCbG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSwgc3VnZ2VzdGVkU2FuZGJveENvbmZpZz86IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbik6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbnR5cGUgU2FuZGJveENvbmZpZ1N1Z2dlc3Rpb25zID0ge1xuXHRhbGxvd1dyaXRlOiByZWFkb25seSBzdHJpbmdbXTtcblx0YWxsb3dlZERvbWFpbnM6IHJlYWRvbmx5IHN0cmluZ1tdO1xufTtcblxudHlwZSBTYW5kYm94Q29uZmlnU3VnZ2VzdGlvblJlc3VsdCA9IHtcblx0bWVzc2FnZTogc3RyaW5nO1xuXHRzYW5kYm94Q29uZmlnOiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb247XG59O1xuXG50eXBlIFNhbmRib3hMYXVuY2hEZXRhaWxzID0ge1xuXHRleGVjUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzcnRQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJnUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzYW5kYm94Q29uZmlnUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0ZW1wRGlyOiBVUkkgfCB1bmRlZmluZWQ7XG59O1xuXG5leHBvcnQgY2xhc3MgTWNwU2FuZGJveFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcFNhbmRib3hTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3NhbmRib3hTZXR0aW5nc0lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlbW90ZUVudkRldGFpbHNQcm9taXNlOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRBbGxvd2VkRG9tYWluczogcmVhZG9ubHkgc3RyaW5nW10gPSBbJ3JlZ2lzdHJ5Lm5wbWpzLm9yZyddOyAvLyBEZWZhdWx0IGFsbG93ZWQgZG9tYWlucyB0aGF0IGFyZSBjb21tb25seSBuZWVkZWQgZm9yIE1DUCBzZXJ2ZXJzLCBldmVuIGlmIHRoZSB1c2VyIGRvZXNuJ3Qgc3BlY2lmeSB0aGVtIGluIHRoZWlyIHNhbmRib3ggY29uZmlnXG5cdHByaXZhdGUgX2RlZmF1bHRBbGxvd1dyaXRlUGF0aHM6IHN0cmluZ1tdID0gWyd+Ly5ucG0nXTtcblx0cHJpdmF0ZSBfc2FuZGJveENvbmZpZ1BlckNvbmZpZ3VyYXRpb25UYXJnZXQ6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcFJlc291cmNlU2Nhbm5lclNlcnZpY2U6IElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zYW5kYm94U2V0dGluZ3NJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuX3JlbW90ZUVudkRldGFpbHNQcm9taXNlID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBpc0VuYWJsZWQoc2VydmVyRGVmOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLCByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBvcyA9IGF3YWl0IHRoaXMuX2dldE9wZXJhdGluZ1N5c3RlbShyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICEhc2VydmVyRGVmLnNhbmRib3hFbmFibGVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGxhdW5jaEluU2FuZGJveElmRW5hYmxlZChzZXJ2ZXJEZWY6IE1jcFNlcnZlckRlZmluaXRpb24sIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoLCByZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTxNY3BTZXJ2ZXJMYXVuY2g+IHtcblx0XHRpZiAobGF1bmNoLnR5cGUgIT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8pIHtcblx0XHRcdHJldHVybiBsYXVuY2g7XG5cdFx0fVxuXHRcdGlmIChhd2FpdCB0aGlzLmlzRW5hYmxlZChzZXJ2ZXJEZWYsIHJlbW90ZUF1dGhvcml0eSkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE1jcFNhbmRib3hTZXJ2aWNlOiBMYXVuY2hpbmcgd2l0aCBjb25maWcgdGFyZ2V0ICR7Y29uZmlnVGFyZ2V0fWApO1xuXHRcdFx0Y29uc3QgbGF1bmNoRGV0YWlscyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVTYW5kYm94TGF1bmNoRGV0YWlscyhjb25maWdUYXJnZXQsIHJlbW90ZUF1dGhvcml0eSwgbGF1bmNoLnNhbmRib3gsIGxhdW5jaC5jd2QpO1xuXHRcdFx0Y29uc3QgcXVvdGVkQ29tbWFuZCA9IHRoaXMuX3F1b3RlU2hlbGxBcmd1bWVudChsYXVuY2guY29tbWFuZCk7XG5cdFx0XHRjb25zdCBxdW90ZWRBcmdzID0gbGF1bmNoLmFyZ3MubWFwKGFyZyA9PiB0aGlzLl9xdW90ZVNoZWxsQXJndW1lbnQoYXJnKSk7XG5cdFx0XHRjb25zdCBzYW5kYm94QXJncyA9IHRoaXMuX2dldFNhbmRib3hDb21tYW5kQXJncyhxdW90ZWRDb21tYW5kLCBxdW90ZWRBcmdzLCBsYXVuY2hEZXRhaWxzLnNhbmRib3hDb25maWdQYXRoKTtcblx0XHRcdGNvbnN0IHNhbmRib3hFbnYgPSBhd2FpdCB0aGlzLl9nZXRTYW5kYm94RW52VmFyaWFibGVzKGxhdW5jaC5lbnYsIGxhdW5jaERldGFpbHMudGVtcERpciwgbGF1bmNoRGV0YWlscy5yZ1BhdGgsIHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRpZiAobGF1bmNoRGV0YWlscy5zcnRQYXRoKSB7XG5cdFx0XHRcdGlmIChsYXVuY2hEZXRhaWxzLmV4ZWNQYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdC4uLmxhdW5jaCxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IGxhdW5jaERldGFpbHMuZXhlY1BhdGgsXG5cdFx0XHRcdFx0XHRhcmdzOiBbbGF1bmNoRGV0YWlscy5zcnRQYXRoLCAuLi5zYW5kYm94QXJnc10sXG5cdFx0XHRcdFx0XHRlbnY6IHNhbmRib3hFbnYsXG5cdFx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdC4uLmxhdW5jaCxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IGxhdW5jaERldGFpbHMuc3J0UGF0aCxcblx0XHRcdFx0XHRcdGFyZ3M6IHNhbmRib3hBcmdzLFxuXHRcdFx0XHRcdFx0ZW52OiBzYW5kYm94RW52LFxuXHRcdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWxhdW5jaERldGFpbHMuZXhlY1BhdGgpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdNY3BTYW5kYm94U2VydmljZTogZXhlY1BhdGggaXMgdW5hdmFpbGFibGUsIGxhdW5jaGluZyB3aXRob3V0IHNhbmRib3ggcnVudGltZSB3cmFwcGVyJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBNY3BTYW5kYm94U2VydmljZTogbGF1bmNoIGRldGFpbHMgZm9yIHNlcnZlciAke3NlcnZlckRlZi5sYWJlbH0gLSBjb21tYW5kOiAke2xhdW5jaC5jb21tYW5kfSwgYXJnczogJHtsYXVuY2guYXJncy5qb2luKCcgJyl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBsYXVuY2g7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb25NZXNzYWdlKHNlcnZlckxhYmVsOiBzdHJpbmcsIHBvdGVudGlhbEJsb2NrczogcmVhZG9ubHkgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9ja1tdLCBleGlzdGluZ1NhbmRib3hDb25maWc/OiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24pOiBTYW5kYm94Q29uZmlnU3VnZ2VzdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnMgPSB0aGlzLl9nZXRTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbnMocG90ZW50aWFsQmxvY2tzLCBleGlzdGluZ1NhbmRib3hDb25maWcpO1xuXHRcdGlmICghc3VnZ2VzdGlvbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsb3dXcml0ZUxpc3QgPSBzdWdnZXN0aW9ucy5hbGxvd1dyaXRlO1xuXHRcdGNvbnN0IGFsbG93ZWREb21haW5zTGlzdCA9IHN1Z2dlc3Rpb25zLmFsbG93ZWREb21haW5zO1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25MaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGlmIChhbGxvd2VkRG9tYWluc0xpc3QubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBzaG93biA9IGFsbG93ZWREb21haW5zTGlzdC5tYXAoZG9tYWluID0+IGBcIiR7ZG9tYWlufVwiYCkuam9pbignLCAnKTtcblx0XHRcdHN1Z2dlc3Rpb25MaW5lcy5wdXNoKGxvY2FsaXplKCdtY3BTYW5kYm94U3VnZ2VzdGlvbi5hbGxvd2VkRG9tYWlucycsIFwiQWRkIHRvIGBzYW5kYm94Lm5ldHdvcmsuYWxsb3dlZERvbWFpbnNgOiB7MH1cIiwgc2hvd24pKTtcblx0XHR9XG5cblx0XHRpZiAoYWxsb3dXcml0ZUxpc3QubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBzaG93biA9IGFsbG93V3JpdGVMaXN0Lm1hcChwYXRoID0+IGBcIiR7cGF0aH1cImApLmpvaW4oJywgJyk7XG5cdFx0XHRzdWdnZXN0aW9uTGluZXMucHVzaChsb2NhbGl6ZSgnbWNwU2FuZGJveFN1Z2dlc3Rpb24uYWxsb3dXcml0ZScsIFwiQWRkIHRvIGBzYW5kYm94LmZpbGVzeXN0ZW0uYWxsb3dXcml0ZWA6IHswfVwiLCBzaG93bikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhbmRib3hDb25maWc6IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiA9IHt9O1xuXHRcdGlmIChhbGxvd2VkRG9tYWluc0xpc3QubGVuZ3RoKSB7XG5cdFx0XHRzYW5kYm94Q29uZmlnLm5ldHdvcmsgPSB7IGFsbG93ZWREb21haW5zOiBbLi4uYWxsb3dlZERvbWFpbnNMaXN0XSB9O1xuXHRcdH1cblx0XHRpZiAoYWxsb3dXcml0ZUxpc3QubGVuZ3RoKSB7XG5cdFx0XHRzYW5kYm94Q29uZmlnLmZpbGVzeXN0ZW0gPSB7IGFsbG93V3JpdGU6IFsuLi5hbGxvd1dyaXRlTGlzdF0gfTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdCdtY3BTYW5kYm94U3VnZ2VzdGlvbi5tZXNzYWdlJyxcblx0XHRcdFx0XCJUaGUgTUNQIHNlcnZlciB7MH0gcmVwb3J0ZWQgcG90ZW50aWFsIHNhbmRib3ggYmxvY2tzLiBWUyBDb2RlIGZvdW5kIHBvc3NpYmxlIHNhbmRib3ggY29uZmlndXJhdGlvbiB1cGRhdGVzOlxcbnsxfVwiLFxuXHRcdFx0XHRzZXJ2ZXJMYWJlbCxcblx0XHRcdFx0c3VnZ2VzdGlvbkxpbmVzLmpvaW4oJ1xcbicpXG5cdFx0XHQpLFxuXHRcdFx0c2FuZGJveENvbmZpZyxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGFwcGx5U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb24oc2VydmVyRGVmOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBtY3BSZXNvdXJjZTogVVJJLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHBvdGVudGlhbEJsb2NrczogcmVhZG9ubHkgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9ja1tdLCBzdWdnZXN0ZWRTYW5kYm94Q29uZmlnPzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc2NhblRhcmdldCA9IHRoaXMuX3RvTWNwUmVzb3VyY2VUYXJnZXQoY29uZmlnVGFyZ2V0KTtcblx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cblx0XHRhd2FpdCB0aGlzLl9tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLnVwZGF0ZVNhbmRib3hDb25maWcoZGF0YSA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZ1NhbmRib3ggPSBkYXRhLnNhbmRib3g7XG5cdFx0XHRjb25zdCBzdWdnZXN0ZWRBbGxvd2VkRG9tYWlucyA9IHN1Z2dlc3RlZFNhbmRib3hDb25maWc/Lm5ldHdvcms/LmFsbG93ZWREb21haW5zID8/IFtdO1xuXHRcdFx0Y29uc3Qgc3VnZ2VzdGVkQWxsb3dXcml0ZSA9IHN1Z2dlc3RlZFNhbmRib3hDb25maWc/LmZpbGVzeXN0ZW0/LmFsbG93V3JpdGUgPz8gW107XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRBbGxvd2VkRG9tYWlucyA9IG5ldyBTZXQoZXhpc3RpbmdTYW5kYm94Py5uZXR3b3JrPy5hbGxvd2VkRG9tYWlucyA/PyBbXSk7XG5cdFx0XHRmb3IgKGNvbnN0IGRvbWFpbiBvZiBzdWdnZXN0ZWRBbGxvd2VkRG9tYWlucykge1xuXHRcdFx0XHRpZiAoZG9tYWluICYmICFjdXJyZW50QWxsb3dlZERvbWFpbnMuaGFzKGRvbWFpbikpIHtcblx0XHRcdFx0XHRjdXJyZW50QWxsb3dlZERvbWFpbnMuYWRkKGRvbWFpbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudEFsbG93V3JpdGUgPSBuZXcgU2V0KGV4aXN0aW5nU2FuZGJveD8uZmlsZXN5c3RlbT8uYWxsb3dXcml0ZSA/PyBbXSk7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2Ygc3VnZ2VzdGVkQWxsb3dXcml0ZSkge1xuXHRcdFx0XHRpZiAocGF0aCAmJiAhY3VycmVudEFsbG93V3JpdGUuaGFzKHBhdGgpKSB7XG5cdFx0XHRcdFx0Y3VycmVudEFsbG93V3JpdGUuYWRkKHBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdWdnZXN0ZWRBbGxvd2VkRG9tYWlucy5sZW5ndGggPT09IDAgJiYgc3VnZ2VzdGVkQWxsb3dXcml0ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0XHR9XG5cblx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRjb25zdCBuZXh0U2FuZGJveENvbmZpZzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uID0ge307XG5cdFx0XHRpZiAoY3VycmVudEFsbG93ZWREb21haW5zLnNpemUgPiAwKSB7XG5cdFx0XHRcdG5leHRTYW5kYm94Q29uZmlnLm5ldHdvcmsgPSB7XG5cdFx0XHRcdFx0Li4uZXhpc3RpbmdTYW5kYm94Py5uZXR3b3JrLFxuXHRcdFx0XHRcdGFsbG93ZWREb21haW5zOiBbLi4uY3VycmVudEFsbG93ZWREb21haW5zXVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRBbGxvd1dyaXRlLnNpemUgPiAwKSB7XG5cdFx0XHRcdG5leHRTYW5kYm94Q29uZmlnLmZpbGVzeXN0ZW0gPSB7XG5cdFx0XHRcdFx0Li4uZXhpc3RpbmdTYW5kYm94Py5maWxlc3lzdGVtLFxuXHRcdFx0XHRcdGFsbG93V3JpdGU6IFsuLi5jdXJyZW50QWxsb3dXcml0ZV0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5kYXRhLFxuXHRcdFx0XHRzYW5kYm94OiBuZXh0U2FuZGJveENvbmZpZyxcblx0XHRcdH07XG5cdFx0fSwgbWNwUmVzb3VyY2UsIHNjYW5UYXJnZXQpO1xuXG5cdFx0cmV0dXJuIGRpZENoYW5nZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNhbmRib3hDb25maWdTdWdnZXN0aW9ucyhwb3RlbnRpYWxCbG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSwgZXhpc3RpbmdTYW5kYm94Q29uZmlnPzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uKTogU2FuZGJveENvbmZpZ1N1Z2dlc3Rpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXBvdGVudGlhbEJsb2Nrcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsb3dXcml0ZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGFsbG93ZWREb21haW5zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZXhpc3RpbmdBbGxvd1dyaXRlID0gbmV3IFNldChleGlzdGluZ1NhbmRib3hDb25maWc/LmZpbGVzeXN0ZW0/LmFsbG93V3JpdGUgPz8gW10pO1xuXHRcdGNvbnN0IGV4aXN0aW5nQWxsb3dlZERvbWFpbnMgPSBuZXcgU2V0KGV4aXN0aW5nU2FuZGJveENvbmZpZz8ubmV0d29yaz8uYWxsb3dlZERvbWFpbnMgPz8gW10pO1xuXG5cdFx0Zm9yIChjb25zdCBibG9jayBvZiBwb3RlbnRpYWxCbG9ja3MpIHtcblx0XHRcdGlmIChibG9jay5raW5kID09PSAnbmV0d29yaycgJiYgYmxvY2suaG9zdCAmJiAhZXhpc3RpbmdBbGxvd2VkRG9tYWlucy5oYXMoYmxvY2suaG9zdCkpIHtcblx0XHRcdFx0YWxsb3dlZERvbWFpbnMuYWRkKGJsb2NrLmhvc3QpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYmxvY2sua2luZCA9PT0gJ2ZpbGVzeXN0ZW0nICYmIGJsb2NrLnBhdGggJiYgIWV4aXN0aW5nQWxsb3dXcml0ZS5oYXMoYmxvY2sucGF0aCkpIHtcblx0XHRcdFx0YWxsb3dXcml0ZS5hZGQoYmxvY2sucGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFhbGxvd1dyaXRlLnNpemUgJiYgIWFsbG93ZWREb21haW5zLnNpemUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFsbG93V3JpdGU6IFsuLi5hbGxvd1dyaXRlXSxcblx0XHRcdGFsbG93ZWREb21haW5zOiBbLi4uYWxsb3dlZERvbWFpbnNdLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b01jcFJlc291cmNlVGFyZ2V0KGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IE1jcFJlc291cmNlVGFyZ2V0IHtcblx0XHRzd2l0Y2ggKGNvbmZpZ1RhcmdldCkge1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI6XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU2FuZGJveExhdW5jaERldGFpbHMoY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcsIHNhbmRib3hDb25maWc/OiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24sIGxhdW5jaEN3ZD86IHN0cmluZyk6IFByb21pc2U8U2FuZGJveExhdW5jaERldGFpbHM+IHtcblx0XHRjb25zdCBvcyA9IGF3YWl0IHRoaXMuX2dldE9wZXJhdGluZ1N5c3RlbShyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiB7IGV4ZWNQYXRoOiB1bmRlZmluZWQsIHNydFBhdGg6IHVuZGVmaW5lZCwgcmdQYXRoOiB1bmRlZmluZWQsIHNhbmRib3hDb25maWdQYXRoOiB1bmRlZmluZWQsIHRlbXBEaXI6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFwcFJvb3QgPSBhd2FpdCB0aGlzLl9nZXRBcHBSb290KHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0Y29uc3QgZXhlY1BhdGggPSBhd2FpdCB0aGlzLl9nZXRFeGVjUGF0aChvcywgYXBwUm9vdCwgcmVtb3RlQXV0aG9yaXR5KTtcblx0XHRjb25zdCB0ZW1wRGlyID0gYXdhaXQgdGhpcy5fZ2V0VGVtcERpcihyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGNvbnN0IHNydFBhdGggPSB0aGlzLl9wYXRoSm9pbihvcywgYXBwUm9vdCwgJ25vZGVfbW9kdWxlcycsICdAdnNjb2RlJywgJ3NhbmRib3gtcnVudGltZScsICdkaXN0JywgJ2NsaS5qcycpO1xuXHRcdC8vIEB2c2NvZGUvcmlwZ3JlcC11bml2ZXJzYWwgc2hpcHMgcGVyLXBsYXRmb3JtLWFyY2ggYmluYXJpZXMgdW5kZXIgYmluL3twbGF0Zm9ybX0te2FyY2h9L3tyZ3xyZy5leGV9XG5cdFx0Ly8gV2luZG93cyBpcyBoYW5kbGVkIGJ5IHRoZSBlYXJseSByZXR1cm4gYWJvdmUsIHNvIG9zIGlzIG5hcnJvd2VkIHRvIE1hYy9MaW51eCBoZXJlLlxuXHRcdGNvbnN0IHJnUGxhdGZvcm0gPSBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCA/ICdkYXJ3aW4nIDogJ2xpbnV4Jztcblx0XHRjb25zdCByZ1BhdGggPSB0aGlzLl9wYXRoSm9pbihvcywgYXBwUm9vdCwgJ25vZGVfbW9kdWxlcycsICdAdnNjb2RlJywgJ3JpcGdyZXAtdW5pdmVyc2FsJywgJ2JpbicsIGAke3JnUGxhdGZvcm19LSR7YXJjaH1gLCAncmcnKTtcblx0XHRjb25zdCBzYW5kYm94Q29uZmlnUGF0aCA9IHRlbXBEaXIgPyBhd2FpdCB0aGlzLl91cGRhdGVTYW5kYm94Q29uZmlnKHRlbXBEaXIsIGNvbmZpZ1RhcmdldCwgc2FuZGJveENvbmZpZywgbGF1bmNoQ3dkKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBNY3BTYW5kYm94U2VydmljZTogVXBkYXRlZCBzYW5kYm94IGNvbmZpZyBwYXRoOiAke3NhbmRib3hDb25maWdQYXRofWApO1xuXHRcdHJldHVybiB7IGV4ZWNQYXRoLCBzcnRQYXRoLCByZ1BhdGgsIHNhbmRib3hDb25maWdQYXRoLCB0ZW1wRGlyIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRFeGVjUGF0aChvczogT3BlcmF0aW5nU3lzdGVtLCBhcHBSb290OiBzdHJpbmcsIHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhdGhKb2luKG9zLCBhcHBSb290LCAnbm9kZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBVc2UgRWxlY3Ryb24gZXhlY3V0YWJsZSBhcyB0aGUgZGVmYXVsdCBleGVjIHBhdGggZm9yIGxvY2FsIGRldmVsb3BtZW50LCB3aGljaCB3aWxsIHJ1biB0aGUgc2FuZGJveCBydW50aW1lIHdyYXBwZXIgd2l0aCBFbGVjdHJvbiBpbiBub2RlIG1vZGUuIEZvciByZW1vdGUsIHdlIG5lZWQgdG8gc3BlY2lmeSB0aGUgbm9kZSBleGVjdXRhYmxlIHRvIGVuc3VyZSBpdCBydW5zIHdpdGggTm9kZS5qcy5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFNhbmRib3hFbnZWYXJpYWJsZXMoYmFzZUVudjogTWNwU2VydmVyVHJhbnNwb3J0U3RkaW9bJ2VudiddLCB0ZW1wRGlyOiBVUkkgfCB1bmRlZmluZWQsIHJnUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBQcm9taXNlPE1jcFNlcnZlclRyYW5zcG9ydFN0ZGlvWydlbnYnXT4ge1xuXHRcdGxldCBlbnY6IE1jcFNlcnZlclRyYW5zcG9ydFN0ZGlvWydlbnYnXSA9IHsgLi4uYmFzZUVudiB9O1xuXHRcdGlmICh0ZW1wRGlyKSB7XG5cdFx0XHRlbnYgPSB7IC4uLmVudiwgVE1QRElSOiB0ZW1wRGlyLnBhdGgsIFNSVF9ERUJVRzogJ3RydWUnLCBOT0RFX1VTRV9FTlZfUFJPWFk6ICcxJyB9O1xuXHRcdH1cblx0XHRpZiAocmdQYXRoKSB7XG5cdFx0XHRlbnYgPSB7IC4uLmVudiwgUEFUSDogZW52WydQQVRIJ10gPyBgJHtlbnZbJ1BBVEgnXX0ke2F3YWl0IHRoaXMuX2dldFBhdGhEZWxpbWl0ZXIocmVtb3RlQXV0aG9yaXR5KX0ke2Rpcm5hbWUocmdQYXRoKX1gIDogZGlybmFtZShyZ1BhdGgpIH07XG5cdFx0fVxuXHRcdGlmICghcmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHQvLyBBZGQgYW55IHJlbW90ZS1zcGVjaWZpYyBlbnZpcm9ubWVudCB2YXJpYWJsZXMgaGVyZVxuXHRcdFx0ZW52ID0geyAuLi5lbnYsIEVMRUNUUk9OX1JVTl9BU19OT0RFOiAnMScgfTtcblx0XHR9XG5cdFx0Ly8gRW5zdXJlIFZTQ09ERV9JTlNQRUNUT1JfT1BUSU9OUyBpcyBub3QgaW5oZXJpdGVkIGJ5IHRoZSBzYW5kYm94ZWQgcHJvY2VzcywgYXMgaXQgY2FuIGNhdXNlIGlzc3VlcyB3aXRoIHNhbmRib3hpbmcuXG5cdFx0ZW52WydWU0NPREVfSU5TUEVDVE9SX09QVElPTlMnXSA9IG51bGw7XG5cdFx0cmV0dXJuIGVudjtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNhbmRib3hDb21tYW5kQXJncyhjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdLCBzYW5kYm94Q29uZmlnUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoc2FuZGJveENvbmZpZ1BhdGgpIHtcblx0XHRcdHJlc3VsdC5wdXNoKCctLXNldHRpbmdzJywgc2FuZGJveENvbmZpZ1BhdGgpO1xuXHRcdFx0cmVzdWx0LnB1c2goJy0tJyk7XG5cdFx0fVxuXHRcdHJlc3VsdC5wdXNoKGNvbW1hbmQsIC4uLmFyZ3MpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRSZW1vdGVFbnYocmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogUHJvbWlzZTxJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB8IG51bGw+IHtcblx0XHRpZiAoIXJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVFbnZEZXRhaWxzUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldE9wZXJhdGluZ1N5c3RlbShyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBQcm9taXNlPE9wZXJhdGluZ1N5c3RlbT4ge1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX2dldFJlbW90ZUVudihyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmIChyZW1vdGVFbnYpIHtcblx0XHRcdHJldHVybiByZW1vdGVFbnYub3M7XG5cdFx0fVxuXHRcdHJldHVybiBPUztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEFwcFJvb3QocmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCB0aGlzLl9nZXRSZW1vdGVFbnYocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRpZiAocmVtb3RlRW52KSB7XG5cdFx0XHRyZXR1cm4gcmVtb3RlRW52LmFwcFJvb3QucGF0aDtcblx0XHR9XG5cdFx0cmV0dXJuIGRpcm5hbWUoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLnBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VGVtcERpcihyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX2dldFJlbW90ZUVudihyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmIChyZW1vdGVFbnYpIHtcblx0XHRcdHJldHVybiByZW1vdGVFbnYudG1wRGlyO1xuXHRcdH1cblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UgYXMgSUVudmlyb25tZW50U2VydmljZSAmIHsgdG1wRGlyPzogVVJJIH07XG5cdFx0Y29uc3QgdGVtcERpciA9IGVudmlyb25tZW50U2VydmljZS50bXBEaXI7XG5cdFx0aWYgKCF0ZW1wRGlyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ01jcFNhbmRib3hTZXJ2aWNlOiBDYW5ub3QgY3JlYXRlIHNhbmRib3ggc2V0dGluZ3MgZmlsZSBiZWNhdXNlIG5vIHRtcERpciBpcyBhdmFpbGFibGUgaW4gdGhpcyBlbnZpcm9ubWVudCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVtcERpcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVNhbmRib3hDb25maWcodGVtcERpcjogVVJJLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHNhbmRib3hDb25maWc/OiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24sIGxhdW5jaEN3ZD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZFNhbmRib3hDb25maWcgPSB0aGlzLl93aXRoRGVmYXVsdFNhbmRib3hDb25maWcoc2FuZGJveENvbmZpZywgbGF1bmNoQ3dkKTtcblx0XHRsZXQgY29uZmlnRmlsZVVyaTogVVJJO1xuXHRcdGNvbnN0IGNvbmZpZ1RhcmdldEtleSA9IENvbmZpZ3VyYXRpb25UYXJnZXRUb1N0cmluZyhjb25maWdUYXJnZXQpO1xuXHRcdGlmICh0aGlzLl9zYW5kYm94Q29uZmlnUGVyQ29uZmlndXJhdGlvblRhcmdldC5oYXMoY29uZmlnVGFyZ2V0S2V5KSkge1xuXHRcdFx0Y29uZmlnRmlsZVVyaSA9IFVSSS5wYXJzZSh0aGlzLl9zYW5kYm94Q29uZmlnUGVyQ29uZmlndXJhdGlvblRhcmdldC5nZXQoY29uZmlnVGFyZ2V0S2V5KSEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25maWdGaWxlVXJpID0gVVJJLmpvaW5QYXRoKHRlbXBEaXIsIGB2c2NvZGUtJHtjb25maWdUYXJnZXRLZXl9LW1jcC1zYW5kYm94LXNldHRpbmdzLSR7dGhpcy5fc2FuZGJveFNldHRpbmdzSWR9Lmpzb25gKTtcblx0XHRcdHRoaXMuX3NhbmRib3hDb25maWdQZXJDb25maWd1cmF0aW9uVGFyZ2V0LnNldChjb25maWdUYXJnZXRLZXksIGNvbmZpZ0ZpbGVVcmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUoY29uZmlnRmlsZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShub3JtYWxpemVkU2FuZGJveENvbmZpZywgbnVsbCwgJ1xcdCcpKSwgeyBvdmVyd3JpdGU6IHRydWUgfSk7XG5cdFx0cmV0dXJuIGNvbmZpZ0ZpbGVVcmkucGF0aDtcblx0fVxuXG5cdC8vIHRoaXMgbWV0aG9kIG1lcmdlcyB0aGUgZGVmYXVsdCBhbGxvd1dyaXRlIHBhdGhzIGFuZCBhbGxvd2VkRG9tYWlucyB3aXRoIHRoZSBvbmVzIHByb3ZpZGVkIGluIHRoZSBzYW5kYm94IGNvbmZpZywgdG8gZW5zdXJlIHRoYXQgdGhlIGRlZmF1bHQgbmVjZXNzYXJ5IHBhdGhzIGFuZCBkb21haW5zIGFyZSBhbHdheXMgaW5jbHVkZWQgaW4gdGhlIHNhbmRib3ggY29uZmlnIHVzZWQgZm9yIGxhdW5jaGluZyxcblx0Ly8gIGV2ZW4gaWYgdGhleSBhcmUgbm90IGV4cGxpY2l0bHkgc3BlY2lmaWVkIGluIHRoZSBjb25maWcgcHJvdmlkZWQgYnkgdGhlIHVzZXIgb3IgdGhlIE1DUCBzZXJ2ZXIgY29uZmlnLlxuXHRwcml2YXRlIF93aXRoRGVmYXVsdFNhbmRib3hDb25maWcoc2FuZGJveENvbmZpZz86IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiwgbGF1bmNoQ3dkPzogc3RyaW5nKTogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uIHtcblx0XHRjb25zdCBtZXJnZWRBbGxvd1dyaXRlID0gbmV3IFNldChzYW5kYm94Q29uZmlnPy5maWxlc3lzdGVtPy5hbGxvd1dyaXRlID8/IFtdKTtcblx0XHRmb3IgKGNvbnN0IGRlZmF1bHRBbGxvd1dyaXRlIG9mIHRoaXMuX2dldERlZmF1bHRBbGxvd1dyaXRlKGxhdW5jaEN3ZCA/IFtsYXVuY2hDd2RdIDogdW5kZWZpbmVkKSkge1xuXHRcdFx0aWYgKGRlZmF1bHRBbGxvd1dyaXRlKSB7XG5cdFx0XHRcdG1lcmdlZEFsbG93V3JpdGUuYWRkKGRlZmF1bHRBbGxvd1dyaXRlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtZXJnZWRBbGxvd2VkRG9tYWlucyA9IG5ldyBTZXQoc2FuZGJveENvbmZpZz8ubmV0d29yaz8uYWxsb3dlZERvbWFpbnMgPz8gW10pO1xuXHRcdGZvciAoY29uc3QgZGVmYXVsdEFsbG93ZWREb21haW4gb2YgdGhpcy5fZGVmYXVsdEFsbG93ZWREb21haW5zKSB7XG5cdFx0XHRpZiAoZGVmYXVsdEFsbG93ZWREb21haW4pIHtcblx0XHRcdFx0bWVyZ2VkQWxsb3dlZERvbWFpbnMuYWRkKGRlZmF1bHRBbGxvd2VkRG9tYWluKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc2FuZGJveENvbmZpZyxcblx0XHRcdG5ldHdvcms6IHtcblx0XHRcdFx0YWxsb3dlZERvbWFpbnM6IFsuLi5tZXJnZWRBbGxvd2VkRG9tYWluc10sXG5cdFx0XHRcdGRlbmllZERvbWFpbnM6IHNhbmRib3hDb25maWc/Lm5ldHdvcms/LmRlbmllZERvbWFpbnMgPz8gW10sXG5cdFx0XHR9LFxuXHRcdFx0ZmlsZXN5c3RlbToge1xuXHRcdFx0XHRhbGxvd1dyaXRlOiBbLi4ubWVyZ2VkQWxsb3dXcml0ZV0sXG5cdFx0XHRcdGRlbnlSZWFkOiBzYW5kYm94Q29uZmlnPy5maWxlc3lzdGVtPy5kZW55UmVhZCA/PyBbXSxcblx0XHRcdFx0ZGVueVdyaXRlOiBzYW5kYm94Q29uZmlnPy5maWxlc3lzdGVtPy5kZW55V3JpdGUgPz8gW10sXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZWZhdWx0QWxsb3dXcml0ZShkaXJlY3Rvcmllcz86IHN0cmluZ1tdKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdGZvciAoY29uc3QgbGF1bmNoQ3dkIG9mIGRpcmVjdG9yaWVzID8/IFtdKSB7XG5cdFx0XHRjb25zdCB0cmltbWVkID0gbGF1bmNoQ3dkLnRyaW0oKTtcblx0XHRcdGlmICh0cmltbWVkKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRBbGxvd1dyaXRlUGF0aHMucHVzaCh0cmltbWVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRBbGxvd1dyaXRlUGF0aHM7XG5cdH1cblxuXHRwcml2YXRlIF9wYXRoSm9pbiA9IChvczogT3BlcmF0aW5nU3lzdGVtLCAuLi5zZWdtZW50czogc3RyaW5nW10pID0+IHtcblx0XHRjb25zdCBwYXRoID0gb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIgOiBwb3NpeDtcblx0XHRyZXR1cm4gcGF0aC5qb2luKC4uLnNlZ21lbnRzKTtcblx0fTtcblxuXHRwcml2YXRlIF9nZXRQYXRoRGVsaW1pdGVyID0gYXN5bmMgKHJlbW90ZUF1dGhvcml0eT86IHN0cmluZykgPT4ge1xuXHRcdGNvbnN0IG9zID0gYXdhaXQgdGhpcy5fZ2V0T3BlcmF0aW5nU3lzdGVtKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0cmV0dXJuIG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHdpbjMyLmRlbGltaXRlciA6IHBvc2l4LmRlbGltaXRlcjtcblx0fTtcblxuXHRwcml2YXRlIF9xdW90ZVNoZWxsQXJndW1lbnQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAnJHt2YWx1ZS5yZXBsYWNlKC8nL2csIGAnXFxcXCcnYCl9J2A7XG5cdH1cblxufVxuIl0sCiAgIm1h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
