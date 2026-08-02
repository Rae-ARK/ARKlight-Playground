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
import { Schemas } from "../../../../base/common/network.js";
import { env } from "../../../../base/common/process.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { ITerminalLogService, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { ITerminalProfileService } from "../common/terminal.js";
import * as path from "../../../../base/common/path.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { debounce } from "../../../../base/common/decorators.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isUriComponents, URI } from "../../../../base/common/uri.js";
import { deepClone } from "../../../../base/common/objects.js";
import { ITerminalInstanceService } from "./terminal.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isString } from "../../../../base/common/types.js";
const generatedProfileName = "Generated";
class BaseTerminalProfileResolverService extends Disposable {
  constructor(_context, _configurationService, _configurationResolverService, _historyService, _logService, _terminalProfileService, _workspaceContextService, _remoteAgentService) {
    super();
    this._context = _context;
    this._configurationService = _configurationService;
    this._configurationResolverService = _configurationResolverService;
    this._historyService = _historyService;
    this._logService = _logService;
    this._terminalProfileService = _terminalProfileService;
    this._workspaceContextService = _workspaceContextService;
    this._remoteAgentService = _remoteAgentService;
    this._iconRegistry = getIconRegistry();
    if (this._remoteAgentService.getConnection()) {
      this._remoteAgentService.getEnvironment().then((env2) => this._primaryBackendOs = env2?.os || OS);
    } else {
      this._primaryBackendOs = OS;
    }
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.DefaultProfileWindows) || e.affectsConfiguration(TerminalSettingId.DefaultProfileMacOs) || e.affectsConfiguration(TerminalSettingId.DefaultProfileLinux)) {
        this._refreshDefaultProfileName();
      }
    }));
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this._refreshDefaultProfileName()));
  }
  get defaultProfileName() {
    return this._defaultProfileName;
  }
  async _refreshDefaultProfileName() {
    if (this._primaryBackendOs) {
      this._defaultProfileName = (await this.getDefaultProfile({
        remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority,
        os: this._primaryBackendOs
      }))?.profileName;
    }
  }
  resolveIcon(shellLaunchConfig, os) {
    if (shellLaunchConfig.icon) {
      shellLaunchConfig.icon = this._getCustomIcon(shellLaunchConfig.icon) || this.getDefaultIcon();
      return;
    }
    if (shellLaunchConfig.customPtyImplementation) {
      shellLaunchConfig.icon = this.getDefaultIcon();
      return;
    }
    if (shellLaunchConfig.executable) {
      return;
    }
    const defaultProfile = this._getUnresolvedRealDefaultProfile(os);
    if (defaultProfile) {
      shellLaunchConfig.icon = defaultProfile.icon;
    }
    if (!shellLaunchConfig.icon) {
      shellLaunchConfig.icon = this.getDefaultIcon();
    }
  }
  getDefaultIcon(resource) {
    return this._iconRegistry.getIcon(this._configurationService.getValue(TerminalSettingId.TabsDefaultIcon, { resource })) || Codicon.terminal;
  }
  async resolveShellLaunchConfig(shellLaunchConfig, options) {
    let resolvedProfile;
    if (shellLaunchConfig.executable) {
      resolvedProfile = await this._resolveProfile({
        path: shellLaunchConfig.executable,
        args: shellLaunchConfig.args,
        profileName: generatedProfileName,
        isDefault: false
      }, options);
    } else {
      resolvedProfile = await this.getDefaultProfile(options);
    }
    shellLaunchConfig.executable = resolvedProfile.path;
    shellLaunchConfig.args = resolvedProfile.args;
    if (resolvedProfile.env) {
      if (shellLaunchConfig.env) {
        shellLaunchConfig.env = { ...shellLaunchConfig.env, ...resolvedProfile.env };
      } else {
        shellLaunchConfig.env = resolvedProfile.env;
      }
    }
    const resource = shellLaunchConfig === void 0 || isString(shellLaunchConfig.cwd) ? void 0 : shellLaunchConfig.cwd;
    shellLaunchConfig.icon = this._getCustomIcon(shellLaunchConfig.icon) || this._getCustomIcon(resolvedProfile.icon) || this.getDefaultIcon(resource);
    if (resolvedProfile.overrideName) {
      shellLaunchConfig.name = resolvedProfile.profileName;
    }
    shellLaunchConfig.color = shellLaunchConfig.color || resolvedProfile.color || this._configurationService.getValue(TerminalSettingId.TabsDefaultColor, { resource });
    if (shellLaunchConfig.useShellEnvironment === void 0) {
      shellLaunchConfig.useShellEnvironment = this._configurationService.getValue(TerminalSettingId.InheritEnv);
    }
  }
  async getDefaultShell(options) {
    return (await this.getDefaultProfile(options)).path;
  }
  async getDefaultShellArgs(options) {
    return (await this.getDefaultProfile(options)).args || [];
  }
  async getDefaultProfile(options) {
    return this._resolveProfile(await this._getUnresolvedDefaultProfile(options), options);
  }
  getEnvironment(remoteAuthority) {
    return this._context.getEnvironment(remoteAuthority);
  }
  _getCustomIcon(icon) {
    if (!icon) {
      return void 0;
    }
    if (isString(icon)) {
      return ThemeIcon.fromId(icon);
    }
    if (ThemeIcon.isThemeIcon(icon)) {
      return icon;
    }
    if (URI.isUri(icon) || isUriComponents(icon)) {
      return URI.revive(icon);
    }
    if ((URI.isUri(icon.light) || isUriComponents(icon.light)) && (URI.isUri(icon.dark) || isUriComponents(icon.dark))) {
      return { light: URI.revive(icon.light), dark: URI.revive(icon.dark) };
    }
    return void 0;
  }
  async _getUnresolvedDefaultProfile(options) {
    if (options.allowAgentHostShell) {
      const raw = this._configurationService.getValue(`terminal.integrated.agentHostProfile.${this._getOsKey(options.os)}`);
      if (isString(raw)) {
        await this._terminalProfileService.profilesReady;
      }
      const agentHostShellProfile = this._getUnresolvedAgentHostShellProfile(options);
      if (agentHostShellProfile) {
        return agentHostShellProfile;
      }
    }
    if (options.allowAutomationShell) {
      const automationShellProfile = this._getUnresolvedAutomationShellProfile(options);
      if (automationShellProfile) {
        return automationShellProfile;
      }
    }
    await this._terminalProfileService.profilesReady;
    const defaultProfile = this._getUnresolvedRealDefaultProfile(options.os);
    if (defaultProfile) {
      return this._setIconForAutomation(options, defaultProfile);
    }
    return this._setIconForAutomation(options, await this._getUnresolvedFallbackDefaultProfile(options));
  }
  _setIconForAutomation(options, profile) {
    if (options.allowAutomationShell) {
      const profileClone = deepClone(profile);
      profileClone.icon = Codicon.tools;
      return profileClone;
    }
    return profile;
  }
  _getUnresolvedRealDefaultProfile(os) {
    return this._terminalProfileService.getDefaultProfile(os);
  }
  async _getUnresolvedFallbackDefaultProfile(options) {
    const executable = await this._context.getDefaultSystemShell(options.remoteAuthority, options.os);
    if (options.os === OS) {
      let existingProfile = this._terminalProfileService.availableProfiles.find((e) => path.parse(e.path).name === path.parse(executable).name);
      if (existingProfile) {
        if (options.allowAutomationShell) {
          existingProfile = deepClone(existingProfile);
          existingProfile.icon = Codicon.tools;
        }
        return existingProfile;
      }
    }
    let args;
    if (options.os === OperatingSystem.Macintosh && path.parse(executable).name.match(/(zsh|bash)/)) {
      args = ["--login"];
    } else {
      args = [];
    }
    const icon = this._guessProfileIcon(executable);
    return {
      profileName: generatedProfileName,
      path: executable,
      args,
      icon,
      isDefault: false
    };
  }
  _getUnresolvedAutomationShellProfile(options) {
    const automationProfile = this._configurationService.getValue(`terminal.integrated.automationProfile.${this._getOsKey(options.os)}`);
    if (this._isValidAutomationProfile(automationProfile, options.os)) {
      automationProfile.icon = this._getCustomIcon(automationProfile.icon) || Codicon.tools;
      return automationProfile;
    }
    return void 0;
  }
  _getUnresolvedAgentHostShellProfile(options) {
    const agentHostProfile = this._configurationService.getValue(`terminal.integrated.agentHostProfile.${this._getOsKey(options.os)}`);
    if (isString(agentHostProfile)) {
      const named = this._terminalProfileService.availableProfiles.find((p) => p.profileName === agentHostProfile && !p.isAutoDetected);
      if (named) {
        const cloned = deepClone(named);
        cloned.icon = this._getCustomIcon(cloned.icon) || Codicon.tools;
        return cloned;
      }
      return void 0;
    }
    if (this._isValidAutomationProfile(agentHostProfile, options.os)) {
      agentHostProfile.icon = this._getCustomIcon(agentHostProfile.icon) || Codicon.tools;
      return agentHostProfile;
    }
    return void 0;
  }
  async _resolveProfile(profile, options) {
    const env2 = await this._context.getEnvironment(options.remoteAuthority);
    if (options.os === OperatingSystem.Windows) {
      const isWoW64 = !!env2.hasOwnProperty("PROCESSOR_ARCHITEW6432");
      const windir = env2.windir;
      if (!isWoW64 && windir) {
        const sysnativePath = path.join(windir, "Sysnative").replace(/\//g, "\\").toLowerCase();
        if (profile.path && profile.path.toLowerCase().indexOf(sysnativePath) === 0) {
          profile.path = path.join(windir, "System32", profile.path.substr(sysnativePath.length + 1));
        }
      }
      if (profile.path) {
        profile.path = profile.path.replace(/\//g, "\\");
      }
    }
    const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(options.remoteAuthority ? Schemas.vscodeRemote : Schemas.file);
    const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
    profile.path = await this._resolveVariables(profile.path, env2, lastActiveWorkspace);
    if (profile.args) {
      if (isString(profile.args)) {
        profile.args = await this._resolveVariables(profile.args, env2, lastActiveWorkspace);
      } else {
        profile.args = await Promise.all(profile.args.map((arg) => this._resolveVariables(arg, env2, lastActiveWorkspace)));
      }
    }
    return profile;
  }
  async _resolveVariables(value, env2, lastActiveWorkspace) {
    try {
      value = await this._configurationResolverService.resolveWithEnvironment(env2, lastActiveWorkspace, value);
    } catch (e) {
      this._logService.error(`Could not resolve shell`, e);
    }
    return value;
  }
  _getOsKey(os) {
    switch (os) {
      case OperatingSystem.Linux:
        return "linux";
      case OperatingSystem.Macintosh:
        return "osx";
      case OperatingSystem.Windows:
        return "windows";
    }
  }
  _guessProfileIcon(shell) {
    const file = path.parse(shell).name;
    switch (file) {
      case "bash":
        return Codicon.terminalBash;
      case "pwsh":
      case "powershell":
        return Codicon.terminalPowershell;
      case "tmux":
        return Codicon.terminalTmux;
      case "cmd":
        return Codicon.terminalCmd;
      default:
        return void 0;
    }
  }
  _isValidAutomationProfile(profile, os) {
    if (profile === null || profile === void 0 || typeof profile !== "object") {
      return false;
    }
    if ("path" in profile && isString(profile.path)) {
      return true;
    }
    return false;
  }
}
__decorateClass([
  debounce(200)
], BaseTerminalProfileResolverService.prototype, "_refreshDefaultProfileName", 1);
let BrowserTerminalProfileResolverService = class extends BaseTerminalProfileResolverService {
  constructor(configurationResolverService, configurationService, historyService, logService, terminalInstanceService, terminalProfileService, workspaceContextService, remoteAgentService) {
    super(
      {
        getDefaultSystemShell: async (remoteAuthority, os) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!remoteAuthority || !backend) {
            return os === OperatingSystem.Windows ? "pwsh" : "bash";
          }
          return backend.getDefaultSystemShell(os);
        },
        getEnvironment: async (remoteAuthority) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!remoteAuthority || !backend) {
            return env;
          }
          return backend.getEnvironment();
        }
      },
      configurationService,
      configurationResolverService,
      historyService,
      logService,
      terminalProfileService,
      workspaceContextService,
      remoteAgentService
    );
  }
};
BrowserTerminalProfileResolverService = __decorateClass([
  __decorateParam(0, IConfigurationResolverService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IHistoryService),
  __decorateParam(3, ITerminalLogService),
  __decorateParam(4, ITerminalInstanceService),
  __decorateParam(5, ITerminalProfileService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IRemoteAgentService)
], BrowserTerminalProfileResolverService);
export {
  BaseTerminalProfileResolverService,
  BrowserTerminalProfileResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZW52IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxMb2dTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zLCBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdldEljb25SZWdpc3RyeSwgSUljb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNVcmlDb21wb25lbnRzLCBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIHR5cGUgU2luZ2xlT3JNYW55IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9maWxlQ29udGV4dFByb3ZpZGVyIHtcblx0Z2V0RGVmYXVsdFN5c3RlbVNoZWxsKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvczogT3BlcmF0aW5nU3lzdGVtKTogUHJvbWlzZTxzdHJpbmc+O1xuXHRnZXRFbnZpcm9ubWVudChyZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD47XG59XG5cbmNvbnN0IGdlbmVyYXRlZFByb2ZpbGVOYW1lID0gJ0dlbmVyYXRlZCc7XG5cbi8qXG4gKiBSZXNvbHZlcyB0ZXJtaW5hbCBzaGVsbCBsYXVuY2ggY29uZmlnIGFuZCB0ZXJtaW5hbCBwcm9maWxlcyBmb3IgdGhlIGdpdmVuIG9wZXJhdGluZyBzeXN0ZW0sXG4gKiBlbnZpcm9ubWVudCwgYW5kIHVzZXIgY29uZmlndXJhdGlvbi5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3ByaW1hcnlCYWNrZW5kT3M6IE9wZXJhdGluZ1N5c3RlbSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29uUmVnaXN0cnk6IElJY29uUmVnaXN0cnkgPSBnZXRJY29uUmVnaXN0cnkoKTtcblxuXHRwcml2YXRlIF9kZWZhdWx0UHJvZmlsZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGRlZmF1bHRQcm9maWxlTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZGVmYXVsdFByb2ZpbGVOYW1lOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dDogSVByb2ZpbGVDb250ZXh0UHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3J5U2VydmljZTogSUhpc3RvcnlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICh0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpKSB7XG5cdFx0XHR0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKGVudiA9PiB0aGlzLl9wcmltYXJ5QmFja2VuZE9zID0gZW52Py5vcyB8fCBPUyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3ByaW1hcnlCYWNrZW5kT3MgPSBPUztcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuRGVmYXVsdFByb2ZpbGVXaW5kb3dzKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRQcm9maWxlTWFjT3MpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuRGVmYXVsdFByb2ZpbGVMaW51eCkpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaERlZmF1bHRQcm9maWxlTmFtZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMoKCkgPT4gdGhpcy5fcmVmcmVzaERlZmF1bHRQcm9maWxlTmFtZSgpKSk7XG5cdH1cblxuXHRAZGVib3VuY2UoMjAwKVxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoRGVmYXVsdFByb2ZpbGVOYW1lKCkge1xuXHRcdGlmICh0aGlzLl9wcmltYXJ5QmFja2VuZE9zKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0UHJvZmlsZU5hbWUgPSAoYXdhaXQgdGhpcy5nZXREZWZhdWx0UHJvZmlsZSh7XG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKT8ucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRvczogdGhpcy5fcHJpbWFyeUJhY2tlbmRPc1xuXHRcdFx0fSkpPy5wcm9maWxlTmFtZTtcblx0XHR9XG5cdH1cblxuXHRyZXNvbHZlSWNvbihzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBvczogT3BlcmF0aW5nU3lzdGVtKTogdm9pZCB7XG5cdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmljb24pIHtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmljb24gPSB0aGlzLl9nZXRDdXN0b21JY29uKHNoZWxsTGF1bmNoQ29uZmlnLmljb24pIHx8IHRoaXMuZ2V0RGVmYXVsdEljb24oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uKSB7XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pY29uID0gdGhpcy5nZXREZWZhdWx0SWNvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IHRoaXMuX2dldFVucmVzb2x2ZWRSZWFsRGVmYXVsdFByb2ZpbGUob3MpO1xuXHRcdGlmIChkZWZhdWx0UHJvZmlsZSkge1xuXHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaWNvbiA9IGRlZmF1bHRQcm9maWxlLmljb247XG5cdFx0fVxuXHRcdGlmICghc2hlbGxMYXVuY2hDb25maWcuaWNvbikge1xuXHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaWNvbiA9IHRoaXMuZ2V0RGVmYXVsdEljb24oKTtcblx0XHR9XG5cdH1cblxuXHRnZXREZWZhdWx0SWNvbihyZXNvdXJjZT86IFVSSSk6IFRlcm1pbmFsSWNvbiAmIFRoZW1lSWNvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ljb25SZWdpc3RyeS5nZXRJY29uKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNEZWZhdWx0SWNvbiwgeyByZXNvdXJjZSB9KSkgfHwgQ29kaWNvbi50ZXJtaW5hbDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVTaGVsbExhdW5jaENvbmZpZyhzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFJlc29sdmUgdGhlIHNoZWxsIGFuZCBzaGVsbCBhcmdzXG5cdFx0bGV0IHJlc29sdmVkUHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZTtcblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSkge1xuXHRcdFx0cmVzb2x2ZWRQcm9maWxlID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVByb2ZpbGUoe1xuXHRcdFx0XHRwYXRoOiBzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlLFxuXHRcdFx0XHRhcmdzOiBzaGVsbExhdW5jaENvbmZpZy5hcmdzLFxuXHRcdFx0XHRwcm9maWxlTmFtZTogZ2VuZXJhdGVkUHJvZmlsZU5hbWUsXG5cdFx0XHRcdGlzRGVmYXVsdDogZmFsc2Vcblx0XHRcdH0sIG9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvbHZlZFByb2ZpbGUgPSBhd2FpdCB0aGlzLmdldERlZmF1bHRQcm9maWxlKG9wdGlvbnMpO1xuXHRcdH1cblx0XHRzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlID0gcmVzb2x2ZWRQcm9maWxlLnBhdGg7XG5cdFx0c2hlbGxMYXVuY2hDb25maWcuYXJncyA9IHJlc29sdmVkUHJvZmlsZS5hcmdzO1xuXHRcdGlmIChyZXNvbHZlZFByb2ZpbGUuZW52KSB7XG5cdFx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuZW52KSB7XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmVudiA9IHsgLi4uc2hlbGxMYXVuY2hDb25maWcuZW52LCAuLi5yZXNvbHZlZFByb2ZpbGUuZW52IH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5lbnYgPSByZXNvbHZlZFByb2ZpbGUuZW52O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZlcmlmeSB0aGUgaWNvbiBpcyB2YWxpZCwgYW5kIGZhbGxiYWNrIGNvcnJlY3RseSB0byB0aGUgZ2VuZXJpYyB0ZXJtaW5hbCBpZCBpZiB0aGVyZSBpc1xuXHRcdC8vIGFuIGlzc3VlXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBzaGVsbExhdW5jaENvbmZpZyA9PT0gdW5kZWZpbmVkIHx8IGlzU3RyaW5nKHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCkgPyB1bmRlZmluZWQgOiBzaGVsbExhdW5jaENvbmZpZy5jd2Q7XG5cdFx0c2hlbGxMYXVuY2hDb25maWcuaWNvbiA9IHRoaXMuX2dldEN1c3RvbUljb24oc2hlbGxMYXVuY2hDb25maWcuaWNvbilcblx0XHRcdHx8IHRoaXMuX2dldEN1c3RvbUljb24ocmVzb2x2ZWRQcm9maWxlLmljb24pXG5cdFx0XHR8fCB0aGlzLmdldERlZmF1bHRJY29uKHJlc291cmNlKTtcblxuXHRcdC8vIE92ZXJyaWRlIHRoZSBuYW1lIGlmIHNwZWNpZmllZFxuXHRcdGlmIChyZXNvbHZlZFByb2ZpbGUub3ZlcnJpZGVOYW1lKSB7XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5uYW1lID0gcmVzb2x2ZWRQcm9maWxlLnByb2ZpbGVOYW1lO1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IHRoZSBjb2xvclxuXHRcdHNoZWxsTGF1bmNoQ29uZmlnLmNvbG9yID0gc2hlbGxMYXVuY2hDb25maWcuY29sb3Jcblx0XHRcdHx8IHJlc29sdmVkUHJvZmlsZS5jb2xvclxuXHRcdFx0fHwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuVGFic0RlZmF1bHRDb2xvciwgeyByZXNvdXJjZSB9KTtcblxuXHRcdC8vIFJlc29sdmUgdXNlU2hlbGxFbnZpcm9ubWVudCBiYXNlZCBvbiB0aGUgc2V0dGluZyBpZiBpdCdzIG5vdCBzZXRcblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcudXNlU2hlbGxFbnZpcm9ubWVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuSW5oZXJpdEVudik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0RGVmYXVsdFNoZWxsKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZ2V0RGVmYXVsdFByb2ZpbGUob3B0aW9ucykpLnBhdGg7XG5cdH1cblxuXHRhc3luYyBnZXREZWZhdWx0U2hlbGxBcmdzKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTxTaW5nbGVPck1hbnk8c3RyaW5nPj4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5nZXREZWZhdWx0UHJvZmlsZShvcHRpb25zKSkuYXJncyB8fCBbXTtcblx0fVxuXG5cdGFzeW5jIGdldERlZmF1bHRQcm9maWxlKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVQcm9maWxlKGF3YWl0IHRoaXMuX2dldFVucmVzb2x2ZWREZWZhdWx0UHJvZmlsZShvcHRpb25zKSwgb3B0aW9ucyk7XG5cdH1cblxuXHRnZXRFbnZpcm9ubWVudChyZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LmdldEVudmlyb25tZW50KHJlbW90ZUF1dGhvcml0eSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDdXN0b21JY29uKGljb24/OiBUZXJtaW5hbEljb24pOiBUZXJtaW5hbEljb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghaWNvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGlzU3RyaW5nKGljb24pKSB7XG5cdFx0XHRyZXR1cm4gVGhlbWVJY29uLmZyb21JZChpY29uKTtcblx0XHR9XG5cdFx0aWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSkge1xuXHRcdFx0cmV0dXJuIGljb247XG5cdFx0fVxuXHRcdGlmIChVUkkuaXNVcmkoaWNvbikgfHwgaXNVcmlDb21wb25lbnRzKGljb24pKSB7XG5cdFx0XHRyZXR1cm4gVVJJLnJldml2ZShpY29uKTtcblx0XHR9XG5cdFx0aWYgKChVUkkuaXNVcmkoaWNvbi5saWdodCkgfHwgaXNVcmlDb21wb25lbnRzKGljb24ubGlnaHQpKSAmJiAoVVJJLmlzVXJpKGljb24uZGFyaykgfHwgaXNVcmlDb21wb25lbnRzKGljb24uZGFyaykpKSB7XG5cdFx0XHRyZXR1cm4geyBsaWdodDogVVJJLnJldml2ZShpY29uLmxpZ2h0KSwgZGFyazogVVJJLnJldml2ZShpY29uLmRhcmspIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRVbnJlc29sdmVkRGVmYXVsdFByb2ZpbGUob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGU+IHtcblx0XHQvLyBJZiBhZ2VudCBob3N0IHNoZWxsIGlzIGFsbG93ZWQsIHByZWZlciB0aGF0LlxuXHRcdGlmIChvcHRpb25zLmFsbG93QWdlbnRIb3N0U2hlbGwpIHtcblx0XHRcdGNvbnN0IHJhdyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmFnZW50SG9zdFByb2ZpbGUuJHt0aGlzLl9nZXRPc0tleShvcHRpb25zLm9zKX1gKTtcblx0XHRcdGlmIChpc1N0cmluZyhyYXcpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UucHJvZmlsZXNSZWFkeTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFnZW50SG9zdFNoZWxsUHJvZmlsZSA9IHRoaXMuX2dldFVucmVzb2x2ZWRBZ2VudEhvc3RTaGVsbFByb2ZpbGUob3B0aW9ucyk7XG5cdFx0XHRpZiAoYWdlbnRIb3N0U2hlbGxQcm9maWxlKSB7XG5cdFx0XHRcdHJldHVybiBhZ2VudEhvc3RTaGVsbFByb2ZpbGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYXV0b21hdGlvbiBzaGVsbCBpcyBhbGxvd2VkLCBwcmVmZXIgdGhhdFxuXHRcdGlmIChvcHRpb25zLmFsbG93QXV0b21hdGlvblNoZWxsKSB7XG5cdFx0XHRjb25zdCBhdXRvbWF0aW9uU2hlbGxQcm9maWxlID0gdGhpcy5fZ2V0VW5yZXNvbHZlZEF1dG9tYXRpb25TaGVsbFByb2ZpbGUob3B0aW9ucyk7XG5cdFx0XHRpZiAoYXV0b21hdGlvblNoZWxsUHJvZmlsZSkge1xuXHRcdFx0XHRyZXR1cm4gYXV0b21hdGlvblNoZWxsUHJvZmlsZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gdGhlIHJlYWwgZGVmYXVsdCBwcm9maWxlIGlmIGl0IGV4aXN0cyBhbmQgaXMgdmFsaWQsIHdhaXQgZm9yIHByb2ZpbGVzIHRvIGJlIHJlYWR5XG5cdFx0Ly8gaWYgdGhlIHdpbmRvdyBqdXN0IG9wZW5lZFxuXHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UucHJvZmlsZXNSZWFkeTtcblx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IHRoaXMuX2dldFVucmVzb2x2ZWRSZWFsRGVmYXVsdFByb2ZpbGUob3B0aW9ucy5vcyk7XG5cdFx0aWYgKGRlZmF1bHRQcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2V0SWNvbkZvckF1dG9tYXRpb24ob3B0aW9ucywgZGVmYXVsdFByb2ZpbGUpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGlzIG5vIHJlYWwgZGVmYXVsdCBwcm9maWxlLCBjcmVhdGUgYSBmYWxsYmFjayBkZWZhdWx0IHByb2ZpbGUgYmFzZWQgb24gdGhlIHNoZWxsXG5cdFx0Ly8gYW5kIHNoZWxsQXJncyBzZXR0aW5ncyBpbiBhZGRpdGlvbiB0byB0aGUgY3VycmVudCBlbnZpcm9ubWVudC5cblx0XHRyZXR1cm4gdGhpcy5fc2V0SWNvbkZvckF1dG9tYXRpb24ob3B0aW9ucywgYXdhaXQgdGhpcy5fZ2V0VW5yZXNvbHZlZEZhbGxiYWNrRGVmYXVsdFByb2ZpbGUob3B0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SWNvbkZvckF1dG9tYXRpb24ob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMsIHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUpOiBJVGVybWluYWxQcm9maWxlIHtcblx0XHRpZiAob3B0aW9ucy5hbGxvd0F1dG9tYXRpb25TaGVsbCkge1xuXHRcdFx0Y29uc3QgcHJvZmlsZUNsb25lID0gZGVlcENsb25lKHByb2ZpbGUpO1xuXHRcdFx0cHJvZmlsZUNsb25lLmljb24gPSBDb2RpY29uLnRvb2xzO1xuXHRcdFx0cmV0dXJuIHByb2ZpbGVDbG9uZTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVbnJlc29sdmVkUmVhbERlZmF1bHRQcm9maWxlKG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBJVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5nZXREZWZhdWx0UHJvZmlsZShvcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRVbnJlc29sdmVkRmFsbGJhY2tEZWZhdWx0UHJvZmlsZShvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT4ge1xuXHRcdGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCB0aGlzLl9jb250ZXh0LmdldERlZmF1bHRTeXN0ZW1TaGVsbChvcHRpb25zLnJlbW90ZUF1dGhvcml0eSwgb3B0aW9ucy5vcyk7XG5cblx0XHQvLyBUcnkgc2VsZWN0IGFuIGV4aXN0aW5nIHByb2ZpbGUgdG8gZmFsbGJhY2sgdG8sIGJhc2VkIG9uIHRoZSBkZWZhdWx0IHN5c3RlbSBzaGVsbCwgb25seSBkb1xuXHRcdC8vIHRoaXMgd2hlbiBpdCBpcyBOT1QgYSBsb2NhbCB0ZXJtaW5hbCBpbiBhIHJlbW90ZSB3aW5kb3cgd2hlcmUgdGhlIGZyb250IGFuZCBiYWNrIGVuZCBPU1xuXHRcdC8vIGRpZmZlcnMgKGVnLiBXaW5kb3dzIC0+IFdTTCwgTWFjIC0+IExpbnV4KVxuXHRcdGlmIChvcHRpb25zLm9zID09PSBPUykge1xuXHRcdFx0bGV0IGV4aXN0aW5nUHJvZmlsZSA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMuZmluZChlID0+IHBhdGgucGFyc2UoZS5wYXRoKS5uYW1lID09PSBwYXRoLnBhcnNlKGV4ZWN1dGFibGUpLm5hbWUpO1xuXHRcdFx0aWYgKGV4aXN0aW5nUHJvZmlsZSkge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5hbGxvd0F1dG9tYXRpb25TaGVsbCkge1xuXHRcdFx0XHRcdGV4aXN0aW5nUHJvZmlsZSA9IGRlZXBDbG9uZShleGlzdGluZ1Byb2ZpbGUpO1xuXHRcdFx0XHRcdGV4aXN0aW5nUHJvZmlsZS5pY29uID0gQ29kaWNvbi50b29scztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXhpc3RpbmdQcm9maWxlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbmFsbHkgZmFsbGJhY2sgdG8gYSBnZW5lcmF0ZWQgcHJvZmlsZVxuXHRcdGxldCBhcmdzOiBTaW5nbGVPck1hbnk8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCAmJiBwYXRoLnBhcnNlKGV4ZWN1dGFibGUpLm5hbWUubWF0Y2goLyh6c2h8YmFzaCkvKSkge1xuXHRcdFx0Ly8gbWFjT1Mgc2hvdWxkIGxhdW5jaCBhIGxvZ2luIHNoZWxsIGJ5IGRlZmF1bHRcblx0XHRcdGFyZ3MgPSBbJy0tbG9naW4nXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUmVzb2x2ZSB1bmRlZmluZWQgdG8gW11cblx0XHRcdGFyZ3MgPSBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBpY29uID0gdGhpcy5fZ3Vlc3NQcm9maWxlSWNvbihleGVjdXRhYmxlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwcm9maWxlTmFtZTogZ2VuZXJhdGVkUHJvZmlsZU5hbWUsXG5cdFx0XHRwYXRoOiBleGVjdXRhYmxlLFxuXHRcdFx0YXJncyxcblx0XHRcdGljb24sXG5cdFx0XHRpc0RlZmF1bHQ6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFVucmVzb2x2ZWRBdXRvbWF0aW9uU2hlbGxQcm9maWxlKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogSVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblByb2ZpbGUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShgdGVybWluYWwuaW50ZWdyYXRlZC5hdXRvbWF0aW9uUHJvZmlsZS4ke3RoaXMuX2dldE9zS2V5KG9wdGlvbnMub3MpfWApO1xuXHRcdGlmICh0aGlzLl9pc1ZhbGlkQXV0b21hdGlvblByb2ZpbGUoYXV0b21hdGlvblByb2ZpbGUsIG9wdGlvbnMub3MpKSB7XG5cdFx0XHRhdXRvbWF0aW9uUHJvZmlsZS5pY29uID0gdGhpcy5fZ2V0Q3VzdG9tSWNvbihhdXRvbWF0aW9uUHJvZmlsZS5pY29uKSB8fCBDb2RpY29uLnRvb2xzO1xuXHRcdFx0cmV0dXJuIGF1dG9tYXRpb25Qcm9maWxlO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVbnJlc29sdmVkQWdlbnRIb3N0U2hlbGxQcm9maWxlKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogSVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWdlbnRIb3N0UHJvZmlsZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmFnZW50SG9zdFByb2ZpbGUuJHt0aGlzLl9nZXRPc0tleShvcHRpb25zLm9zKX1gKTtcblxuXHRcdC8vIEFsbG93IGEgc3RyaW5nIHZhbHVlIGFzIGEgcmVmZXJlbmNlIHRvIGEgbmFtZWQgcHJvZmlsZSB1bmRlclxuXHRcdC8vIGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLnByb2ZpbGVzLjxvcz5gIFx1MjAxNCBzYW1lIGNvbnZlbnRpb24gYXNcblx0XHQvLyBgdGVybWluYWwuaW50ZWdyYXRlZC5kZWZhdWx0UHJvZmlsZS48b3M+YCBcdTIwMTQgc28gdXNlcnMgZG9uJ3QgaGF2ZVxuXHRcdC8vIHRvIGlubGluZSB0aGUgcGF0aCB3aGVuIHRoZXkgYWxyZWFkeSBoYXZlIHRoZSBwcm9maWxlIGRlZmluZWQuXG5cdFx0aWYgKGlzU3RyaW5nKGFnZW50SG9zdFByb2ZpbGUpKSB7XG5cdFx0XHRjb25zdCBuYW1lZCA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMuZmluZChwID0+IHAucHJvZmlsZU5hbWUgPT09IGFnZW50SG9zdFByb2ZpbGUgJiYgIXAuaXNBdXRvRGV0ZWN0ZWQpO1xuXHRcdFx0aWYgKG5hbWVkKSB7XG5cdFx0XHRcdGNvbnN0IGNsb25lZCA9IGRlZXBDbG9uZShuYW1lZCk7XG5cdFx0XHRcdGNsb25lZC5pY29uID0gdGhpcy5fZ2V0Q3VzdG9tSWNvbihjbG9uZWQuaWNvbikgfHwgQ29kaWNvbi50b29scztcblx0XHRcdFx0cmV0dXJuIGNsb25lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzVmFsaWRBdXRvbWF0aW9uUHJvZmlsZShhZ2VudEhvc3RQcm9maWxlLCBvcHRpb25zLm9zKSkge1xuXHRcdFx0YWdlbnRIb3N0UHJvZmlsZS5pY29uID0gdGhpcy5fZ2V0Q3VzdG9tSWNvbihhZ2VudEhvc3RQcm9maWxlLmljb24pIHx8IENvZGljb24udG9vbHM7XG5cdFx0XHRyZXR1cm4gYWdlbnRIb3N0UHJvZmlsZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVByb2ZpbGUocHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSwgb3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGU+IHtcblx0XHRjb25zdCBlbnYgPSBhd2FpdCB0aGlzLl9jb250ZXh0LmdldEVudmlyb25tZW50KG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5KTtcblxuXHRcdGlmIChvcHRpb25zLm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0Ly8gQ2hhbmdlIFN5c25hdGl2ZSB0byBTeXN0ZW0zMiBpZiB0aGUgT1MgaXMgV2luZG93cyBidXQgTk9UIFdvVzY0LiBJdCdzXG5cdFx0XHQvLyBzYWZlIHRvIGFzc3VtZSB0aGF0IHRoaXMgd2FzIHVzZWQgYnkgYWNjaWRlbnQgYXMgU3lzbmF0aXZlIGRvZXMgbm90XG5cdFx0XHQvLyBleGlzdCBhbmQgd2lsbCBicmVhayB0aGUgdGVybWluYWwgaW4gbm9uLVdvVzY0IGVudmlyb25tZW50cy5cblx0XHRcdGNvbnN0IGlzV29XNjQgPSAhIWVudi5oYXNPd25Qcm9wZXJ0eSgnUFJPQ0VTU09SX0FSQ0hJVEVXNjQzMicpO1xuXHRcdFx0Y29uc3Qgd2luZGlyID0gZW52LndpbmRpcjtcblx0XHRcdGlmICghaXNXb1c2NCAmJiB3aW5kaXIpIHtcblx0XHRcdFx0Y29uc3Qgc3lzbmF0aXZlUGF0aCA9IHBhdGguam9pbih3aW5kaXIsICdTeXNuYXRpdmUnKS5yZXBsYWNlKC9cXC8vZywgJ1xcXFwnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRpZiAocHJvZmlsZS5wYXRoICYmIHByb2ZpbGUucGF0aC50b0xvd2VyQ2FzZSgpLmluZGV4T2Yoc3lzbmF0aXZlUGF0aCkgPT09IDApIHtcblx0XHRcdFx0XHRwcm9maWxlLnBhdGggPSBwYXRoLmpvaW4od2luZGlyLCAnU3lzdGVtMzInLCBwcm9maWxlLnBhdGguc3Vic3RyKHN5c25hdGl2ZVBhdGgubGVuZ3RoICsgMSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgLyB0byBcXCBvbiBXaW5kb3dzIGZvciBjb252ZW5pZW5jZVxuXHRcdFx0aWYgKHByb2ZpbGUucGF0aCkge1xuXHRcdFx0XHRwcm9maWxlLnBhdGggPSBwcm9maWxlLnBhdGgucmVwbGFjZSgvXFwvL2csICdcXFxcJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSBwYXRoIHZhcmlhYmxlc1xuXHRcdGNvbnN0IGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkgPSB0aGlzLl9oaXN0b3J5U2VydmljZS5nZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdChvcHRpb25zLnJlbW90ZUF1dGhvcml0eSA/IFNjaGVtYXMudnNjb2RlUmVtb3RlIDogU2NoZW1hcy5maWxlKTtcblx0XHRjb25zdCBsYXN0QWN0aXZlV29ya3NwYWNlID0gYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA/IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihhY3RpdmVXb3Jrc3BhY2VSb290VXJpKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0cHJvZmlsZS5wYXRoID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlcyhwcm9maWxlLnBhdGgsIGVudiwgbGFzdEFjdGl2ZVdvcmtzcGFjZSk7XG5cblx0XHQvLyBSZXNvbHZlIGFyZ3MgdmFyaWFibGVzXG5cdFx0aWYgKHByb2ZpbGUuYXJncykge1xuXHRcdFx0aWYgKGlzU3RyaW5nKHByb2ZpbGUuYXJncykpIHtcblx0XHRcdFx0cHJvZmlsZS5hcmdzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlcyhwcm9maWxlLmFyZ3MsIGVudiwgbGFzdEFjdGl2ZVdvcmtzcGFjZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm9maWxlLmFyZ3MgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9maWxlLmFyZ3MubWFwKGFyZyA9PiB0aGlzLl9yZXNvbHZlVmFyaWFibGVzKGFyZywgZW52LCBsYXN0QWN0aXZlV29ya3NwYWNlKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwcm9maWxlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVZhcmlhYmxlcyh2YWx1ZTogc3RyaW5nLCBlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsIGxhc3RBY3RpdmVXb3Jrc3BhY2U6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQpIHtcblx0XHR0cnkge1xuXHRcdFx0dmFsdWUgPSBhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVXaXRoRW52aXJvbm1lbnQoZW52LCBsYXN0QWN0aXZlV29ya3NwYWNlLCB2YWx1ZSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgQ291bGQgbm90IHJlc29sdmUgc2hlbGxgLCBlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3NLZXkob3M6IE9wZXJhdGluZ1N5c3RlbSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChvcykge1xuXHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6IHJldHVybiAnbGludXgnO1xuXHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOiByZXR1cm4gJ29zeCc7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzOiByZXR1cm4gJ3dpbmRvd3MnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2d1ZXNzUHJvZmlsZUljb24oc2hlbGw6IHN0cmluZyk6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmlsZSA9IHBhdGgucGFyc2Uoc2hlbGwpLm5hbWU7XG5cdFx0c3dpdGNoIChmaWxlKSB7XG5cdFx0XHRjYXNlICdiYXNoJzpcblx0XHRcdFx0cmV0dXJuIENvZGljb24udGVybWluYWxCYXNoO1xuXHRcdFx0Y2FzZSAncHdzaCc6XG5cdFx0XHRjYXNlICdwb3dlcnNoZWxsJzpcblx0XHRcdFx0cmV0dXJuIENvZGljb24udGVybWluYWxQb3dlcnNoZWxsO1xuXHRcdFx0Y2FzZSAndG11eCc6XG5cdFx0XHRcdHJldHVybiBDb2RpY29uLnRlcm1pbmFsVG11eDtcblx0XHRcdGNhc2UgJ2NtZCc6XG5cdFx0XHRcdHJldHVybiBDb2RpY29uLnRlcm1pbmFsQ21kO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1ZhbGlkQXV0b21hdGlvblByb2ZpbGUocHJvZmlsZTogdW5rbm93biwgb3M6IE9wZXJhdGluZ1N5c3RlbSk6IHByb2ZpbGUgaXMgSVRlcm1pbmFsUHJvZmlsZSB7XG5cdFx0aWYgKHByb2ZpbGUgPT09IG51bGwgfHwgcHJvZmlsZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBwcm9maWxlICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoJ3BhdGgnIGluIHByb2ZpbGUgJiYgaXNTdHJpbmcoKHByb2ZpbGUgYXMgeyBwYXRoOiB1bmtub3duIH0pLnBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIGV4dGVuZHMgQmFzZVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlOiBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIHRlcm1pbmFsUHJvZmlsZVNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGdldERlZmF1bHRTeXN0ZW1TaGVsbDogYXN5bmMgKHJlbW90ZUF1dGhvcml0eSwgb3MpID0+IHtcblx0XHRcdFx0XHRjb25zdCBiYWNrZW5kID0gYXdhaXQgdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZ2V0QmFja2VuZChyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHRcdGlmICghcmVtb3RlQXV0aG9yaXR5IHx8ICFiYWNrZW5kKSB7XG5cdFx0XHRcdFx0XHQvLyBKdXN0IHJldHVybiBiYXNpYyB2YWx1ZXMsIHRoaXMgaXMgb25seSBmb3Igc2VydmVybGVzcyB3ZWIgYW5kIHdvdWxkbid0IGJlIHVzZWRcblx0XHRcdFx0XHRcdHJldHVybiBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyAncHdzaCcgOiAnYmFzaCc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBiYWNrZW5kLmdldERlZmF1bHRTeXN0ZW1TaGVsbChvcyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldEVudmlyb25tZW50OiBhc3luYyAocmVtb3RlQXV0aG9yaXR5KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmdldEJhY2tlbmQocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRpZiAoIXJlbW90ZUF1dGhvcml0eSB8fCAhYmFja2VuZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVudjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGJhY2tlbmQuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRcdGhpc3RvcnlTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdHJlbW90ZUFnZW50U2VydmljZVxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFrRDtBQUMzRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUE4QixpQkFBaUIsVUFBVTtBQUN6RCxTQUE2QixxQkFBcUQseUJBQXlCO0FBQzNHLFNBQTRFLCtCQUErQjtBQUMzRyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXNDO0FBQy9DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsaUJBQWlCLFdBQVc7QUFDckMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBbUM7QUFPNUMsTUFBTSx1QkFBdUI7QUFNdEIsTUFBZSwyQ0FBMkMsV0FBc0Q7QUFBQSxFQVV0SCxZQUNrQixVQUNBLHVCQUNBLCtCQUNBLGlCQUNBLGFBQ0EseUJBQ0EsMEJBQ0EscUJBQ2hCO0FBQ0QsVUFBTTtBQVRXO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFibEIsU0FBaUIsZ0JBQStCLGdCQUFnQjtBQWlCL0QsUUFBSSxLQUFLLG9CQUFvQixjQUFjLEdBQUc7QUFDN0MsV0FBSyxvQkFBb0IsZUFBZSxFQUFFLEtBQUssQ0FBQUEsU0FBTyxLQUFLLG9CQUFvQkEsTUFBSyxNQUFNLEVBQUU7QUFBQSxJQUM3RixPQUFPO0FBQ04sV0FBSyxvQkFBb0I7QUFBQSxJQUMxQjtBQUNBLFNB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
