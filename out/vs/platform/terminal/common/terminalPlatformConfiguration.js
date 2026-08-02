import { Codicon, getAllCodicons } from "../../../base/common/codicons.js";
import { OperatingSystem, Platform, PlatformToString } from "../../../base/common/platform.js";
import { localize } from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import { Registry } from "../../registry/common/platform.js";
import { TerminalSettingId } from "./terminal.js";
import { createProfileSchemaEnums } from "./terminalProfiles.js";
const terminalColorSchema = {
  type: ["string", "null"],
  enum: [
    "terminal.ansiBlack",
    "terminal.ansiRed",
    "terminal.ansiGreen",
    "terminal.ansiYellow",
    "terminal.ansiBlue",
    "terminal.ansiMagenta",
    "terminal.ansiCyan",
    "terminal.ansiWhite"
  ],
  default: null
};
const terminalIconSchema = {
  type: "string",
  enum: Array.from(getAllCodicons(), (icon) => icon.id),
  markdownEnumDescriptions: Array.from(getAllCodicons(), (icon) => `$(${icon.id})`)
};
const terminalProfileBaseProperties = {
  args: {
    description: localize("terminalProfile.args", "An optional set of arguments to run the shell executable with."),
    type: "array",
    items: {
      type: "string"
    }
  },
  icon: {
    description: localize("terminalProfile.icon", "A codicon ID to associate with the terminal icon."),
    ...terminalIconSchema
  },
  color: {
    description: localize("terminalProfile.color", "A theme color ID to associate with the terminal icon."),
    ...terminalColorSchema
  },
  env: {
    markdownDescription: localize("terminalProfile.env", "An object with environment variables that will be added to the terminal profile process. Set to `null` to delete environment variables from the base environment."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  }
};
const terminalProfileSchema = {
  type: "object",
  required: ["path"],
  properties: {
    path: {
      description: localize("terminalProfile.path", "A single path to a shell executable or an array of paths that will be used as fallbacks when one fails."),
      type: ["string", "array"],
      items: {
        type: "string"
      }
    },
    overrideName: {
      description: localize("terminalProfile.overrideName", "Whether or not to replace the dynamic terminal title that detects what program is running with the static profile name."),
      type: "boolean"
    },
    ...terminalProfileBaseProperties
  }
};
const terminalAutomationProfileSchema = {
  type: "object",
  required: ["path"],
  properties: {
    path: {
      description: localize("terminalAutomationProfile.path", "A path to a shell executable."),
      type: ["string"],
      items: {
        type: "string"
      }
    },
    ...terminalProfileBaseProperties
  }
};
function createTerminalProfileMarkdownDescription(platform) {
  const key = platform === Platform.Linux ? "linux" : platform === Platform.Mac ? "osx" : "windows";
  return localize(
    {
      key: "terminal.integrated.profile",
      comment: ["{0} is the platform, {1} is a code block, {2} and {3} are a link start and end"]
    },
    "A set of terminal profile customizations for {0} which allows adding, removing or changing how terminals are launched. Profiles are made up of a mandatory path, optional arguments and other presentation options.\n\nTo override an existing profile use its profile name as the key, for example:\n\n{1}\n\n{2}Read more about configuring profiles{3}.",
    PlatformToString(platform),
    '```json\n"terminal.integrated.profile.' + key + '": {\n  "bash": null\n}\n```',
    "[",
    "](https://code.visualstudio.com/docs/terminal/profiles)"
  );
}
const terminalPlatformConfiguration = {
  id: "terminal",
  order: 100,
  title: localize("terminalIntegratedConfigurationTitle", "Integrated Terminal"),
  type: "object",
  properties: {
    [TerminalSettingId.AutomationProfileLinux]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.automationProfile.linux", "The terminal profile to use on Linux for automation-related terminal usage like tasks and debug."),
      type: ["object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AutomationProfileMacOs]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.automationProfile.osx", "The terminal profile to use on macOS for automation-related terminal usage like tasks and debug."),
      type: ["object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AutomationProfileWindows]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.automationProfile.windows", "The terminal profile to use for automation-related terminal usage like tasks and debug. This setting will currently be ignored if {0} (now deprecated) is set.", "`terminal.integrated.automationShell.windows`"),
      type: ["object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AgentHostProfileLinux]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.agentHostProfile.linux", "The terminal profile to use on Linux for agent host terminals, including shells launched by AI agent tools. Accepts either a profile name from {0} or an inline profile object. When unset, falls back to {1}. Currently applies to the local agent host. Only the executable `path` is honored today; `args` and `env` from the profile are ignored. Remote agent hosts need remote-side shell configuration because local resolved paths may be invalid on the remote.", "`#terminal.integrated.profiles.linux#`", "`#terminal.integrated.defaultProfile.linux#`"),
      type: ["string", "object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        { type: "string" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AgentHostProfileMacOs]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.agentHostProfile.osx", "The terminal profile to use on macOS for agent host terminals, including shells launched by AI agent tools. Accepts either a profile name from {0} or an inline profile object. When unset, falls back to {1}. Currently applies to the local agent host. Only the executable `path` is honored today; `args` and `env` from the profile are ignored. Remote agent hosts need remote-side shell configuration because local resolved paths may be invalid on the remote.", "`#terminal.integrated.profiles.osx#`", "`#terminal.integrated.defaultProfile.osx#`"),
      type: ["string", "object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        { type: "string" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AgentHostProfileWindows]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.agentHostProfile.windows", "The terminal profile to use on Windows for agent host terminals, including shells launched by AI agent tools. Accepts either a profile name from {0} or an inline profile object. When unset, falls back to {1}. Currently applies to the local agent host. Only the executable `path` is honored today; `args` and `env` from the profile are ignored. Remote agent hosts need remote-side shell configuration because local resolved paths may be invalid on the remote.", "`#terminal.integrated.profiles.windows#`", "`#terminal.integrated.defaultProfile.windows#`"),
      type: ["string", "object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        { type: "string" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.ProfilesWindows]: {
      restricted: true,
      markdownDescription: createTerminalProfileMarkdownDescription(Platform.Windows),
      type: "object",
      default: {
        "PowerShell": {
          source: "PowerShell",
          icon: Codicon.terminalPowershell.id
        },
        "Command Prompt": {
          path: [
            "${env:windir}\\Sysnative\\cmd.exe",
            "${env:windir}\\System32\\cmd.exe"
          ],
          args: [],
          icon: Codicon.terminalCmd.id
        },
        "Git Bash": {
          source: "Git Bash",
          icon: Codicon.terminalGitBash.id
        }
      },
      additionalProperties: {
        "anyOf": [
          {
            type: "object",
            required: ["source"],
            properties: {
              source: {
                description: localize("terminalProfile.windowsSource", "A profile source that will auto detect the paths to the shell. Note that non-standard executable locations are not supported and must be created manually in a new profile."),
                enum: ["PowerShell", "Git Bash"]
              },
              ...terminalProfileBaseProperties
            }
          },
          {
            type: "object",
            required: ["extensionIdentifier", "id", "title"],
            properties: {
              extensionIdentifier: {
                description: localize("terminalProfile.windowsExtensionIdentifier", "The extension that contributed this profile."),
                type: "string"
              },
              id: {
                description: localize("terminalProfile.windowsExtensionId", "The id of the extension terminal"),
                type: "string"
              },
              title: {
                description: localize("terminalProfile.windowsExtensionTitle", "The name of the extension terminal"),
                type: "string"
              },
              ...terminalProfileBaseProperties
            }
          },
          { type: "null" },
          terminalProfileSchema
        ]
      }
    },
    [TerminalSettingId.ProfilesMacOs]: {
      restricted: true,
      markdownDescription: createTerminalProfileMarkdownDescription(Platform.Mac),
      type: "object",
      default: {
        "bash": {
          path: "bash",
          args: ["-l"],
          icon: Codicon.terminalBash.id
        },
        "zsh": {
          path: "zsh",
          args: ["-l"]
        },
        "fish": {
          path: "fish",
          args: ["-l"]
        },
        "tmux": {
          path: "tmux",
          icon: Codicon.terminalTmux.id
        },
        "pwsh": {
          path: "pwsh",
          icon: Codicon.terminalPowershell.id
        }
      },
      additionalProperties: {
        "anyOf": [
          {
            type: "object",
            required: ["extensionIdentifier", "id", "title"],
            properties: {
              extensionIdentifier: {
                description: localize("terminalProfile.osxExtensionIdentifier", "The extension that contributed this profile."),
                type: "string"
              },
              id: {
                description: localize("terminalProfile.osxExtensionId", "The id of the extension terminal"),
                type: "string"
              },
              title: {
                description: localize("terminalProfile.osxExtensionTitle", "The name of the extension terminal"),
                type: "string"
              },
              ...terminalProfileBaseProperties
            }
          },
          { type: "null" },
          terminalProfileSchema
        ]
      }
    },
    [TerminalSettingId.ProfilesLinux]: {
      restricted: true,
      markdownDescription: createTerminalProfileMarkdownDescription(Platform.Linux),
      type: "object",
      default: {
        "bash": {
          path: "bash",
          icon: Codicon.terminalBash.id
        },
        "zsh": {
          path: "zsh"
        },
        "fish": {
          path: "fish"
        },
        "tmux": {
          path: "tmux",
          icon: Codicon.terminalTmux.id
        },
        "pwsh": {
          path: "pwsh",
          icon: Codicon.terminalPowershell.id
        }
      },
      additionalProperties: {
        "anyOf": [
          {
            type: "object",
            required: ["extensionIdentifier", "id", "title"],
            properties: {
              extensionIdentifier: {
                description: localize("terminalProfile.linuxExtensionIdentifier", "The extension that contributed this profile."),
                type: "string"
              },
              id: {
                description: localize("terminalProfile.linuxExtensionId", "The id of the extension terminal"),
                type: "string"
              },
              title: {
                description: localize("terminalProfile.linuxExtensionTitle", "The name of the extension terminal"),
                type: "string"
              },
              ...terminalProfileBaseProperties
            }
          },
          { type: "null" },
          terminalProfileSchema
        ]
      }
    },
    [TerminalSettingId.UseWslProfiles]: {
      description: localize("terminal.integrated.useWslProfiles", "Controls whether or not WSL distros are shown in the terminal dropdown"),
      type: "boolean",
      default: true
    },
    [TerminalSettingId.InheritEnv]: {
      scope: ConfigurationScope.APPLICATION,
      description: localize("terminal.integrated.inheritEnv", "Whether new shells should inherit their environment from VS Code, which may source a login shell to ensure $PATH and other development variables are initialized. This has no effect on Windows."),
      type: "boolean",
      default: true
    },
    [TerminalSettingId.PersistentSessionScrollback]: {
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: localize("terminal.integrated.persistentSessionScrollback", "Controls the maximum amount of lines that will be restored when reconnecting to a persistent terminal session. Increasing this will restore more lines of scrollback at the cost of more memory and increase the time it takes to connect to terminals on start up. This setting requires a restart to take effect and should be set to a value less than or equal to `#terminal.integrated.scrollback#`."),
      type: "number",
      default: 100
    },
    [TerminalSettingId.ShowLinkHover]: {
      scope: ConfigurationScope.APPLICATION,
      description: localize("terminal.integrated.showLinkHover", "Whether to show hovers for links in the terminal output."),
      type: "boolean",
      default: true
    },
    [TerminalSettingId.IgnoreProcessNames]: {
      markdownDescription: localize("terminal.integrated.confirmIgnoreProcesses", "A set of process names to ignore when using the {0} setting.", "`#terminal.integrated.confirmOnKill#`"),
      type: "array",
      items: {
        type: "string",
        uniqueItems: true
      },
      default: [
        // Popular prompt programs, these should not count as child processes
        "starship",
        "oh-my-posh",
        // Git bash may runs a subprocess of itself (bin\bash.exe -> usr\bin\bash.exe)
        "bash",
        "zsh"
      ]
    }
  }
};
function registerTerminalPlatformConfiguration() {
  Registry.as(Extensions.Configuration).registerConfiguration(terminalPlatformConfiguration);
  registerTerminalDefaultProfileConfiguration();
}
let defaultProfilesConfiguration;
function registerTerminalDefaultProfileConfiguration(detectedProfiles, extensionContributedProfiles) {
  const registry = Registry.as(Extensions.Configuration);
  let profileEnum;
  if (detectedProfiles) {
    profileEnum = createProfileSchemaEnums(detectedProfiles?.profiles, extensionContributedProfiles);
  }
  const oldDefaultProfilesConfiguration = defaultProfilesConfiguration;
  defaultProfilesConfiguration = {
    id: "terminal",
    order: 100,
    title: localize("terminalIntegratedConfigurationTitle", "Integrated Terminal"),
    type: "object",
    properties: {
      [TerminalSettingId.DefaultProfileLinux]: {
        restricted: true,
        markdownDescription: localize("terminal.integrated.defaultProfile.linux", "The default terminal profile on Linux."),
        type: ["string", "null"],
        default: null,
        enum: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.values : void 0,
        markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.markdownDescriptions : void 0
      },
      [TerminalSettingId.DefaultProfileMacOs]: {
        restricted: true,
        markdownDescription: localize("terminal.integrated.defaultProfile.osx", "The default terminal profile on macOS."),
        type: ["string", "null"],
        default: null,
        enum: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.values : void 0,
        markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.markdownDescriptions : void 0
      },
      [TerminalSettingId.DefaultProfileWindows]: {
        restricted: true,
        markdownDescription: localize("terminal.integrated.defaultProfile.windows", "The default terminal profile on Windows."),
        type: ["string", "null"],
        default: null,
        enum: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.values : void 0,
        markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.markdownDescriptions : void 0
      }
    }
  };
  registry.updateConfigurations({ add: [defaultProfilesConfiguration], remove: oldDefaultProfilesConfiguration ? [oldDefaultProfilesConfiguration] : [] });
}
export {
  registerTerminalDefaultProfileConfiguration,
  registerTerminalPlatformConfiguration,
  terminalColorSchema,
  terminalIconSchema,
  terminalProfileBaseProperties
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFBsYXRmb3JtQ29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24sIGdldEFsbENvZGljb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIFBsYXRmb3JtLCBQbGF0Zm9ybVRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSwgSVRlcm1pbmFsUHJvZmlsZSwgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyB9IGZyb20gJy4vdGVybWluYWxQcm9maWxlcy5qcyc7XG5cbmV4cG9ydCBjb25zdCB0ZXJtaW5hbENvbG9yU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddLFxuXHRlbnVtOiBbXG5cdFx0J3Rlcm1pbmFsLmFuc2lCbGFjaycsXG5cdFx0J3Rlcm1pbmFsLmFuc2lSZWQnLFxuXHRcdCd0ZXJtaW5hbC5hbnNpR3JlZW4nLFxuXHRcdCd0ZXJtaW5hbC5hbnNpWWVsbG93Jyxcblx0XHQndGVybWluYWwuYW5zaUJsdWUnLFxuXHRcdCd0ZXJtaW5hbC5hbnNpTWFnZW50YScsXG5cdFx0J3Rlcm1pbmFsLmFuc2lDeWFuJyxcblx0XHQndGVybWluYWwuYW5zaVdoaXRlJ1xuXHRdLFxuXHRkZWZhdWx0OiBudWxsXG59O1xuXG5leHBvcnQgY29uc3QgdGVybWluYWxJY29uU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGVudW06IEFycmF5LmZyb20oZ2V0QWxsQ29kaWNvbnMoKSwgaWNvbiA9PiBpY29uLmlkKSxcblx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBBcnJheS5mcm9tKGdldEFsbENvZGljb25zKCksIGljb24gPT4gYCQoJHtpY29uLmlkfSlgKSxcbn07XG5cbmV4cG9ydCBjb25zdCB0ZXJtaW5hbFByb2ZpbGVCYXNlUHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgPSB7XG5cdGFyZ3M6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5hcmdzJywgJ0FuIG9wdGlvbmFsIHNldCBvZiBhcmd1bWVudHMgdG8gcnVuIHRoZSBzaGVsbCBleGVjdXRhYmxlIHdpdGguJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9XG5cdH0sXG5cdGljb246IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5pY29uJywgJ0EgY29kaWNvbiBJRCB0byBhc3NvY2lhdGUgd2l0aCB0aGUgdGVybWluYWwgaWNvbi4nKSxcblx0XHQuLi50ZXJtaW5hbEljb25TY2hlbWFcblx0fSxcblx0Y29sb3I6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5jb2xvcicsICdBIHRoZW1lIGNvbG9yIElEIHRvIGFzc29jaWF0ZSB3aXRoIHRoZSB0ZXJtaW5hbCBpY29uLicpLFxuXHRcdC4uLnRlcm1pbmFsQ29sb3JTY2hlbWFcblx0fSxcblx0ZW52OiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5lbnYnLCBcIkFuIG9iamVjdCB3aXRoIGVudmlyb25tZW50IHZhcmlhYmxlcyB0aGF0IHdpbGwgYmUgYWRkZWQgdG8gdGhlIHRlcm1pbmFsIHByb2ZpbGUgcHJvY2Vzcy4gU2V0IHRvIGBudWxsYCB0byBkZWxldGUgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZyb20gdGhlIGJhc2UgZW52aXJvbm1lbnQuXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ11cblx0XHR9LFxuXHRcdGRlZmF1bHQ6IHt9XG5cdH1cbn07XG5cbmNvbnN0IHRlcm1pbmFsUHJvZmlsZVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRyZXF1aXJlZDogWydwYXRoJ10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHRwYXRoOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5wYXRoJywgJ0Egc2luZ2xlIHBhdGggdG8gYSBzaGVsbCBleGVjdXRhYmxlIG9yIGFuIGFycmF5IG9mIHBhdGhzIHRoYXQgd2lsbCBiZSB1c2VkIGFzIGZhbGxiYWNrcyB3aGVuIG9uZSBmYWlscy4nKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ2FycmF5J10sXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b3ZlcnJpZGVOYW1lOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5vdmVycmlkZU5hbWUnLCAnV2hldGhlciBvciBub3QgdG8gcmVwbGFjZSB0aGUgZHluYW1pYyB0ZXJtaW5hbCB0aXRsZSB0aGF0IGRldGVjdHMgd2hhdCBwcm9ncmFtIGlzIHJ1bm5pbmcgd2l0aCB0aGUgc3RhdGljIHByb2ZpbGUgbmFtZS4nKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdH0sXG5cdFx0Li4udGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXNcblx0fVxufTtcblxuY29uc3QgdGVybWluYWxBdXRvbWF0aW9uUHJvZmlsZVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRyZXF1aXJlZDogWydwYXRoJ10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHRwYXRoOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsQXV0b21hdGlvblByb2ZpbGUucGF0aCcsICdBIHBhdGggdG8gYSBzaGVsbCBleGVjdXRhYmxlLicpLFxuXHRcdFx0dHlwZTogWydzdHJpbmcnXSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQuLi50ZXJtaW5hbFByb2ZpbGVCYXNlUHJvcGVydGllc1xuXHR9XG59O1xuXG5mdW5jdGlvbiBjcmVhdGVUZXJtaW5hbFByb2ZpbGVNYXJrZG93bkRlc2NyaXB0aW9uKHBsYXRmb3JtOiBQbGF0Zm9ybS5MaW51eCB8IFBsYXRmb3JtLk1hYyB8IFBsYXRmb3JtLldpbmRvd3MpOiBzdHJpbmcge1xuXHRjb25zdCBrZXkgPSBwbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTGludXggPyAnbGludXgnIDogcGxhdGZvcm0gPT09IFBsYXRmb3JtLk1hYyA/ICdvc3gnIDogJ3dpbmRvd3MnO1xuXHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0e1xuXHRcdFx0a2V5OiAndGVybWluYWwuaW50ZWdyYXRlZC5wcm9maWxlJyxcblx0XHRcdGNvbW1lbnQ6IFsnezB9IGlzIHRoZSBwbGF0Zm9ybSwgezF9IGlzIGEgY29kZSBibG9jaywgezJ9IGFuZCB7M30gYXJlIGEgbGluayBzdGFydCBhbmQgZW5kJ11cblx0XHR9LFxuXHRcdFwiQSBzZXQgb2YgdGVybWluYWwgcHJvZmlsZSBjdXN0b21pemF0aW9ucyBmb3IgezB9IHdoaWNoIGFsbG93cyBhZGRpbmcsIHJlbW92aW5nIG9yIGNoYW5naW5nIGhvdyB0ZXJtaW5hbHMgYXJlIGxhdW5jaGVkLiBQcm9maWxlcyBhcmUgbWFkZSB1cCBvZiBhIG1hbmRhdG9yeSBwYXRoLCBvcHRpb25hbCBhcmd1bWVudHMgYW5kIG90aGVyIHByZXNlbnRhdGlvbiBvcHRpb25zLlxcblxcblRvIG92ZXJyaWRlIGFuIGV4aXN0aW5nIHByb2ZpbGUgdXNlIGl0cyBwcm9maWxlIG5hbWUgYXMgdGhlIGtleSwgZm9yIGV4YW1wbGU6XFxuXFxuezF9XFxuXFxuezJ9UmVhZCBtb3JlIGFib3V0IGNvbmZpZ3VyaW5nIHByb2ZpbGVzezN9LlwiLFxuXHRcdFBsYXRmb3JtVG9TdHJpbmcocGxhdGZvcm0pLFxuXHRcdCdgYGBqc29uXFxuXCJ0ZXJtaW5hbC5pbnRlZ3JhdGVkLnByb2ZpbGUuJyArIGtleSArICdcIjoge1xcbiAgXCJiYXNoXCI6IG51bGxcXG59XFxuYGBgJyxcblx0XHQnWycsXG5cdFx0J10oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy90ZXJtaW5hbC9wcm9maWxlcyknXG5cdCk7XG59XG5cbmNvbnN0IHRlcm1pbmFsUGxhdGZvcm1Db25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdGlkOiAndGVybWluYWwnLFxuXHRvcmRlcjogMTAwLFxuXHR0aXRsZTogbG9jYWxpemUoJ3Rlcm1pbmFsSW50ZWdyYXRlZENvbmZpZ3VyYXRpb25UaXRsZScsIFwiSW50ZWdyYXRlZCBUZXJtaW5hbFwiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuQXV0b21hdGlvblByb2ZpbGVMaW51eF06IHtcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hdXRvbWF0aW9uUHJvZmlsZS5saW51eCcsIFwiVGhlIHRlcm1pbmFsIHByb2ZpbGUgdG8gdXNlIG9uIExpbnV4IGZvciBhdXRvbWF0aW9uLXJlbGF0ZWQgdGVybWluYWwgdXNhZ2UgbGlrZSB0YXNrcyBhbmQgZGVidWcuXCIpLFxuXHRcdFx0dHlwZTogWydvYmplY3QnLCAnbnVsbCddLFxuXHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdFx0dGVybWluYWxBdXRvbWF0aW9uUHJvZmlsZVNjaGVtYVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0cGF0aDogJyR7MX0nLFxuXHRcdFx0XHRcdFx0aWNvbjogJyR7Mn0nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuQXV0b21hdGlvblByb2ZpbGVNYWNPc106IHtcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hdXRvbWF0aW9uUHJvZmlsZS5vc3gnLCBcIlRoZSB0ZXJtaW5hbCBwcm9maWxlIHRvIHVzZSBvbiBtYWNPUyBmb3IgYXV0b21hdGlvbi1yZWxhdGVkIHRlcm1pbmFsIHVzYWdlIGxpa2UgdGFza3MgYW5kIGRlYnVnLlwiKSxcblx0XHRcdHR5cGU6IFsnb2JqZWN0JywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdHsgdHlwZTogJ251bGwnIH0sXG5cdFx0XHRcdHRlcm1pbmFsQXV0b21hdGlvblByb2ZpbGVTY2hlbWFcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdHBhdGg6ICckezF9Jyxcblx0XHRcdFx0XHRcdGljb246ICckezJ9J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkF1dG9tYXRpb25Qcm9maWxlV2luZG93c106IHtcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hdXRvbWF0aW9uUHJvZmlsZS53aW5kb3dzJywgXCJUaGUgdGVybWluYWwgcHJvZmlsZSB0byB1c2UgZm9yIGF1dG9tYXRpb24tcmVsYXRlZCB0ZXJtaW5hbCB1c2FnZSBsaWtlIHRhc2tzIGFuZCBkZWJ1Zy4gVGhpcyBzZXR0aW5nIHdpbGwgY3VycmVudGx5IGJlIGlnbm9yZWQgaWYgezB9IChub3cgZGVwcmVjYXRlZCkgaXMgc2V0LlwiLCAnYHRlcm1pbmFsLmludGVncmF0ZWQuYXV0b21hdGlvblNoZWxsLndpbmRvd3NgJyksXG5cdFx0XHR0eXBlOiBbJ29iamVjdCcsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHR0ZXJtaW5hbEF1dG9tYXRpb25Qcm9maWxlU2NoZW1hXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHRwYXRoOiAnJHsxfScsXG5cdFx0XHRcdFx0XHRpY29uOiAnJHsyfSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdFtUZXJtaW5hbFNldHRpbmdJZC5BZ2VudEhvc3RQcm9maWxlTGludXhdOiB7XG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYWdlbnRIb3N0UHJvZmlsZS5saW51eCcsIFwiVGhlIHRlcm1pbmFsIHByb2ZpbGUgdG8gdXNlIG9uIExpbnV4IGZvciBhZ2VudCBob3N0IHRlcm1pbmFscywgaW5jbHVkaW5nIHNoZWxscyBsYXVuY2hlZCBieSBBSSBhZ2VudCB0b29scy4gQWNjZXB0cyBlaXRoZXIgYSBwcm9maWxlIG5hbWUgZnJvbSB7MH0gb3IgYW4gaW5saW5lIHByb2ZpbGUgb2JqZWN0LiBXaGVuIHVuc2V0LCBmYWxscyBiYWNrIHRvIHsxfS4gQ3VycmVudGx5IGFwcGxpZXMgdG8gdGhlIGxvY2FsIGFnZW50IGhvc3QuIE9ubHkgdGhlIGV4ZWN1dGFibGUgYHBhdGhgIGlzIGhvbm9yZWQgdG9kYXk7IGBhcmdzYCBhbmQgYGVudmAgZnJvbSB0aGUgcHJvZmlsZSBhcmUgaWdub3JlZC4gUmVtb3RlIGFnZW50IGhvc3RzIG5lZWQgcmVtb3RlLXNpZGUgc2hlbGwgY29uZmlndXJhdGlvbiBiZWNhdXNlIGxvY2FsIHJlc29sdmVkIHBhdGhzIG1heSBiZSBpbnZhbGlkIG9uIHRoZSByZW1vdGUuXCIsICdgI3Rlcm1pbmFsLmludGVncmF0ZWQucHJvZmlsZXMubGludXgjYCcsICdgI3Rlcm1pbmFsLmludGVncmF0ZWQuZGVmYXVsdFByb2ZpbGUubGludXgjYCcpLFxuXHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0JywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdHsgdHlwZTogJ251bGwnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0dGVybWluYWxBdXRvbWF0aW9uUHJvZmlsZVNjaGVtYVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0cGF0aDogJyR7MX0nLFxuXHRcdFx0XHRcdFx0aWNvbjogJyR7Mn0nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuQWdlbnRIb3N0UHJvZmlsZU1hY09zXToge1xuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmFnZW50SG9zdFByb2ZpbGUub3N4JywgXCJUaGUgdGVybWluYWwgcHJvZmlsZSB0byB1c2Ugb24gbWFjT1MgZm9yIGFnZW50IGhvc3QgdGVybWluYWxzLCBpbmNsdWRpbmcgc2hlbGxzIGxhdW5jaGVkIGJ5IEFJIGFnZW50IHRvb2xzLiBBY2NlcHRzIGVpdGhlciBhIHByb2ZpbGUgbmFtZSBmcm9tIHswfSBvciBhbiBpbmxpbmUgcHJvZmlsZSBvYmplY3QuIFdoZW4gdW5zZXQsIGZhbGxzIGJhY2sgdG8gezF9LiBDdXJyZW50bHkgYXBwbGllcyB0byB0aGUgbG9jYWwgYWdlbnQgaG9zdC4gT25seSB0aGUgZXhlY3V0YWJsZSBgcGF0aGAgaXMgaG9ub3JlZCB0b2RheTsgYGFyZ3NgIGFuZCBgZW52YCBmcm9tIHRoZSBwcm9maWxlIGFyZSBpZ25vcmVkLiBSZW1vdGUgYWdlbnQgaG9zdHMgbmVlZCByZW1vdGUtc2lkZSBzaGVsbCBjb25maWd1cmF0aW9uIGJlY2F1c2UgbG9jYWwgcmVzb2x2ZWQgcGF0aHMgbWF5IGJlIGludmFsaWQgb24gdGhlIHJlbW90ZS5cIiwgJ2AjdGVybWluYWwuaW50ZWdyYXRlZC5wcm9maWxlcy5vc3gjYCcsICdgI3Rlcm1pbmFsLmludGVncmF0ZWQuZGVmYXVsdFByb2ZpbGUub3N4I2AnKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCcsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdHRlcm1pbmFsQXV0b21hdGlvblByb2ZpbGVTY2hlbWFcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdHBhdGg6ICckezF9Jyxcblx0XHRcdFx0XHRcdGljb246ICckezJ9J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkFnZW50SG9zdFByb2ZpbGVXaW5kb3dzXToge1xuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmFnZW50SG9zdFByb2ZpbGUud2luZG93cycsIFwiVGhlIHRlcm1pbmFsIHByb2ZpbGUgdG8gdXNlIG9uIFdpbmRvd3MgZm9yIGFnZW50IGhvc3QgdGVybWluYWxzLCBpbmNsdWRpbmcgc2hlbGxzIGxhdW5jaGVkIGJ5IEFJIGFnZW50IHRvb2xzLiBBY2NlcHRzIGVpdGhlciBhIHByb2ZpbGUgbmFtZSBmcm9tIHswfSBvciBhbiBpbmxpbmUgcHJvZmlsZSBvYmplY3QuIFdoZW4gdW5zZXQsIGZhbGxzIGJhY2sgdG8gezF9LiBDdXJyZW50bHkgYXBwbGllcyB0byB0aGUgbG9jYWwgYWdlbnQgaG9zdC4gT25seSB0aGUgZXhlY3V0YWJsZSBgcGF0aGAgaXMgaG9ub3JlZCB0b2RheTsgYGFyZ3NgIGFuZCBgZW52YCBmcm9tIHRoZSBwcm9maWxlIGFyZSBpZ25vcmVkLiBSZW1vdGUgYWdlbnQgaG9zdHMgbmVlZCByZW1vdGUtc2lkZSBzaGVsbCBjb25maWd1cmF0aW9uIGJlY2F1c2UgbG9jYWwgcmVzb2x2ZWQgcGF0aHMgbWF5IGJlIGludmFsaWQgb24gdGhlIHJlbW90ZS5cIiwgJ2AjdGVybWluYWwuaW50ZWdyYXRlZC5wcm9maWxlcy53aW5kb3dzI2AnLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRQcm9maWxlLndpbmRvd3MjYCcpLFxuXHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0JywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdHsgdHlwZTogJ251bGwnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0dGVybWluYWxBdXRvbWF0aW9uUHJvZmlsZVNjaGVtYVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0cGF0aDogJyR7MX0nLFxuXHRcdFx0XHRcdFx0aWNvbjogJyR7Mn0nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuUHJvZmlsZXNXaW5kb3dzXToge1xuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGNyZWF0ZVRlcm1pbmFsUHJvZmlsZU1hcmtkb3duRGVzY3JpcHRpb24oUGxhdGZvcm0uV2luZG93cyksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J1Bvd2VyU2hlbGwnOiB7XG5cdFx0XHRcdFx0c291cmNlOiAnUG93ZXJTaGVsbCcsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbFBvd2Vyc2hlbGwuaWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdDb21tYW5kIFByb21wdCc6IHtcblx0XHRcdFx0XHRwYXRoOiBbXG5cdFx0XHRcdFx0XHQnJHtlbnY6d2luZGlyfVxcXFxTeXNuYXRpdmVcXFxcY21kLmV4ZScsXG5cdFx0XHRcdFx0XHQnJHtlbnY6d2luZGlyfVxcXFxTeXN0ZW0zMlxcXFxjbWQuZXhlJ1xuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0YXJnczogW10sXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbENtZC5pZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0J0dpdCBCYXNoJzoge1xuXHRcdFx0XHRcdHNvdXJjZTogJ0dpdCBCYXNoJyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsR2l0QmFzaC5pZCxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3NvdXJjZSddLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS53aW5kb3dzU291cmNlJywgJ0EgcHJvZmlsZSBzb3VyY2UgdGhhdCB3aWxsIGF1dG8gZGV0ZWN0IHRoZSBwYXRocyB0byB0aGUgc2hlbGwuIE5vdGUgdGhhdCBub24tc3RhbmRhcmQgZXhlY3V0YWJsZSBsb2NhdGlvbnMgYXJlIG5vdCBzdXBwb3J0ZWQgYW5kIG11c3QgYmUgY3JlYXRlZCBtYW51YWxseSBpbiBhIG5ldyBwcm9maWxlLicpLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsnUG93ZXJTaGVsbCcsICdHaXQgQmFzaCddXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdC4uLnRlcm1pbmFsUHJvZmlsZUJhc2VQcm9wZXJ0aWVzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2V4dGVuc2lvbklkZW50aWZpZXInLCAnaWQnLCAndGl0bGUnXSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLndpbmRvd3NFeHRlbnNpb25JZGVudGlmaWVyJywgJ1RoZSBleHRlbnNpb24gdGhhdCBjb250cmlidXRlZCB0aGlzIHByb2ZpbGUuJyksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS53aW5kb3dzRXh0ZW5zaW9uSWQnLCAnVGhlIGlkIG9mIHRoZSBleHRlbnNpb24gdGVybWluYWwnKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLndpbmRvd3NFeHRlbnNpb25UaXRsZScsICdUaGUgbmFtZSBvZiB0aGUgZXh0ZW5zaW9uIHRlcm1pbmFsJyksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Li4udGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXNcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ251bGwnIH0sXG5cdFx0XHRcdFx0dGVybWluYWxQcm9maWxlU2NoZW1hXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdFtUZXJtaW5hbFNldHRpbmdJZC5Qcm9maWxlc01hY09zXToge1xuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGNyZWF0ZVRlcm1pbmFsUHJvZmlsZU1hcmtkb3duRGVzY3JpcHRpb24oUGxhdGZvcm0uTWFjKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQnYmFzaCc6IHtcblx0XHRcdFx0XHRwYXRoOiAnYmFzaCcsXG5cdFx0XHRcdFx0YXJnczogWyctbCddLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udGVybWluYWxCYXNoLmlkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCd6c2gnOiB7XG5cdFx0XHRcdFx0cGF0aDogJ3pzaCcsXG5cdFx0XHRcdFx0YXJnczogWyctbCddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdmaXNoJzoge1xuXHRcdFx0XHRcdHBhdGg6ICdmaXNoJyxcblx0XHRcdFx0XHRhcmdzOiBbJy1sJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0J3RtdXgnOiB7XG5cdFx0XHRcdFx0cGF0aDogJ3RtdXgnLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udGVybWluYWxUbXV4LmlkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdwd3NoJzoge1xuXHRcdFx0XHRcdHBhdGg6ICdwd3NoJyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsUG93ZXJzaGVsbC5pZFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnZXh0ZW5zaW9uSWRlbnRpZmllcicsICdpZCcsICd0aXRsZSddLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25JZGVudGlmaWVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUub3N4RXh0ZW5zaW9uSWRlbnRpZmllcicsICdUaGUgZXh0ZW5zaW9uIHRoYXQgY29udHJpYnV0ZWQgdGhpcyBwcm9maWxlLicpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUub3N4RXh0ZW5zaW9uSWQnLCAnVGhlIGlkIG9mIHRoZSBleHRlbnNpb24gdGVybWluYWwnKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLm9zeEV4dGVuc2lvblRpdGxlJywgJ1RoZSBuYW1lIG9mIHRoZSBleHRlbnNpb24gdGVybWluYWwnKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQuLi50ZXJtaW5hbFByb2ZpbGVCYXNlUHJvcGVydGllc1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdFx0XHR0ZXJtaW5hbFByb2ZpbGVTY2hlbWFcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLlByb2ZpbGVzTGludXhdOiB7XG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogY3JlYXRlVGVybWluYWxQcm9maWxlTWFya2Rvd25EZXNjcmlwdGlvbihQbGF0Zm9ybS5MaW51eCksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J2Jhc2gnOiB7XG5cdFx0XHRcdFx0cGF0aDogJ2Jhc2gnLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udGVybWluYWxCYXNoLmlkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCd6c2gnOiB7XG5cdFx0XHRcdFx0cGF0aDogJ3pzaCdcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Zpc2gnOiB7XG5cdFx0XHRcdFx0cGF0aDogJ2Zpc2gnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCd0bXV4Jzoge1xuXHRcdFx0XHRcdHBhdGg6ICd0bXV4Jyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsVG11eC5pZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQncHdzaCc6IHtcblx0XHRcdFx0XHRwYXRoOiAncHdzaCcsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbFBvd2Vyc2hlbGwuaWRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2V4dGVuc2lvbklkZW50aWZpZXInLCAnaWQnLCAndGl0bGUnXSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLmxpbnV4RXh0ZW5zaW9uSWRlbnRpZmllcicsICdUaGUgZXh0ZW5zaW9uIHRoYXQgY29udHJpYnV0ZWQgdGhpcyBwcm9maWxlLicpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUubGludXhFeHRlbnNpb25JZCcsICdUaGUgaWQgb2YgdGhlIGV4dGVuc2lvbiB0ZXJtaW5hbCcpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUubGludXhFeHRlbnNpb25UaXRsZScsICdUaGUgbmFtZSBvZiB0aGUgZXh0ZW5zaW9uIHRlcm1pbmFsJyksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Li4udGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXNcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ251bGwnIH0sXG5cdFx0XHRcdFx0dGVybWluYWxQcm9maWxlU2NoZW1hXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdFtUZXJtaW5hbFNldHRpbmdJZC5Vc2VXc2xQcm9maWxlc106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC51c2VXc2xQcm9maWxlcycsICdDb250cm9scyB3aGV0aGVyIG9yIG5vdCBXU0wgZGlzdHJvcyBhcmUgc2hvd24gaW4gdGhlIHRlcm1pbmFsIGRyb3Bkb3duJyksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuSW5oZXJpdEVudl06IHtcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuaW5oZXJpdEVudicsIFwiV2hldGhlciBuZXcgc2hlbGxzIHNob3VsZCBpbmhlcml0IHRoZWlyIGVudmlyb25tZW50IGZyb20gVlMgQ29kZSwgd2hpY2ggbWF5IHNvdXJjZSBhIGxvZ2luIHNoZWxsIHRvIGVuc3VyZSAkUEFUSCBhbmQgb3RoZXIgZGV2ZWxvcG1lbnQgdmFyaWFibGVzIGFyZSBpbml0aWFsaXplZC4gVGhpcyBoYXMgbm8gZWZmZWN0IG9uIFdpbmRvd3MuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLlBlcnNpc3RlbnRTZXNzaW9uU2Nyb2xsYmFja106IHtcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5wZXJzaXN0ZW50U2Vzc2lvblNjcm9sbGJhY2snLCBcIkNvbnRyb2xzIHRoZSBtYXhpbXVtIGFtb3VudCBvZiBsaW5lcyB0aGF0IHdpbGwgYmUgcmVzdG9yZWQgd2hlbiByZWNvbm5lY3RpbmcgdG8gYSBwZXJzaXN0ZW50IHRlcm1pbmFsIHNlc3Npb24uIEluY3JlYXNpbmcgdGhpcyB3aWxsIHJlc3RvcmUgbW9yZSBsaW5lcyBvZiBzY3JvbGxiYWNrIGF0IHRoZSBjb3N0IG9mIG1vcmUgbWVtb3J5IGFuZCBpbmNyZWFzZSB0aGUgdGltZSBpdCB0YWtlcyB0byBjb25uZWN0IHRvIHRlcm1pbmFscyBvbiBzdGFydCB1cC4gVGhpcyBzZXR0aW5nIHJlcXVpcmVzIGEgcmVzdGFydCB0byB0YWtlIGVmZmVjdCBhbmQgc2hvdWxkIGJlIHNldCB0byBhIHZhbHVlIGxlc3MgdGhhbiBvciBlcXVhbCB0byBgI3Rlcm1pbmFsLmludGVncmF0ZWQuc2Nyb2xsYmFjayNgLlwiKSxcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMTAwXG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuU2hvd0xpbmtIb3Zlcl06IHtcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hvd0xpbmtIb3ZlcicsIFwiV2hldGhlciB0byBzaG93IGhvdmVycyBmb3IgbGlua3MgaW4gdGhlIHRlcm1pbmFsIG91dHB1dC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuSWdub3JlUHJvY2Vzc05hbWVzXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybUlnbm9yZVByb2Nlc3NlcycsIFwiQSBzZXQgb2YgcHJvY2VzcyBuYW1lcyB0byBpZ25vcmUgd2hlbiB1c2luZyB0aGUgezB9IHNldHRpbmcuXCIsICdgI3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uS2lsbCNgJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDogW1xuXHRcdFx0XHQvLyBQb3B1bGFyIHByb21wdCBwcm9ncmFtcywgdGhlc2Ugc2hvdWxkIG5vdCBjb3VudCBhcyBjaGlsZCBwcm9jZXNzZXNcblx0XHRcdFx0J3N0YXJzaGlwJyxcblx0XHRcdFx0J29oLW15LXBvc2gnLFxuXHRcdFx0XHQvLyBHaXQgYmFzaCBtYXkgcnVucyBhIHN1YnByb2Nlc3Mgb2YgaXRzZWxmIChiaW5cXGJhc2guZXhlIC0+IHVzclxcYmluXFxiYXNoLmV4ZSlcblx0XHRcdFx0J2Jhc2gnLFxuXHRcdFx0XHQnenNoJyxcblx0XHRcdF1cblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIHRlcm1pbmFsIGNvbmZpZ3VyYXRpb25zIHJlcXVpcmVkIGJ5IHNoYXJlZCBwcm9jZXNzIGFuZCByZW1vdGUgc2VydmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJUZXJtaW5hbFBsYXRmb3JtQ29uZmlndXJhdGlvbigpIHtcblx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24odGVybWluYWxQbGF0Zm9ybUNvbmZpZ3VyYXRpb24pO1xuXHRyZWdpc3RlclRlcm1pbmFsRGVmYXVsdFByb2ZpbGVDb25maWd1cmF0aW9uKCk7XG59XG5cbmxldCBkZWZhdWx0UHJvZmlsZXNDb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUgfCB1bmRlZmluZWQ7XG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJUZXJtaW5hbERlZmF1bHRQcm9maWxlQ29uZmlndXJhdGlvbihkZXRlY3RlZFByb2ZpbGVzPzogeyBvczogT3BlcmF0aW5nU3lzdGVtOyBwcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdIH0sIGV4dGVuc2lvbkNvbnRyaWJ1dGVkUHJvZmlsZXM/OiByZWFkb25seSBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlW10pIHtcblx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRsZXQgcHJvZmlsZUVudW07XG5cdGlmIChkZXRlY3RlZFByb2ZpbGVzKSB7XG5cdFx0cHJvZmlsZUVudW0gPSBjcmVhdGVQcm9maWxlU2NoZW1hRW51bXMoZGV0ZWN0ZWRQcm9maWxlcz8ucHJvZmlsZXMsIGV4dGVuc2lvbkNvbnRyaWJ1dGVkUHJvZmlsZXMpO1xuXHR9XG5cdGNvbnN0IG9sZERlZmF1bHRQcm9maWxlc0NvbmZpZ3VyYXRpb24gPSBkZWZhdWx0UHJvZmlsZXNDb25maWd1cmF0aW9uO1xuXHRkZWZhdWx0UHJvZmlsZXNDb25maWd1cmF0aW9uID0ge1xuXHRcdGlkOiAndGVybWluYWwnLFxuXHRcdG9yZGVyOiAxMDAsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd0ZXJtaW5hbEludGVncmF0ZWRDb25maWd1cmF0aW9uVGl0bGUnLCBcIkludGVncmF0ZWQgVGVybWluYWxcIiksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRQcm9maWxlTGludXhdOiB7XG5cdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRQcm9maWxlLmxpbnV4JywgXCJUaGUgZGVmYXVsdCB0ZXJtaW5hbCBwcm9maWxlIG9uIExpbnV4LlwiKSxcblx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddLFxuXHRcdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0XHRlbnVtOiBkZXRlY3RlZFByb2ZpbGVzPy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4ID8gcHJvZmlsZUVudW0/LnZhbHVlcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBkZXRlY3RlZFByb2ZpbGVzPy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4ID8gcHJvZmlsZUVudW0/Lm1hcmtkb3duRGVzY3JpcHRpb25zIDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRQcm9maWxlTWFjT3NdOiB7XG5cdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRQcm9maWxlLm9zeCcsIFwiVGhlIGRlZmF1bHQgdGVybWluYWwgcHJvZmlsZSBvbiBtYWNPUy5cIiksXG5cdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0XHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdFx0ZW51bTogZGV0ZWN0ZWRQcm9maWxlcz8ub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggPyBwcm9maWxlRW51bT8udmFsdWVzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IGRldGVjdGVkUHJvZmlsZXM/Lm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoID8gcHJvZmlsZUVudW0/Lm1hcmtkb3duRGVzY3JpcHRpb25zIDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRQcm9maWxlV2luZG93c106IHtcblx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGVmYXVsdFByb2ZpbGUud2luZG93cycsIFwiVGhlIGRlZmF1bHQgdGVybWluYWwgcHJvZmlsZSBvbiBXaW5kb3dzLlwiKSxcblx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddLFxuXHRcdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0XHRlbnVtOiBkZXRlY3RlZFByb2ZpbGVzPy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyBwcm9maWxlRW51bT8udmFsdWVzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IGRldGVjdGVkUHJvZmlsZXM/Lm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHByb2ZpbGVFbnVtPy5tYXJrZG93bkRlc2NyaXB0aW9ucyA6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHR9XG5cdH07XG5cdHJlZ2lzdHJ5LnVwZGF0ZUNvbmZpZ3VyYXRpb25zKHsgYWRkOiBbZGVmYXVsdFByb2ZpbGVzQ29uZmlndXJhdGlvbl0sIHJlbW92ZTogb2xkRGVmYXVsdFByb2ZpbGVzQ29uZmlndXJhdGlvbiA/IFtvbGREZWZhdWx0UHJvZmlsZXNDb25maWd1cmF0aW9uXSA6IFtdIH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLHNCQUFzQjtBQUV4QyxTQUFTLGlCQUFpQixVQUFVLHdCQUF3QjtBQUM1RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQixrQkFBOEQ7QUFDM0YsU0FBUyxnQkFBZ0I7QUFDekIsU0FBc0QseUJBQXlCO0FBQy9FLFNBQVMsZ0NBQWdDO0FBRWxDLE1BQU0sc0JBQW1DO0FBQUEsRUFDL0MsTUFBTSxDQUFDLFVBQVUsTUFBTTtBQUFBLEVBQ3ZCLE1BQU07QUFBQSxJQUNMO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFBQSxFQUNBLFNBQVM7QUFDVjtBQUVPLE1BQU0scUJBQWtDO0FBQUEsRUFDOUMsTUFBTTtBQUFBLEVBQ04sTUFBTSxNQUFNLEtBQUssZUFBZSxHQUFHLFVBQVEsS0FBSyxFQUFFO0FBQUEsRUFDbEQsMEJBQTBCLE1BQU0sS0FBSyxlQUFlLEdBQUcsVUFBUSxLQUFLLEtBQUssRUFBRSxHQUFHO0FBQy9FO0FBRU8sTUFBTSxnQ0FBZ0Q7QUFBQSxF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
