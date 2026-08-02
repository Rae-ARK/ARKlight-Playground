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
import { Codicon } from "../../../../base/common/codicons.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalSettingPrefix } from "../../../../platform/terminal/common/terminal.js";
import { getUriClasses, getColorClass, createColorStyleElement } from "./terminalIcon.js";
import { configureTerminalProfileIcon } from "./terminalIcons.js";
import * as nls from "../../../../nls.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../common/terminal.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { basename } from "../../../../base/common/path.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { hasKey, isString } from "../../../../base/common/types.js";
import { Event } from "../../../../base/common/event.js";
let TerminalProfileQuickpick = class {
  constructor(_terminalProfileService, _terminalProfileResolverService, _configurationService, _quickInputService, _themeService, _notificationService) {
    this._terminalProfileService = _terminalProfileService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._themeService = _themeService;
    this._notificationService = _notificationService;
  }
  async showAndGetResult(type) {
    const platformKey = await this._terminalProfileService.getPlatformKey();
    const profilesKey = TerminalSettingPrefix.Profiles + platformKey;
    const result = await this._createAndShow(type);
    const defaultProfileKey = `${TerminalSettingPrefix.DefaultProfile}${platformKey}`;
    if (!result) {
      return;
    }
    if (type === "setDefault") {
      if (hasKey(result.profile, { id: true })) {
        await this._configurationService.updateValue(defaultProfileKey, result.profile.title, ConfigurationTarget.USER);
        return {
          config: {
            extensionIdentifier: result.profile.extensionIdentifier,
            id: result.profile.id,
            title: result.profile.title,
            options: {
              color: result.profile.color,
              icon: result.profile.icon
            }
          },
          keyMods: result.keyMods
        };
      }
      if (hasKey(result.profile, { profileName: true })) {
        const profilesConfig = await this._configurationService.getValue(profilesKey);
        if (typeof profilesConfig === "object") {
          const newProfile = {
            path: result.profile.path
          };
          if (result.profile.args) {
            newProfile.args = result.profile.args;
          }
          profilesConfig[result.profile.profileName] = this._createNewProfileConfig(result.profile);
          await this._configurationService.updateValue(profilesKey, profilesConfig, ConfigurationTarget.USER);
        }
      }
      await this._configurationService.updateValue(defaultProfileKey, result.profileName, ConfigurationTarget.USER);
    } else if (type === "createInstance") {
      if (hasKey(result.profile, { id: true })) {
        const config = {
          extensionIdentifier: result.profile.extensionIdentifier,
          id: result.profile.id,
          title: result.profile.title,
          options: {
            icon: result.profile.icon,
            color: result.profile.color
          }
        };
        if (result.profile.titleTemplate !== void 0) {
          config.titleTemplate = result.profile.titleTemplate;
        }
        return {
          config,
          keyMods: result.keyMods
        };
      } else {
        return { config: result.profile, keyMods: result.keyMods };
      }
    }
    return hasKey(result.profile, { profileName: true }) ? result.profile.profileName : result.profile.title;
  }
  async _createAndShow(type) {
    const platformKey = await this._terminalProfileService.getPlatformKey();
    const profiles = this._terminalProfileService.availableProfiles;
    const profilesKey = TerminalSettingPrefix.Profiles + platformKey;
    const defaultProfileName = this._terminalProfileService.getDefaultProfileName();
    let keyMods;
    const options = {
      placeHolder: type === "createInstance" ? nls.localize("terminal.integrated.selectProfileToCreate", "Select the terminal profile to create") : nls.localize("terminal.integrated.chooseDefaultProfile", "Select your default terminal profile"),
      onDidTriggerItemButton: async (context) => {
        if (!await this._isProfileSafe(context.item.profile)) {
          return;
        }
        if (hasKey(context.item.profile, { id: true })) {
          return;
        }
        const configProfiles2 = this._configurationService.getValue(TerminalSettingPrefix.Profiles + platformKey);
        const existingProfiles = !!configProfiles2 ? Object.keys(configProfiles2) : [];
        const name = await this._quickInputService.input({
          prompt: nls.localize("enterTerminalProfileName", "Enter terminal profile name"),
          value: context.item.profile.profileName,
          validateInput: async (input) => {
            if (existingProfiles.includes(input)) {
              return nls.localize("terminalProfileAlreadyExists", "A terminal profile already exists with that name");
            }
            return void 0;
          }
        });
        if (!name) {
          return;
        }
        const newConfigValue = {
          ...configProfiles2,
          [name]: this._createNewProfileConfig(context.item.profile)
        };
        await this._configurationService.updateValue(profilesKey, newConfigValue, ConfigurationTarget.USER);
      },
      onKeyMods: (mods) => keyMods = mods
    };
    const quickPickItems = [];
    const configProfiles = profiles.filter((e) => !e.isAutoDetected);
    const autoDetectedProfiles = profiles.filter((e) => e.isAutoDetected);
    if (configProfiles.length > 0) {
      quickPickItems.push({ type: "separator", label: nls.localize("terminalProfiles", "profiles") });
      quickPickItems.push(...this._sortProfileQuickPickItems(configProfiles.map((e) => this._createProfileQuickPickItem(e)), defaultProfileName));
    }
    quickPickItems.push({ type: "separator", label: nls.localize("ICreateContributedTerminalProfileOptions", "contributed") });
    const contributedProfiles = [];
    for (const contributed of this._terminalProfileService.contributedProfiles) {
      let icon;
      if (isString(contributed.icon)) {
        if (contributed.icon.startsWith("$(")) {
          icon = ThemeIcon.fromString(contributed.icon);
        } else {
          icon = ThemeIcon.fromId(contributed.icon);
        }
      }
      if (!icon || !getIconRegistry().getIcon(icon.id)) {
        icon = this._terminalProfileResolverService.getDefaultIcon();
      }
      const uriClasses = getUriClasses(contributed, this._themeService.getColorTheme().type, true);
      const colorClass = getColorClass(contributed);
      const iconClasses = [];
      if (uriClasses) {
        iconClasses.push(...uriClasses);
      }
      if (colorClass) {
        iconClasses.push(colorClass);
      }
      contributedProfiles.push({
        label: `$(${icon.id}) ${contributed.title}`,
        profile: {
          extensionIdentifier: contributed.extensionIdentifier,
          title: contributed.title,
          icon: contributed.icon,
          id: contributed.id,
          color: contributed.color,
          titleTemplate: contributed.titleTemplate
        },
        profileName: contributed.title,
        iconClasses
      });
    }
    if (contributedProfiles.length > 0) {
      quickPickItems.push(...this._sortProfileQuickPickItems(contributedProfiles, defaultProfileName));
    }
    if (autoDetectedProfiles.length > 0) {
      quickPickItems.push({ type: "separator", label: nls.localize("terminalProfiles.detected", "detected") });
      quickPickItems.push(...this._sortProfileQuickPickItems(autoDetectedProfiles.map((e) => this._createProfileQuickPickItem(e)), defaultProfileName));
    }
    const colorStyleDisposable = createColorStyleElement(this._themeService.getColorTheme());
    const result = await this._quickInputService.pick(quickPickItems, options);
    colorStyleDisposable.dispose();
    if (!result) {
      return void 0;
    }
    if (!await this._isProfileSafe(result.profile)) {
      return void 0;
    }
    if (keyMods) {
      result.keyMods = keyMods;
    }
    return result;
  }
  _createNewProfileConfig(profile) {
    const result = { path: profile.path };
    if (profile.args) {
      result.args = profile.args;
    }
    if (profile.env) {
      result.env = profile.env;
    }
    return result;
  }
  async _isProfileSafe(profile) {
    const isUnsafePath = hasKey(profile, { profileName: true }) && profile.isUnsafePath;
    const requiresUnsafePath = hasKey(profile, { profileName: true }) && profile.requiresUnsafePath;
    if (!isUnsafePath && !requiresUnsafePath) {
      return true;
    }
    return await new Promise((r) => {
      const unsafePaths = [];
      if (isUnsafePath) {
        unsafePaths.push(profile.path);
      }
      if (requiresUnsafePath) {
        unsafePaths.push(requiresUnsafePath);
      }
      const handle = this._notificationService.prompt(
        Severity.Warning,
        nls.localize("unsafePathWarning", "This terminal profile uses a potentially unsafe path that can be modified by another user: {0}. Are you sure you want to use it?", `"${unsafePaths.join(",")}"`),
        [{
          label: nls.localize("yes", "Yes"),
          run: () => r(true)
        }, {
          label: nls.localize("cancel", "Cancel"),
          run: () => r(false)
        }]
      );
      Event.once(handle.onDidClose)(() => {
        r(false);
      });
    });
  }
  _createProfileQuickPickItem(profile) {
    const buttons = [{
      iconClass: ThemeIcon.asClassName(configureTerminalProfileIcon),
      tooltip: nls.localize("createQuickLaunchProfile", "Configure Terminal Profile")
    }];
    const icon = profile.icon && ThemeIcon.isThemeIcon(profile.icon) ? profile.icon : Codicon.terminal;
    const label = `$(${icon.id}) ${profile.profileName}`;
    const friendlyPath = profile.isFromPath ? basename(profile.path) : profile.path;
    const colorClass = getColorClass(profile);
    const iconClasses = [];
    if (colorClass) {
      iconClasses.push(colorClass);
    }
    if (profile.args) {
      if (isString(profile.args)) {
        return { label, description: `${profile.path} ${profile.args}`, profile, profileName: profile.profileName, buttons, iconClasses };
      }
      const argsString = profile.args.map((e) => {
        if (e.includes(" ")) {
          return `"${e.replace(/"/g, '\\"')}"`;
        }
        return e;
      }).join(" ");
      return { label, description: `${friendlyPath} ${argsString}`, profile, profileName: profile.profileName, buttons, iconClasses };
    }
    return { label, description: friendlyPath, profile, profileName: profile.profileName, buttons, iconClasses };
  }
  _sortProfileQuickPickItems(items, defaultProfileName) {
    return items.sort((a, b) => {
      if (b.profileName === defaultProfileName) {
        return 1;
      }
      if (a.profileName === defaultProfileName) {
        return -1;
      }
      return a.profileName.localeCompare(b.profileName);
    });
  }
};
TerminalProfileQuickpick = __decorateClass([
  __decorateParam(0, ITerminalProfileService),
  __decorateParam(1, ITerminalProfileResolverService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, INotificationService)
], TerminalProfileQuickpick);
export {
  TerminalProfileQuickpick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxQcm9maWxlUXVpY2twaWNrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJS2V5TW9kcywgSVBpY2tPcHRpb25zLCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUsIElUZXJtaW5hbFByb2ZpbGUsIElUZXJtaW5hbFByb2ZpbGVPYmplY3QsIFRlcm1pbmFsU2V0dGluZ1ByZWZpeCwgdHlwZSBJVGVybWluYWxFeGVjdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdldFVyaUNsYXNzZXMsIGdldENvbG9yQ2xhc3MsIGNyZWF0ZUNvbG9yU3R5bGVFbGVtZW50IH0gZnJvbSAnLi90ZXJtaW5hbEljb24uanMnO1xuaW1wb3J0IHsgY29uZmlndXJlVGVybWluYWxQcm9maWxlSWNvbiB9IGZyb20gJy4vdGVybWluYWxJY29ucy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrVGVybWluYWxPYmplY3QsIElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IGdldEljb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGhhc0tleSwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcblxuXG50eXBlIERlZmF1bHRQcm9maWxlTmFtZSA9IHN0cmluZztcbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHNob3dBbmRHZXRSZXN1bHQodHlwZTogJ3NldERlZmF1bHQnIHwgJ2NyZWF0ZUluc3RhbmNlJyk6IFByb21pc2U8SVF1aWNrUGlja1Rlcm1pbmFsT2JqZWN0IHwgRGVmYXVsdFByb2ZpbGVOYW1lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGxhdGZvcm1LZXkgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmdldFBsYXRmb3JtS2V5KCk7XG5cdFx0Y29uc3QgcHJvZmlsZXNLZXkgPSBUZXJtaW5hbFNldHRpbmdQcmVmaXguUHJvZmlsZXMgKyBwbGF0Zm9ybUtleTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jcmVhdGVBbmRTaG93KHR5cGUpO1xuXHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlS2V5ID0gYCR7VGVybWluYWxTZXR0aW5nUHJlZml4LkRlZmF1bHRQcm9maWxlfSR7cGxhdGZvcm1LZXl9YDtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gJ3NldERlZmF1bHQnKSB7XG5cdFx0XHRpZiAoaGFzS2V5KHJlc3VsdC5wcm9maWxlLCB7IGlkOiB0cnVlIH0pKSB7XG5cdFx0XHRcdC8vIGV4dGVuc2lvbiBjb250cmlidXRlZCBwcm9maWxlXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGRlZmF1bHRQcm9maWxlS2V5LCByZXN1bHQucHJvZmlsZS50aXRsZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbklkZW50aWZpZXI6IHJlc3VsdC5wcm9maWxlLmV4dGVuc2lvbklkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHRpZDogcmVzdWx0LnByb2ZpbGUuaWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogcmVzdWx0LnByb2ZpbGUudGl0bGUsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGNvbG9yOiByZXN1bHQucHJvZmlsZS5jb2xvcixcblx0XHRcdFx0XHRcdFx0aWNvbjogcmVzdWx0LnByb2ZpbGUuaWNvblxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2V5TW9kczogcmVzdWx0LmtleU1vZHNcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWRkIHRoZSBwcm9maWxlIHRvIHNldHRpbmdzIGlmIG5lY2Vzc2FyeVxuXHRcdFx0aWYgKGhhc0tleShyZXN1bHQucHJvZmlsZSwgeyBwcm9maWxlTmFtZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRjb25zdCBwcm9maWxlc0NvbmZpZyA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHByb2ZpbGVzS2V5KTtcblx0XHRcdFx0aWYgKHR5cGVvZiBwcm9maWxlc0NvbmZpZyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdQcm9maWxlOiBJVGVybWluYWxQcm9maWxlT2JqZWN0ID0ge1xuXHRcdFx0XHRcdFx0cGF0aDogcmVzdWx0LnByb2ZpbGUucGF0aFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKHJlc3VsdC5wcm9maWxlLmFyZ3MpIHtcblx0XHRcdFx0XHRcdG5ld1Byb2ZpbGUuYXJncyA9IHJlc3VsdC5wcm9maWxlLmFyZ3M7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdChwcm9maWxlc0NvbmZpZyBhcyB7IFtrZXk6IHN0cmluZ106IElUZXJtaW5hbFByb2ZpbGVPYmplY3QgfSlbcmVzdWx0LnByb2ZpbGUucHJvZmlsZU5hbWVdID0gdGhpcy5fY3JlYXRlTmV3UHJvZmlsZUNvbmZpZyhyZXN1bHQucHJvZmlsZSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUocHJvZmlsZXNLZXksIHByb2ZpbGVzQ29uZmlnLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBTZXQgdGhlIGRlZmF1bHQgcHJvZmlsZVxuXHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoZGVmYXVsdFByb2ZpbGVLZXksIHJlc3VsdC5wcm9maWxlTmFtZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHR9IGVsc2UgaWYgKHR5cGUgPT09ICdjcmVhdGVJbnN0YW5jZScpIHtcblx0XHRcdGlmIChoYXNLZXkocmVzdWx0LnByb2ZpbGUsIHsgaWQ6IHRydWUgfSkpIHtcblx0XHRcdFx0Y29uc3QgY29uZmlnOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nO1xuXHRcdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHRcdFx0dGl0bGU6IHN0cmluZztcblx0XHRcdFx0XHR0aXRsZVRlbXBsYXRlPzogc3RyaW5nO1xuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGljb246IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGVbJ2ljb24nXTtcblx0XHRcdFx0XHRcdGNvbG9yOiBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlWydjb2xvciddO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gPSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogcmVzdWx0LnByb2ZpbGUuZXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRcdFx0XHRpZDogcmVzdWx0LnByb2ZpbGUuaWQsXG5cdFx0XHRcdFx0dGl0bGU6IHJlc3VsdC5wcm9maWxlLnRpdGxlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGljb246IHJlc3VsdC5wcm9maWxlLmljb24sXG5cdFx0XHRcdFx0XHRjb2xvcjogcmVzdWx0LnByb2ZpbGUuY29sb3IsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAocmVzdWx0LnByb2ZpbGUudGl0bGVUZW1wbGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uZmlnLnRpdGxlVGVtcGxhdGUgPSByZXN1bHQucHJvZmlsZS50aXRsZVRlbXBsYXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29uZmlnLFxuXHRcdFx0XHRcdGtleU1vZHM6IHJlc3VsdC5rZXlNb2RzXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4geyBjb25maWc6IHJlc3VsdC5wcm9maWxlLCBrZXlNb2RzOiByZXN1bHQua2V5TW9kcyB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBmb3IgdGVzdHNcblx0XHRyZXR1cm4gaGFzS2V5KHJlc3VsdC5wcm9maWxlLCB7IHByb2ZpbGVOYW1lOiB0cnVlIH0pID8gcmVzdWx0LnByb2ZpbGUucHJvZmlsZU5hbWUgOiByZXN1bHQucHJvZmlsZS50aXRsZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUFuZFNob3codHlwZTogJ3NldERlZmF1bHQnIHwgJ2NyZWF0ZUluc3RhbmNlJyk6IFByb21pc2U8SVByb2ZpbGVRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGxhdGZvcm1LZXkgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmdldFBsYXRmb3JtS2V5KCk7XG5cdFx0Y29uc3QgcHJvZmlsZXMgPSB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzO1xuXHRcdGNvbnN0IHByb2ZpbGVzS2V5ID0gVGVybWluYWxTZXR0aW5nUHJlZml4LlByb2ZpbGVzICsgcGxhdGZvcm1LZXk7XG5cdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGVOYW1lID0gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5nZXREZWZhdWx0UHJvZmlsZU5hbWUoKTtcblx0XHRsZXQga2V5TW9kczogSUtleU1vZHMgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3B0aW9uczogSVBpY2tPcHRpb25zPElQcm9maWxlUXVpY2tQaWNrSXRlbT4gPSB7XG5cdFx0XHRwbGFjZUhvbGRlcjogdHlwZSA9PT0gJ2NyZWF0ZUluc3RhbmNlJyA/IG5scy5sb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zZWxlY3RQcm9maWxlVG9DcmVhdGUnLCBcIlNlbGVjdCB0aGUgdGVybWluYWwgcHJvZmlsZSB0byBjcmVhdGVcIikgOiBubHMubG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY2hvb3NlRGVmYXVsdFByb2ZpbGUnLCBcIlNlbGVjdCB5b3VyIGRlZmF1bHQgdGVybWluYWwgcHJvZmlsZVwiKSxcblx0XHRcdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b246IGFzeW5jIChjb250ZXh0KSA9PiB7XG5cdFx0XHRcdC8vIEdldCB0aGUgdXNlcidzIGV4cGxpY2l0IHBlcm1pc3Npb24gdG8gdXNlIGEgcG90ZW50aWFsbHkgdW5zYWZlIHBhdGhcblx0XHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9pc1Byb2ZpbGVTYWZlKGNvbnRleHQuaXRlbS5wcm9maWxlKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGFzS2V5KGNvbnRleHQuaXRlbS5wcm9maWxlLCB7IGlkOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ1Byb2ZpbGVzOiB7IFtrZXk6IHN0cmluZ106IElUZXJtaW5hbEV4ZWN1dGFibGUgfCBudWxsIHwgdW5kZWZpbmVkIH0gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdQcmVmaXguUHJvZmlsZXMgKyBwbGF0Zm9ybUtleSk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nUHJvZmlsZXMgPSAhIWNvbmZpZ1Byb2ZpbGVzID8gT2JqZWN0LmtleXMoY29uZmlnUHJvZmlsZXMpIDogW107XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHRcdFx0cHJvbXB0OiBubHMubG9jYWxpemUoJ2VudGVyVGVybWluYWxQcm9maWxlTmFtZScsIFwiRW50ZXIgdGVybWluYWwgcHJvZmlsZSBuYW1lXCIpLFxuXHRcdFx0XHRcdHZhbHVlOiBjb250ZXh0Lml0ZW0ucHJvZmlsZS5wcm9maWxlTmFtZSxcblx0XHRcdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyBpbnB1dCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXhpc3RpbmdQcm9maWxlcy5pbmNsdWRlcyhpbnB1dCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndGVybWluYWxQcm9maWxlQWxyZWFkeUV4aXN0cycsIFwiQSB0ZXJtaW5hbCBwcm9maWxlIGFscmVhZHkgZXhpc3RzIHdpdGggdGhhdCBuYW1lXCIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV3Q29uZmlnVmFsdWU6IHsgW2tleTogc3RyaW5nXTogSVRlcm1pbmFsRXhlY3V0YWJsZSB8IG51bGwgfCB1bmRlZmluZWQgfSA9IHtcblx0XHRcdFx0XHQuLi5jb25maWdQcm9maWxlcyxcblx0XHRcdFx0XHRbbmFtZV06IHRoaXMuX2NyZWF0ZU5ld1Byb2ZpbGVDb25maWcoY29udGV4dC5pdGVtLnByb2ZpbGUpXG5cdFx0XHRcdH07XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHByb2ZpbGVzS2V5LCBuZXdDb25maWdWYWx1ZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdH0sXG5cdFx0XHRvbktleU1vZHM6IG1vZHMgPT4ga2V5TW9kcyA9IG1vZHNcblx0XHR9O1xuXG5cdFx0Ly8gQnVpbGQgcXVpY2sgcGljayBpdGVtc1xuXHRcdGNvbnN0IHF1aWNrUGlja0l0ZW1zOiAoSVByb2ZpbGVRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbmZpZ1Byb2ZpbGVzID0gcHJvZmlsZXMuZmlsdGVyKGUgPT4gIWUuaXNBdXRvRGV0ZWN0ZWQpO1xuXHRcdGNvbnN0IGF1dG9EZXRlY3RlZFByb2ZpbGVzID0gcHJvZmlsZXMuZmlsdGVyKGUgPT4gZS5pc0F1dG9EZXRlY3RlZCk7XG5cblx0XHRpZiAoY29uZmlnUHJvZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGVzJywgXCJwcm9maWxlc1wiKSB9KTtcblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goLi4udGhpcy5fc29ydFByb2ZpbGVRdWlja1BpY2tJdGVtcyhjb25maWdQcm9maWxlcy5tYXAoZSA9PiB0aGlzLl9jcmVhdGVQcm9maWxlUXVpY2tQaWNrSXRlbShlKSksIGRlZmF1bHRQcm9maWxlTmFtZSEpKTtcblx0XHR9XG5cblx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ0lDcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZU9wdGlvbnMnLCBcImNvbnRyaWJ1dGVkXCIpIH0pO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkUHJvZmlsZXM6IElQcm9maWxlUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb250cmlidXRlZCBvZiB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmNvbnRyaWJ1dGVkUHJvZmlsZXMpIHtcblx0XHRcdGxldCBpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNTdHJpbmcoY29udHJpYnV0ZWQuaWNvbikpIHtcblx0XHRcdFx0aWYgKGNvbnRyaWJ1dGVkLmljb24uc3RhcnRzV2l0aCgnJCgnKSkge1xuXHRcdFx0XHRcdGljb24gPSBUaGVtZUljb24uZnJvbVN0cmluZyhjb250cmlidXRlZC5pY29uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpY29uID0gVGhlbWVJY29uLmZyb21JZChjb250cmlidXRlZC5pY29uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFpY29uIHx8ICFnZXRJY29uUmVnaXN0cnkoKS5nZXRJY29uKGljb24uaWQpKSB7XG5cdFx0XHRcdGljb24gPSB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RGVmYXVsdEljb24oKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVyaUNsYXNzZXMgPSBnZXRVcmlDbGFzc2VzKGNvbnRyaWJ1dGVkLCB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUsIHRydWUpO1xuXHRcdFx0Y29uc3QgY29sb3JDbGFzcyA9IGdldENvbG9yQ2xhc3MoY29udHJpYnV0ZWQpO1xuXHRcdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBbXTtcblx0XHRcdGlmICh1cmlDbGFzc2VzKSB7XG5cdFx0XHRcdGljb25DbGFzc2VzLnB1c2goLi4udXJpQ2xhc3Nlcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29sb3JDbGFzcykge1xuXHRcdFx0XHRpY29uQ2xhc3Nlcy5wdXNoKGNvbG9yQ2xhc3MpO1xuXHRcdFx0fVxuXHRcdFx0Y29udHJpYnV0ZWRQcm9maWxlcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGAkKCR7aWNvbi5pZH0pICR7Y29udHJpYnV0ZWQudGl0bGV9YCxcblx0XHRcdFx0cHJvZmlsZToge1xuXHRcdFx0XHRcdGV4dGVuc2lvbklkZW50aWZpZXI6IGNvbnRyaWJ1dGVkLmV4dGVuc2lvbklkZW50aWZpZXIsXG5cdFx0XHRcdFx0dGl0bGU6IGNvbnRyaWJ1dGVkLnRpdGxlLFxuXHRcdFx0XHRcdGljb246IGNvbnRyaWJ1dGVkLmljb24sXG5cdFx0XHRcdFx0aWQ6IGNvbnRyaWJ1dGVkLmlkLFxuXHRcdFx0XHRcdGNvbG9yOiBjb250cmlidXRlZC5jb2xvcixcblx0XHRcdFx0XHR0aXRsZVRlbXBsYXRlOiBjb250cmlidXRlZC50aXRsZVRlbXBsYXRlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb2ZpbGVOYW1lOiBjb250cmlidXRlZC50aXRsZSxcblx0XHRcdFx0aWNvbkNsYXNzZXNcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChjb250cmlidXRlZFByb2ZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goLi4udGhpcy5fc29ydFByb2ZpbGVRdWlja1BpY2tJdGVtcyhjb250cmlidXRlZFByb2ZpbGVzLCBkZWZhdWx0UHJvZmlsZU5hbWUhKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGF1dG9EZXRlY3RlZFByb2ZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IG5scy5sb2NhbGl6ZSgndGVybWluYWxQcm9maWxlcy5kZXRlY3RlZCcsIFwiZGV0ZWN0ZWRcIikgfSk7XG5cdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKC4uLnRoaXMuX3NvcnRQcm9maWxlUXVpY2tQaWNrSXRlbXMoYXV0b0RldGVjdGVkUHJvZmlsZXMubWFwKGUgPT4gdGhpcy5fY3JlYXRlUHJvZmlsZVF1aWNrUGlja0l0ZW0oZSkpLCBkZWZhdWx0UHJvZmlsZU5hbWUhKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbG9yU3R5bGVEaXNwb3NhYmxlID0gY3JlYXRlQ29sb3JTdHlsZUVsZW1lbnQodGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKHF1aWNrUGlja0l0ZW1zLCBvcHRpb25zKTtcblx0XHRjb2xvclN0eWxlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghYXdhaXQgdGhpcy5faXNQcm9maWxlU2FmZShyZXN1bHQucHJvZmlsZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChrZXlNb2RzKSB7XG5cdFx0XHRyZXN1bHQua2V5TW9kcyA9IGtleU1vZHM7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVOZXdQcm9maWxlQ29uZmlnKHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUpOiBJVGVybWluYWxFeGVjdXRhYmxlIHtcblx0XHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbEV4ZWN1dGFibGUgPSB7IHBhdGg6IHByb2ZpbGUucGF0aCB9O1xuXHRcdGlmIChwcm9maWxlLmFyZ3MpIHtcblx0XHRcdHJlc3VsdC5hcmdzID0gcHJvZmlsZS5hcmdzO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZS5lbnYpIHtcblx0XHRcdHJlc3VsdC5lbnYgPSBwcm9maWxlLmVudjtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzUHJvZmlsZVNhZmUocHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSB8IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBpc1Vuc2FmZVBhdGggPSBoYXNLZXkocHJvZmlsZSwgeyBwcm9maWxlTmFtZTogdHJ1ZSB9KSAmJiBwcm9maWxlLmlzVW5zYWZlUGF0aDtcblx0XHRjb25zdCByZXF1aXJlc1Vuc2FmZVBhdGggPSBoYXNLZXkocHJvZmlsZSwgeyBwcm9maWxlTmFtZTogdHJ1ZSB9KSAmJiBwcm9maWxlLnJlcXVpcmVzVW5zYWZlUGF0aDtcblx0XHRpZiAoIWlzVW5zYWZlUGF0aCAmJiAhcmVxdWlyZXNVbnNhZmVQYXRoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIHVzZXIncyBleHBsaWNpdCBwZXJtaXNzaW9uIHRvIHVzZSBhIHBvdGVudGlhbGx5IHVuc2FmZSBwYXRoXG5cdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlPGJvb2xlYW4+KHIgPT4ge1xuXHRcdFx0Y29uc3QgdW5zYWZlUGF0aHMgPSBbXTtcblx0XHRcdGlmIChpc1Vuc2FmZVBhdGgpIHtcblx0XHRcdFx0dW5zYWZlUGF0aHMucHVzaChwcm9maWxlLnBhdGgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcXVpcmVzVW5zYWZlUGF0aCkge1xuXHRcdFx0XHR1bnNhZmVQYXRocy5wdXNoKHJlcXVpcmVzVW5zYWZlUGF0aCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBOb3RpZnkgYWJvdXQgdW5zYWZlIHBhdGgocykuIEF0IHRoZSB0aW1lIG9mIHdyaXRpbmcsIG11bHRpcGxlIHVuc2FmZSBwYXRocyBpc24ndFxuXHRcdFx0Ly8gcG9zc2libGUgc28gdGhlIG1lc3NhZ2UgaXMgb3B0aW1pemVkIGZvciBhIHNpbmdsZSBwYXRoLlxuXHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndW5zYWZlUGF0aFdhcm5pbmcnLCAnVGhpcyB0ZXJtaW5hbCBwcm9maWxlIHVzZXMgYSBwb3RlbnRpYWxseSB1bnNhZmUgcGF0aCB0aGF0IGNhbiBiZSBtb2RpZmllZCBieSBhbm90aGVyIHVzZXI6IHswfS4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHVzZSBpdD8nLCBgXCIke3Vuc2FmZVBhdGhzLmpvaW4oJywnKX1cImApLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3llcycsICdZZXMnKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHIodHJ1ZSlcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NhbmNlbCcsICdDYW5jZWwnKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHIoZmFsc2UpXG5cdFx0XHRcdH1dXG5cdFx0XHQpO1xuXHRcdFx0RXZlbnQub25jZShoYW5kbGUub25EaWRDbG9zZSkoKCkgPT4ge1xuXHRcdFx0XHRyKGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUHJvZmlsZVF1aWNrUGlja0l0ZW0ocHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSk6IElQcm9maWxlUXVpY2tQaWNrSXRlbSB7XG5cdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFt7XG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShjb25maWd1cmVUZXJtaW5hbFByb2ZpbGVJY29uKSxcblx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnY3JlYXRlUXVpY2tMYXVuY2hQcm9maWxlJywgXCJDb25maWd1cmUgVGVybWluYWwgUHJvZmlsZVwiKVxuXHRcdH1dO1xuXHRcdGNvbnN0IGljb24gPSAocHJvZmlsZS5pY29uICYmIFRoZW1lSWNvbi5pc1RoZW1lSWNvbihwcm9maWxlLmljb24pKSA/IHByb2ZpbGUuaWNvbiA6IENvZGljb24udGVybWluYWw7XG5cdFx0Y29uc3QgbGFiZWwgPSBgJCgke2ljb24uaWR9KSAke3Byb2ZpbGUucHJvZmlsZU5hbWV9YDtcblx0XHRjb25zdCBmcmllbmRseVBhdGggPSBwcm9maWxlLmlzRnJvbVBhdGggPyBiYXNlbmFtZShwcm9maWxlLnBhdGgpIDogcHJvZmlsZS5wYXRoO1xuXHRcdGNvbnN0IGNvbG9yQ2xhc3MgPSBnZXRDb2xvckNsYXNzKHByb2ZpbGUpO1xuXHRcdGNvbnN0IGljb25DbGFzc2VzID0gW107XG5cdFx0aWYgKGNvbG9yQ2xhc3MpIHtcblx0XHRcdGljb25DbGFzc2VzLnB1c2goY29sb3JDbGFzcyk7XG5cdFx0fVxuXG5cdFx0aWYgKHByb2ZpbGUuYXJncykge1xuXHRcdFx0aWYgKGlzU3RyaW5nKHByb2ZpbGUuYXJncykpIHtcblx0XHRcdFx0cmV0dXJuIHsgbGFiZWwsIGRlc2NyaXB0aW9uOiBgJHtwcm9maWxlLnBhdGh9ICR7cHJvZmlsZS5hcmdzfWAsIHByb2ZpbGUsIHByb2ZpbGVOYW1lOiBwcm9maWxlLnByb2ZpbGVOYW1lLCBidXR0b25zLCBpY29uQ2xhc3NlcyB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXJnc1N0cmluZyA9IHByb2ZpbGUuYXJncy5tYXAoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmluY2x1ZGVzKCcgJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gYFwiJHtlLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKX1cImA7IC8vIENvZGVRTCBbU00wMjM4M10ganMvaW5jb21wbGV0ZS1zYW5pdGl6YXRpb24gVGhpcyBpcyBvbmx5IHVzZWQgYXMgYSBsYWJlbCBvbiB0aGUgVUkgc28gdGhpcyBpc24ndCBhIHByb2JsZW1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZTtcblx0XHRcdH0pLmpvaW4oJyAnKTtcblx0XHRcdHJldHVybiB7IGxhYmVsLCBkZXNjcmlwdGlvbjogYCR7ZnJpZW5kbHlQYXRofSAke2FyZ3NTdHJpbmd9YCwgcHJvZmlsZSwgcHJvZmlsZU5hbWU6IHByb2ZpbGUucHJvZmlsZU5hbWUsIGJ1dHRvbnMsIGljb25DbGFzc2VzIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IGxhYmVsLCBkZXNjcmlwdGlvbjogZnJpZW5kbHlQYXRoLCBwcm9maWxlLCBwcm9maWxlTmFtZTogcHJvZmlsZS5wcm9maWxlTmFtZSwgYnV0dG9ucywgaWNvbkNsYXNzZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgX3NvcnRQcm9maWxlUXVpY2tQaWNrSXRlbXMoaXRlbXM6IElQcm9maWxlUXVpY2tQaWNrSXRlbVtdLCBkZWZhdWx0UHJvZmlsZU5hbWU6IHN0cmluZykge1xuXHRcdHJldHVybiBpdGVtcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYi5wcm9maWxlTmFtZSA9PT0gZGVmYXVsdFByb2ZpbGVOYW1lKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGEucHJvZmlsZU5hbWUgPT09IGRlZmF1bHRQcm9maWxlTmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5wcm9maWxlTmFtZS5sb2NhbGVDb21wYXJlKGIucHJvZmlsZU5hbWUpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2ZpbGVRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRwcm9maWxlOiBJVGVybWluYWxQcm9maWxlIHwgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZTtcblx0cHJvZmlsZU5hbWU6IHN0cmluZztcblx0a2V5TW9kcz86IElLZXlNb2RzIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHtcblx0dGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsMEJBQTBHO0FBQ25ILFNBQThFLDZCQUF1RDtBQUNySSxTQUFTLGVBQWUsZUFBZSwrQkFBK0I7QUFDdEUsU0FBUyxvQ0FBb0M7QUFDN0MsWUFBWSxTQUFTO0FBQ3JCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsaUNBQWlDLCtCQUErQjtBQUd6RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxRQUFRLGdCQUFnQjtBQUNqQyxTQUFTLGFBQWE7QUFJZixJQUFNLDJCQUFOLE1BQStCO0FBQUEsRUFDckMsWUFDMkMseUJBQ1EsaUNBQ1YsdUJBQ0gsb0JBQ0wsZUFDTyxzQkFDdEM7QUFOeUM7QUFDUTtBQUNWO0FBQ0g7QUFDTDtBQUNPO0FBQUEsRUFDcEM7QUFBQSxFQUVKLE1BQU0saUJBQWlCLE1BQTJHO0FBQ2pJLFVBQU0sY0FBYyxNQUFNLEtBQUssd0JBQXdCLGVBQWU7QUFDdEUsVUFBTSxjQUFjLHNCQUFzQixXQUFXO0FBQ3JELFVBQU0sU0FBUyxNQUFNLEtBQUssZUFBZSxJQUFJO0FBQzdDLFVBQU0sb0JBQW9CLEdBQUcsc0JBQXNCLGNBQWMsR0FBRyxXQUFXO0FBQy9FLFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBQ0EsUUFBSSxTQUFTLGNBQWM7QUFDMUIsVUFBSSxPQUFPLE9BQU8sU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDLEdBQUc7QUFFekMsY0FBTSxLQUFLLHNCQUFzQixZQUFZLG1CQUFtQixPQUFPLFFBQVEsT0FBTyxvQkFBb0IsSUFBSTtBQUM5RyxlQUFPO0FBQUEsVUFDTixRQUFRO0FBQUEsWUFDUCxxQkFBcUIsT0FBTyxRQUFRO0FBQUEsWUFDcEMsSUFBSSxPQUFPLFFBQVE7QUFBQSxZQUNuQixPQUFPLE9BQU8sUUFBUTtBQUFBLFlBQ3RCLFNBQVM7QUFBQSxjQUNSLE9BQU8sT0FBTyxRQUFRO0FBQUEsY0FDdEIsTUFBTSxPQUFPLFFBQVE7QUFBQSxZQUN0QjtBQUFBLFVBQ0Q7QUFBQSxVQUNBLFNBQVMsT0FBTztBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUdBLFVBQUksT0FBTyxPQUFPLFNBQVMsRUFBRSxhQUFhLEtBQUssQ0FBQyxHQUFHO0FBQ2xELGNBQU0saUJBQWlCLE1BQU0sS0FBSyxzQkFBc0IsU0FBUyxXQUFXO0FBQzVFLFlBQUksT0FBTyxtQkFBbUIsVUFBVTtBQUN2QyxnQkFBTSxhQUFxQztBQUFBLFlBQzFDLE1BQU0sT0FBTyxRQUFRO0FBQUEsVUFDdEI7QUFDQSxjQUFJLE9BQU8sUUFBUSxNQUFNO0FBQ3hCLHVCQUFXLE9BQU8sT0FBTyxRQUFRO0FBQUEsVUFDbEM7QUFDQSxVQUFDLGVBQTZELE9BQU8sUUFBUSxXQUFXLElBQUksS0FBSyx3QkFBd0IsT0FBTyxPQUFPO0FBQ3ZJLGdCQUFNLEtBQUssc0JBQXNCLFlBQVksYUFBYSxnQkFBZ0Isb0JBQW9CLElBQUk7QUFBQSxRQUNuRztBQUFBLE1BQ0Q7QUFFQSxZQUFNLEtBQUssc0JBQXNCLFlBQVksbUJBQW1CLE9BQU8sYUFBYSxvQkFBb0IsSUFBSTtBQUFBLElBQzdHLFdBQVcsU0FBUyxrQkFBa0I7QUFDckMsVUFBSSxPQUFPLE9BQU8sU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDLEdBQUc7QUFDekMsY0FBTSxTQVNGO0FBQUEsVUFDSCxxQkFBcUIsT0FBTyxRQUFRO0FBQUEsVUFDcEMsSUFBSSxPQUFPLFFBQVE7QUFBQSxVQUNuQixPQUFPLE9BQU8sUUFBUTtBQUFBLFVBQ3RCLFNBQVM7QUFBQSxZQUNSLE1BQU0sT0FBTyxRQUFRO0FBQUEsWUFDckIsT0FBTyxPQUFPLFFBQVE7QUFBQSxVQUN2QjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLE9BQU8sUUFBUSxrQkFBa0IsUUFBVztBQUMvQyxpQkFBTyxnQkFBZ0IsT0FBTyxRQUFRO0FBQUEsUUFDdkM7QUFDQSxlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0EsU0FBUyxPQUFPO0FBQUEsUUFDakI7QUFBQSxNQUNELE9BQU87QUFDTixlQUFPLEVBQUUsUUFBUSxPQUFPLFNBQVMsU0FBUyxPQUFPLFFBQVE7QUFBQSxNQUMxRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLE9BQU8sT0FBTyxTQUFTLEVBQUUsYUFBYSxLQUFLLENBQUMsSUFBSSxPQUFPLFFBQVEsY0FBYyxPQUFPLFFBQVE7QUFBQSxFQUNwRztBQUFBLEVBRUEsTUFBYyxlQUFlLE1BQW1GO0FBQy9HLFVBQU0sY0FBYyxNQUFNLEtBQUssd0JBQXdCLGVBQWU7QUFDdEUsVUFBTSxXQUFXLEtBQUssd0JBQXdCO0FBQzlDLFVBQU0sY0FBYyxzQkFBc0IsV0FBVztBQUNyRCxVQUFNLHFCQUFxQixLQUFLLHdCQUF3QixzQkFBc0I7QUFDOUUsUUFBSTtBQUNKLFVBQU0sVUFBK0M7QUFBQSxNQUNwRCxhQUFhLFNBQVMsbUJBQW1CLElBQUksU0FBUyw2Q0FBNkMsdUNBQXVDLElBQUksSUFBSSxTQUFTLDRDQUE0QyxzQ0FBc0M7QUFBQSxNQUM3Tyx3QkFBd0IsT0FBTyxZQUFZO0FBRTFDLFlBQUksQ0FBQyxNQUFNLEtBQUssZUFBZSxRQUFRLEtBQUssT0FBTyxHQUFHO0FBQ3JEO0FBQUEsUUFDRDtBQUNBLFlBQUksT0FBTyxRQUFRLEtBQUssU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDLEdBQUc7QUFDL0M7QUFBQSxRQUNEO0FBQ0EsY0FBTUEsa0JBQTRFLEtBQUssc0JBQXNCLFNBQVMsc0JBQXNCLFdBQVcsV0FBVztBQUNsSyxjQUFNLG1CQUFtQixDQUFDLENBQUNBLGtCQUFpQixPQUFPLEtBQUtBLGVBQWMsSUFBSSxDQUFDO0FBQzNFLGNBQU0sT0FBTyxNQUFNLEtBQUssbUJBQW1CLE1BQU07QUFBQSxVQUNoRCxRQUFRLElBQUksU0FBUyw0QkFBNEIsNkJBQTZCO0FBQUEsVUFDOUUsT0FBTyxRQUFRLEtBQUssUUFBUTtBQUFBLFVBQzVCLGVBQWUsT0FBTSxVQUFTO0FBQzdCLGdCQUFJLGlCQUFpQixTQUFTLEtBQUssR0FBRztBQUNyQyxxQkFBTyxJQUFJLFNBQVMsZ0NBQWdDLGtEQUFrRDtBQUFBLFlBQ3ZHO0FBQ0EsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRCxDQUFDO0FBQ0QsWUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLGlCQUE0RTtBQUFBLFVBQ2pGLEdBQUdBO0FBQUEsVUFDSCxDQUFDLElBQUksR0FBRyxLQUFLLHdCQUF3QixRQUFRLEtBQUssT0FBTztBQUFBLFFBQzFEO0FBQ0EsY0FBTSxLQUFLLHNCQUFzQixZQUFZLGFBQWEsZ0JBQWdCLG9CQUFvQixJQUFJO0FBQUEsTUFDbkc7QUFBQSxNQUNBLFdBQVcsVUFBUSxVQUFVO0FBQUEsSUFDOUI7QUFHQSxVQUFNLGlCQUFrRSxDQUFDO0FBQ3pFLFVBQU0saUJBQWlCLFNBQVMsT0FBTyxPQUFLLENBQUMsRUFBRSxjQUFjO0FBQzdELFVBQU0sdUJBQXVCLFNBQVMsT0FBTyxPQUFLLEVBQUUsY0FBYztBQUVsRSxRQUFJLGVBQWUsU0FBUyxHQUFHO0FBQzlCLHFCQUFlLEtBQUssRUFBRSxNQUFNLGFBQWEsT0FBTyxJQUFJLFNBQVMsb0JBQW9CLFVBQVUsRUFBRSxDQUFDO0FBQzlGLHFCQUFlLEtBQUssR0FBRyxLQUFLLDJCQUEyQixlQUFlLElBQUksT0FBSyxLQUFLLDRCQUE0QixDQUFDLENBQUMsR0FBRyxrQkFBbUIsQ0FBQztBQUFBLElBQzFJO0FBRUEsbUJBQWUsS0FBSyxFQUFFLE1BQU0sYUFBYSxPQUFPLElBQUksU0FBUyw0Q0FBNEMsYUFBYSxFQUFFLENBQUM7QUFDekgsVUFBTSxzQkFBK0MsQ0FBQztBQUN0RCxlQUFXLGVBQWUsS0FBSyx3QkFBd0IscUJBQXFCO0FBQzNFLFVBQUk7QUFDSixVQUFJLFNBQVMsWUFBWSxJQUFJLEdBQUc7QUFDL0IsWUFBSSxZQUFZLEtBQUssV0FBVyxJQUFJLEdBQUc7QUFDdEMsaUJBQU8sVUFBVSxXQUFXLFlBQVksSUFBSTtBQUFBLFFBQzdDLE9BQU87QUFDTixpQkFBTyxVQUFVLE9BQU8sWUFBWSxJQUFJO0FBQUEsUUFDekM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHO0FBQ2pELGVBQU8sS0FBSyxnQ0FBZ0MsZUFBZTtBQUFBLE1BQzVEO0FBQ0EsWUFBTSxhQUFhLGNBQWMsYUFBYSxLQUFLLGNBQWMsY0FBYyxFQUFFLE1BQU0sSUFBSTtBQUMzRixZQUFNLGFBQWEsY0FBYyxXQUFXO0FBQzVDLFlBQU0sY0FBYyxDQUFDO0FBQ3JCLFVBQUksWUFBWTtBQUNmLG9CQUFZLEtBQUssR0FBRyxVQUFVO0FBQUEsTUFDL0I7QUFDQSxVQUFJLFlBQVk7QUFDZixvQkFBWSxLQUFLLFVBQVU7QUFBQSxNQUM1QjtBQUNBLDBCQUFvQixLQUFLO0FBQUEsUUFDeEIsT0FBTyxLQUFLLEtBQUssRUFBRSxLQUFLLFlBQVksS0FBSztBQUFBLFFBQ3pDLFNBQVM7QUFBQSxVQUNSLHFCQUFxQixZQUFZO0FBQUEsVUFDakMsT0FBTyxZQUFZO0FBQUEsVUFDbkIsTUFBTSxZQUFZO0FBQUEsVUFDbEIsSUFBSSxZQUFZO0FBQUEsVUFDaEIsT0FBTyxZQUFZO0FBQUEsVUFDbkIsZUFBZSxZQUFZO0FBQUEsUUFDNUI7QUFBQSxRQUNBLGFBQWEsWUFBWTtBQUFBLFFBQ3pCO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLFFBQUksb0JBQW9CLFNBQVMsR0FBRztBQUNuQyxxQkFBZSxLQUFLLEdBQUcsS0FBSywyQkFBMkIscUJBQXFCLGtCQUFtQixDQUFDO0FBQUEsSUFDakc7QUFFQSxRQUFJLHFCQUFxQixTQUFTLEdBQUc7QUFDcEMscUJBQWUsS0FBSyxFQUFFLE1BQU0sYUFBYSxPQUFPLElBQUksU0FBUyw2QkFBNkIsVUFBVSxFQUFFLENBQUM7QUFDdkcscUJBQWUsS0FBSyxHQUFHLEtBQUssMkJBQTJCLHFCQUFxQixJQUFJLE9BQUssS0FBSyw0QkFBNEIsQ0FBQyxDQUFDLEdBQUcsa0JBQW1CLENBQUM7QUFBQSxJQUNoSjtBQUNBLFVBQU0sdUJBQXVCLHdCQUF3QixLQUFLLGNBQWMsY0FBYyxDQUFDO0FBRXZGLFVBQU0sU0FBUyxNQUFNLEtBQUssbUJBQW1CLEtBQUssZ0JBQWdCLE9BQU87QUFDekUseUJBQXFCLFFBQVE7QUFDN0IsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxNQUFNLEtBQUssZUFBZSxPQUFPLE9BQU8sR0FBRztBQUMvQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksU0FBUztBQUNaLGFBQU8sVUFBVTtBQUFBLElBQ2xCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHdCQUF3QixTQUFnRDtBQUMvRSxVQUFNLFNBQThCLEVBQUUsTUFBTSxRQUFRLEtBQUs7QUFDekQsUUFBSSxRQUFRLE1BQU07QUFDakIsYUFBTyxPQUFPLFFBQVE7QUFBQSxJQUN2QjtBQUNBLFFBQUksUUFBUSxLQUFLO0FBQ2hCLGFBQU8sTUFBTSxRQUFRO0FBQUEsSUFDdEI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxlQUFlLFNBQXlFO0FBQ3JHLFVBQU0sZUFBZSxPQUFPLFNBQVMsRUFBRSxhQUFhLEtBQUssQ0FBQyxLQUFLLFFBQVE7QUFDdkUsVUFBTSxxQkFBcUIsT0FBTyxTQUFTLEVBQUUsYUFBYSxLQUFLLENBQUMsS0FBSyxRQUFRO0FBQzdFLFFBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0I7QUFDekMsYUFBTztBQUFBLElBQ1I7QUFHQSxXQUFPLE1BQU0sSUFBSSxRQUFpQixPQUFLO0FBQ3RDLFlBQU0sY0FBYyxDQUFDO0FBQ3JCLFVBQUksY0FBYztBQUNqQixvQkFBWSxLQUFLLFFBQVEsSUFBSTtBQUFBLE1BQzlCO0FBQ0EsVUFBSSxvQkFBb0I7QUFDdkIsb0JBQVksS0FBSyxrQkFBa0I7QUFBQSxNQUNwQztBQUdBLFlBQU0sU0FBUyxLQUFLLHFCQUFxQjtBQUFBLFFBQ3hDLFNBQVM7QUFBQSxRQUNULElBQUksU0FBUyxxQkFBcUIsb0lBQW9JLElBQUksWUFBWSxLQUFLLEdBQUcsQ0FBQyxHQUFHO0FBQUEsUUFDbE0sQ0FBQztBQUFBLFVBQ0EsT0FBTyxJQUFJLFNBQVMsT0FBTyxLQUFLO0FBQUEsVUFDaEMsS0FBSyxNQUFNLEVBQUUsSUFBSTtBQUFBLFFBQ2xCLEdBQUc7QUFBQSxVQUNGLE9BQU8sSUFBSSxTQUFTLFVBQVUsUUFBUTtBQUFBLFVBQ3RDLEtBQUssTUFBTSxFQUFFLEtBQUs7QUFBQSxRQUNuQixDQUFDO0FBQUEsTUFDRjtBQUNBLFlBQU0sS0FBSyxPQUFPLFVBQVUsRUFBRSxNQUFNO0FBQ25DLFVBQUUsS0FBSztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLDRCQUE0QixTQUFrRDtBQUNyRixVQUFNLFVBQStCLENBQUM7QUFBQSxNQUNyQyxXQUFXLFVBQVUsWUFBWSw0QkFBNEI7QUFBQSxNQUM3RCxTQUFTLElBQUksU0FBUyw0QkFBNEIsNEJBQTRCO0FBQUEsSUFDL0UsQ0FBQztBQUNELFVBQU0sT0FBUSxRQUFRLFFBQVEsVUFBVSxZQUFZLFFBQVEsSUFBSSxJQUFLLFFBQVEsT0FBTyxRQUFRO0FBQzVGLFVBQU0sUUFBUSxLQUFLLEtBQUssRUFBRSxLQUFLLFFBQVEsV0FBVztBQUNsRCxVQUFNLGVBQWUsUUFBUSxhQUFhLFNBQVMsUUFBUSxJQUFJLElBQUksUUFBUTtBQUMzRSxVQUFNLGFBQWEsY0FBYyxPQUFPO0FBQ3hDLFVBQU0sY0FBYyxDQUFDO0FBQ3JCLFFBQUksWUFBWTtBQUNmLGtCQUFZLEtBQUssVUFBVTtBQUFBLElBQzVCO0FBRUEsUUFBSSxRQUFRLE1BQU07QUFDakIsVUFBSSxTQUFTLFFBQVEsSUFBSSxHQUFHO0FBQzNCLGVBQU8sRUFBRSxPQUFPLGFBQWEsR0FBRyxRQUFRLElBQUksSUFBSSxRQUFRLElBQUksSUFBSSxTQUFTLGFBQWEsUUFBUSxhQUFhLFNBQVMsWUFBWTtBQUFBLE1BQ2pJO0FBQ0EsWUFBTSxhQUFhLFFBQVEsS0FBSyxJQUFJLE9BQUs7QUFDeEMsWUFBSSxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQ3BCLGlCQUFPLElBQUksRUFBRSxRQUFRLE1BQU0sS0FBSyxDQUFDO0FBQUEsUUFDbEM7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDLEVBQUUsS0FBSyxHQUFHO0FBQ1gsYUFBTyxFQUFFLE9BQU8sYUFBYSxHQUFHLFlBQVksSUFBSSxVQUFVLElBQUksU0FBUyxhQUFhLFFBQVEsYUFBYSxTQUFTLFlBQVk7QUFBQSxJQUMvSDtBQUNBLFdBQU8sRUFBRSxPQUFPLGFBQWEsY0FBYyxTQUFTLGFBQWEsUUFBUSxhQUFhLFNBQVMsWUFBWTtBQUFBLEVBQzVHO0FBQUEsRUFFUSwyQkFBMkIsT0FBZ0Msb0JBQTRCO0FBQzlGLFdBQU8sTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQzNCLFVBQUksRUFBRSxnQkFBZ0Isb0JBQW9CO0FBQ3pDLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxFQUFFLGdCQUFnQixvQkFBb0I7QUFDekMsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPLEVBQUUsWUFBWSxjQUFjLEVBQUUsV0FBVztBQUFBLElBQ2pELENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUE3UmEsMkJBQU47QUFBQSxFQUVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogWyJjb25maWdQcm9maWxlcyJdCn0K
