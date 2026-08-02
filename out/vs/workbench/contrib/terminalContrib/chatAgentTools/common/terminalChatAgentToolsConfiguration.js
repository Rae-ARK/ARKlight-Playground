import { localize } from "../../../../../nls.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../../platform/sandbox/common/settings.js";
import { TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { terminalProfileBaseProperties } from "../../../../../platform/terminal/common/terminalPlatformConfiguration.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
const DEFAULT_IDLE_SILENCE_TIMEOUT_MS = 3e5;
var TerminalChatAgentToolsSettingId = /* @__PURE__ */ ((TerminalChatAgentToolsSettingId2) => {
  TerminalChatAgentToolsSettingId2["EnableAutoApprove"] = "chat.tools.terminal.enableAutoApprove";
  TerminalChatAgentToolsSettingId2["AutoApprove"] = "chat.tools.terminal.autoApprove";
  TerminalChatAgentToolsSettingId2["AutoApproveWorkspaceNpmScripts"] = "chat.tools.terminal.autoApproveWorkspaceNpmScripts";
  TerminalChatAgentToolsSettingId2["IgnoreDefaultAutoApproveRules"] = "chat.tools.terminal.ignoreDefaultAutoApproveRules";
  TerminalChatAgentToolsSettingId2["BlockDetectedFileWrites"] = "chat.tools.terminal.blockDetectedFileWrites";
  TerminalChatAgentToolsSettingId2["ShellIntegrationTimeout"] = "chat.tools.terminal.shellIntegrationTimeout";
  TerminalChatAgentToolsSettingId2["OutputLocation"] = "chat.tools.terminal.outputLocation";
  TerminalChatAgentToolsSettingId2["AgentSandboxLinuxFileSystem"] = "chat.agent.sandbox.fileSystem.linux";
  TerminalChatAgentToolsSettingId2["AgentSandboxMacFileSystem"] = "chat.agent.sandbox.fileSystem.mac";
  TerminalChatAgentToolsSettingId2["AgentSandboxWindowsFileSystem"] = "chat.agent.sandbox.fileSystem.windows";
  TerminalChatAgentToolsSettingId2["AgentSandboxAdvancedRuntime"] = "chat.agent.sandbox.advanced.runtime";
  TerminalChatAgentToolsSettingId2["PreventShellHistory"] = "chat.tools.terminal.preventShellHistory";
  TerminalChatAgentToolsSettingId2["EnforceTimeoutFromModel"] = "chat.tools.terminal.enforceTimeoutFromModel";
  TerminalChatAgentToolsSettingId2["IdleSilenceTimeoutMs"] = "chat.tools.terminal.idleSilenceTimeoutMs";
  TerminalChatAgentToolsSettingId2["DetachBackgroundProcesses"] = "chat.tools.terminal.detachBackgroundProcesses";
  TerminalChatAgentToolsSettingId2["BackgroundNotifications"] = "chat.tools.terminal.backgroundNotifications";
  TerminalChatAgentToolsSettingId2["OutputDeltas"] = "chat.tools.terminal.outputDeltas";
  TerminalChatAgentToolsSettingId2["OutputCompaction"] = "chat.tools.terminal.outputCompaction";
  TerminalChatAgentToolsSettingId2["IdlePollInterval"] = "chat.tools.terminal.idlePollInterval";
  TerminalChatAgentToolsSettingId2["TerminalProfileLinux"] = "chat.tools.terminal.terminalProfile.linux";
  TerminalChatAgentToolsSettingId2["TerminalProfileMacOs"] = "chat.tools.terminal.terminalProfile.osx";
  TerminalChatAgentToolsSettingId2["TerminalProfileWindows"] = "chat.tools.terminal.terminalProfile.windows";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApproveCompatible"] = "chat.agent.terminal.autoApprove";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove1"] = "chat.agent.terminal.allowList";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove2"] = "chat.agent.terminal.denyList";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove3"] = "github.copilot.chat.agent.terminal.allowList";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove4"] = "github.copilot.chat.agent.terminal.denyList";
  return TerminalChatAgentToolsSettingId2;
})(TerminalChatAgentToolsSettingId || {});
const autoApproveBoolean = {
  type: "boolean",
  enum: [
    true,
    false
  ],
  enumDescriptions: [
    localize("autoApprove.true", "Automatically approve the pattern."),
    localize("autoApprove.false", "Require explicit approval for the pattern.")
  ],
  description: localize("autoApprove.key", "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters.")
};
const terminalChatAgentProfileSchema = {
  type: "object",
  required: ["path"],
  properties: {
    path: {
      description: localize("terminalChatAgentProfile.path", "A path to a shell executable."),
      type: "string"
    },
    ...terminalProfileBaseProperties
  }
};
const terminalChatAgentToolsConfiguration = {
  ["chat.tools.terminal.enableAutoApprove" /* EnableAutoApprove */]: {
    description: localize("autoApproveMode.description", "Controls whether to allow auto approval in the run in terminal tool."),
    type: "boolean",
    default: true,
    policy: {
      name: "ChatToolsTerminalEnableAutoApprove",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.104",
      localization: {
        description: {
          key: "autoApproveMode.description",
          value: localize("autoApproveMode.description", "Controls whether to allow auto approval in the run in terminal tool.")
        }
      }
    },
    agentsWindow: { default: true }
  },
  ["chat.tools.terminal.autoApprove" /* AutoApprove */]: {
    markdownDescription: [
      localize("autoApprove.description.intro", "A list of commands or regular expressions that control whether the run in terminal tool commands require explicit approval. These will be matched against the start of a command. A regular expression can be provided by wrapping the string in {0} characters followed by optional flags such as {1} for case-insensitivity.", "`/`", "`i`"),
      localize("autoApprove.description.values", "Set to {0} to automatically approve commands, {1} to always require explicit approval or {2} to unset the value.", "`true`", "`false`", "`null`"),
      localize("autoApprove.description.subCommands", "Note that these commands and regular expressions are evaluated for every _sub-command_ within the full _command line_, so {0} for example will need both {1} and {2} to match a {3} entry and must not match a {4} entry in order to auto approve. Inline commands such as {5} (process substitution) should also be detected.", "`foo && bar`", "`foo`", "`bar`", "`true`", "`false`", "`<(foo)`"),
      localize("autoApprove.description.commandLine", "An object can be used to match against the full command line instead of matching sub-commands and inline commands, for example {0}. In order to be auto approved _both_ the sub-command and command line must not be explicitly denied, then _either_ all sub-commands or command line needs to be approved.", "`{ approve: false, matchCommandLine: true }`"),
      localize("autoApprove.defaults", "Note that there's a default set of rules to allow and also deny commands. Consider setting {0} to {1} to ignore all default rules to ensure there are no conflicts with your own rules. Do this at your own risk, the default denial rules are designed to protect you against running dangerous commands.", `\`#${"chat.tools.terminal.ignoreDefaultAutoApproveRules" /* IgnoreDefaultAutoApproveRules */}#\``, "`true`"),
      [
        localize("autoApprove.description.examples.title", "Examples:"),
        `|${localize("autoApprove.description.examples.value", "Value")}|${localize("autoApprove.description.examples.description", "Description")}|`,
        "|---|---|",
        '| `"mkdir": true` | ' + localize("autoApprove.description.examples.mkdir", "Allow all commands starting with {0}", "`mkdir`"),
        '| `"npm run build": true` | ' + localize("autoApprove.description.examples.npmRunBuild", "Allow all commands starting with {0}", "`npm run build`"),
        '| `"bin/test.sh": true` | ' + localize("autoApprove.description.examples.binTest", "Allow all commands that match the path {0} ({1}, {2}, etc.)", "`bin/test.sh`", "`bin\\test.sh`", "`./bin/test.sh`"),
        '| `"/^git (status\\|show\\\\b.*)$/": true` | ' + localize("autoApprove.description.examples.regexGit", "Allow {0} and all commands starting with {1}", "`git status`", "`git show`"),
        '| `"/^Get-ChildItem\\\\b/i": true` | ' + localize("autoApprove.description.examples.regexCase", "will allow {0} commands regardless of casing", "`Get-ChildItem`"),
        '| `"/.*/": true` | ' + localize("autoApprove.description.examples.regexAll", "Allow all commands (denied commands still require approval)"),
        '| `"rm": false` | ' + localize("autoApprove.description.examples.rm", "Require explicit approval for all commands starting with {0}", "`rm`"),
        '| `"/\\\\.ps1/i": { approve: false, matchCommandLine: true }` | ' + localize("autoApprove.description.examples.ps1", "Require explicit approval for any _command line_ that contains {0} regardless of casing", '`".ps1"`'),
        '| `"rm": null` | ' + localize("autoApprove.description.examples.rmUnset", "Unset the default {0} value for {1}", "`false`", "`rm`")
      ].join("\n")
    ].join("\n\n"),
    type: "object",
    additionalProperties: {
      anyOf: [
        autoApproveBoolean,
        {
          type: "object",
          properties: {
            approve: autoApproveBoolean,
            matchCommandLine: {
              type: "boolean",
              enum: [
                true,
                false
              ],
              enumDescriptions: [
                localize("autoApprove.matchCommandLine.true", "Match against the full command line, eg. `foo && bar`."),
                localize("autoApprove.matchCommandLine.false", "Match against sub-commands and inline commands, eg. `foo && bar` will need both `foo` and `bar` to match.")
              ],
              description: localize("autoApprove.matchCommandLine", "Whether to match against the full command line, as opposed to splitting by sub-commands and inline commands.")
            }
          },
          required: ["approve"]
        },
        {
          type: "null",
          description: localize("autoApprove.null", "Ignore the pattern, this is useful for unsetting the same pattern set at a higher scope.")
        }
      ]
    },
    default: {
      // This is the default set of terminal auto approve commands. Note that these are best
      // effort and do not aim to provide exhaustive coverage to prevent dangerous commands
      // from executing as that is simply not feasible. Workspace trust and warnings of
      // possible prompt injection are _the_ thing protecting the user in agent mode, once
      // that trust boundary has been breached all bets are off as trusting a workspace that
      // contains anything malicious has already compromised the machine.
      //
      // Instead, the focus here is to unblock the user from approving clearly safe commands
      // frequently and cover common edge cases that could arise from the user auto-approving
      // commands.
      //
      // Take for example `find` which looks innocuous and most users are likely to auto
      // approve future calls when offered. However, the `-exec` argument can run anything. So
      // instead of leaving this decision up to the user we provide relatively safe defaults
      // and block common edge cases. So offering these default rules, despite their flaws, is
      // likely to protect the user more in general than leaving everything up to them (plus
      // make agent mode more convenient).
      // #region Safe commands
      //
      // Generally safe and common readonly commands
      cd: true,
      echo: true,
      ls: true,
      dir: true,
      pwd: true,
      cat: true,
      head: true,
      tail: true,
      findstr: true,
      wc: true,
      tr: true,
      cut: true,
      cmp: true,
      which: true,
      basename: true,
      dirname: true,
      realpath: true,
      readlink: true,
      stat: true,
      file: true,
      od: true,
      du: true,
      df: true,
      sleep: true,
      nl: true,
      // grep
      // - Variable
      // - `-f`: Read patterns from file, this is an acceptable risk since you can do similar
      //   with cat
      // - `-P`: PCRE risks include denial of service (memory exhaustion, catastrophic
      //   backtracking) which could lock up the terminal. Older PCRE versions allow code
      //   execution via this flag but this has been patched with CVEs.
      // - Variable injection is possible, but requires setting a variable which would need
      //   manual approval.
      grep: true,
      // #endregion
      // #region Safe sub-commands
      //
      // Safe and common sub-commands
      // Note: These patterns support `-C <path>` and `--no-pager` immediately after `git`
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/": true,
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/": true,
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b.*\\s--output(=|\\s|$)/": false,
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/": true,
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/": true,
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/": true,
      // git grep
      // - `--open-files-in-pager`: This is the configured pager, so no risk of code execution
      // - See notes on `grep`
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/": true,
      // git branch
      // - `-d`, `-D`, `--delete`: Prevent branch deletion
      // - `-m`, `-M`: Prevent branch renaming
      // - `--force`: Generally dangerous
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/": true,
      "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*\\s-(d|D|m|M|-delete|-force)\\b/": false,
      // docker - readonly sub-commands
      "/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/": true,
      "/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/": true,
      "/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/": true,
      // #endregion
      // #region PowerShell
      "Get-ChildItem": true,
      "Get-Content": true,
      "Get-Date": true,
      "Get-Random": true,
      "Get-Location": true,
      "Set-Location": true,
      "Write-Host": true,
      "Write-Output": true,
      "Out-String": true,
      "Split-Path": true,
      "Join-Path": true,
      "Start-Sleep": true,
      "Where-Object": true,
      // Blanket approval of safe verbs
      "/^Select-[a-z0-9]/i": true,
      "/^Measure-[a-z0-9]/i": true,
      "/^Compare-[a-z0-9]/i": true,
      "/^Format-[a-z0-9]/i": true,
      "/^Sort-[a-z0-9]/i": true,
      // #endregion
      // #region Package managers (npm, yarn, pnpm)
      //
      // Read-only commands that don't modify files or execute arbitrary code.
      // npm read-only commands
      "/^npm\\s+(ls|list|outdated|view|info|show|explain|why|root|prefix|bin|search|doctor|fund|repo|bugs|docs|home|help(-search)?)\\b/": true,
      "/^npm\\s+config\\s+(list|get)\\b/": true,
      "/^npm\\s+pkg\\s+get\\b/": true,
      "/^npm\\s+audit$/": true,
      "/^npm\\s+cache\\s+verify\\b/": true,
      // yarn read-only commands
      "/^yarn\\s+(list|outdated|info|why|bin|help|versions)\\b/": true,
      "/^yarn\\s+licenses\\b/": true,
      "/^yarn\\s+audit\\b(?!.*\\bfix\\b)/": true,
      "/^yarn\\s+config\\s+(list|get)\\b/": true,
      "/^yarn\\s+cache\\s+dir\\b/": true,
      // pnpm read-only commands
      "/^pnpm\\s+(ls|list|outdated|why|root|bin|doctor)\\b/": true,
      "/^pnpm\\s+licenses\\b/": true,
      "/^pnpm\\s+audit\\b(?!.*\\bfix\\b)/": true,
      "/^pnpm\\s+config\\s+(list|get)\\b/": true,
      // Safe lockfile-only installs since we trust the workspace and lock file is trusted.
      "npm ci": true,
      "/^yarn\\s+install\\s+--frozen-lockfile\\b/": true,
      "/^pnpm\\s+install\\s+--frozen-lockfile\\b/": true,
      // #endregion
      // #region Safe + disabled args
      //
      // Commands that are generally allowed with special cases we block. Note that shell
      // expansion is handled by the inline command detection when parsing sub-commands.
      // column
      // - `-c`: We block excessive columns that could lead to memory exhaustion.
      column: true,
      "/^column\\b.*\\s-c\\s+[0-9]{4,}/": false,
      // date
      // -s|--set: Sets the system clock
      date: true,
      "/^date\\b.*\\s(-s|--set)\\b/": false,
      // find
      // - `-delete`: Deletes files or directories.
      // - `-exec`/`-execdir`: Execute on results.
      // - `-fprint`/`fprintf`/`fls`: Writes files.
      // - `-ok`/`-okdir`: Like exec but with a confirmation.
      find: true,
      "/^find\\b.*\\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/": false,
      // rg (ripgrep)
      // - `--pre`: Executes arbitrary command as preprocessor for every file searched.
      // - `--hostname-bin`: Executes arbitrary command to get hostname.
      rg: true,
      "/^rg\\b.*\\s(--pre|--hostname-bin)\\b/": false,
      // sed
      // - `-e`/`--expression`: Add the commands in script to the set of commands to be run
      //   while processing the input.
      // - `-f`/`--file`: Add the commands contained in the file script-file to the set of
      //   commands to be run while processing the input.
      // - `w`/`W` commands: Write to files (blocked by `-i` check + agent typically won't use).
      // - `s///e` flag: Executes substitution result as shell command
      // - `s///w` flag: Write substitution result to file
      // - `;W` Write first line of pattern space to file
      // - Note that `--sandbox` exists which blocks unsafe commands that could potentially be
      //   leveraged to auto approve
      // - In-place editing (`-i`, `-I`, `--in-place`) is detected and blocked via file write
      //   detection if necessary
      sed: true,
      "/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/": false,
      "/^sed\\b.*s\\/.*\\/.*\\/[ew]/": false,
      "/^sed\\b.*;W/": false,
      // sort
      // - `-o`: Output redirection can write files (`sort -o /etc/something file`) which are
      //   blocked currently
      // - `-S`: Memory exhaustion is possible (`sort -S 100G file`), we allow possible denial
      //   of service.
      sort: true,
      "/^sort\\b.*\\s-(o|S)\\b/": false,
      // tree
      // - `-o`: Output redirection can write files (`tree -o /etc/something file`) which are
      //   blocked currently
      tree: true,
      "/^tree\\b.*\\s-o\\b/": false,
      // xxd
      // - Only allow flags and a single input file as it's difficult to parse the outfile
      //   positional argument safely.
      "/^xxd$/": true,
      "/^xxd\\b(\\s+-\\S+)*\\s+[^-\\s]\\S*$/": true,
      // #endregion
      // #region Dangerous commands
      //
      // There are countless dangerous commands available on the command line, the defaults
      // here include common ones that the user is likely to want to explicitly approve first.
      // This is not intended to be a catch all as the user needs to opt-in to auto-approve
      // commands, it provides some additional safety when the commands get approved by overly
      // broad user/workspace rules.
      // Deleting files
      rm: false,
      rmdir: false,
      del: false,
      "Remove-Item": false,
      ri: false,
      rd: false,
      erase: false,
      dd: false,
      // Managing/killing processes, dangerous thing to do generally
      kill: false,
      ps: false,
      top: false,
      "Stop-Process": false,
      spps: false,
      taskkill: false,
      "taskkill.exe": false,
      // Web requests, prompt injection concerns
      curl: false,
      wget: false,
      "Invoke-RestMethod": false,
      "Invoke-WebRequest": false,
      "irm": false,
      "iwr": false,
      // File permissions and ownership, messing with these can cause hard to diagnose issues
      chmod: false,
      chown: false,
      "Set-ItemProperty": false,
      "sp": false,
      "Set-Acl": false,
      // General eval/command execution, can lead to anything else running
      jq: false,
      xargs: false,
      eval: false,
      "Invoke-Expression": false,
      iex: false
      // #endregion
    }
  },
  ["chat.tools.terminal.ignoreDefaultAutoApproveRules" /* IgnoreDefaultAutoApproveRules */]: {
    type: "boolean",
    default: false,
    tags: ["experimental"],
    markdownDescription: localize("ignoreDefaultAutoApproveRules.description", "Whether to ignore the built-in default auto-approve rules used by the run in terminal tool as defined in {0}. When this setting is enabled, the run in terminal tool will ignore any rule that comes from the default set but still follow rules defined in the user, remote and workspace settings. Use this setting at your own risk; the default auto-approve rules are designed to protect you against running dangerous commands.", `\`#${"chat.tools.terminal.autoApprove" /* AutoApprove */}#\``)
  },
  ["chat.tools.terminal.autoApproveWorkspaceNpmScripts" /* AutoApproveWorkspaceNpmScripts */]: {
    restricted: true,
    type: "boolean",
    // In order to use agent mode the workspace must be trusted, this plus the fact that
    // modifying package.json is protected means this is safe to enable by default.
    default: true,
    tags: ["experimental"],
    markdownDescription: localize("autoApproveWorkspaceNpmScripts.description", "Whether to automatically approve npm, yarn, and pnpm run commands when the script is defined in a workspace package.json file. Since the workspace is trusted, scripts defined in package.json are considered safe to run without explicit approval.")
  },
  ["chat.tools.terminal.blockDetectedFileWrites" /* BlockDetectedFileWrites */]: {
    type: "string",
    enum: ["never", "outsideWorkspace", "all"],
    enumDescriptions: [
      localize("blockFileWrites.never", "Allow all detected file writes."),
      localize("blockFileWrites.outsideWorkspace", "Block file writes detected outside the workspace. This depends on the shell integration feature working correctly to determine the current working directory of the terminal."),
      localize("blockFileWrites.all", "Block all detected file writes.")
    ],
    default: "outsideWorkspace",
    tags: ["experimental"],
    markdownDescription: localize("blockFileWrites.description", "Controls whether detected file write operations are blocked in the run in terminal tool. When detected, this will require explicit approval regardless of whether the command would normally be auto approved. Note that this cannot detect all possible methods of writing files, this is what is currently detected:\n\n- File redirection (detected via the bash or PowerShell tree sitter grammar)\n- `sed` in-place editing (`-i`, `-I`, `--in-place`)")
  },
  ["chat.tools.terminal.shellIntegrationTimeout" /* ShellIntegrationTimeout */]: {
    markdownDescription: localize("shellIntegrationTimeout.description", "Configures the duration in milliseconds to wait for shell integration to be detected when the run in terminal tool launches a new terminal. Set to `0` to skip the wait entirely, the default value `-1` uses a variable wait time based on the value of {0} and whether it's a remote window. A large value can be useful if your shell starts very slowly.", `\`#${TerminalSettingId.ShellIntegrationEnabled}#\``),
    type: "integer",
    minimum: -1,
    maximum: 6e4,
    default: -1,
    markdownDeprecationMessage: localize("shellIntegrationTimeout.deprecated", "Use {0} instead", `\`#${TerminalSettingId.ShellIntegrationTimeout}#\``)
  },
  ["chat.tools.terminal.idlePollInterval" /* IdlePollInterval */]: {
    markdownDescription: localize("idlePollInterval.description", "Configures the idle poll interval in milliseconds used by the run in terminal tool to detect when commands have finished executing. Lower values make command detection faster but may cause false positives on slow systems. This primarily affects terminals without shell integration where idle detection is used instead of shell integration events."),
    type: "integer",
    minimum: 50,
    maximum: 1e4,
    default: 1e3
  },
  ["chat.tools.terminal.terminalProfile.linux" /* TerminalProfileLinux */]: {
    restricted: true,
    markdownDescription: localize("terminalChatAgentProfile.linux", "The terminal profile to use on Linux for chat agent's run in terminal tool."),
    type: ["object", "null"],
    default: null,
    "anyOf": [
      { type: "null" },
      terminalChatAgentProfileSchema
    ],
    defaultSnippets: [
      {
        body: {
          path: "${1}"
        }
      }
    ]
  },
  ["chat.tools.terminal.terminalProfile.osx" /* TerminalProfileMacOs */]: {
    restricted: true,
    markdownDescription: localize("terminalChatAgentProfile.osx", "The terminal profile to use on macOS for chat agent's run in terminal tool."),
    type: ["object", "null"],
    default: null,
    "anyOf": [
      { type: "null" },
      terminalChatAgentProfileSchema
    ],
    defaultSnippets: [
      {
        body: {
          path: "${1}"
        }
      }
    ]
  },
  ["chat.tools.terminal.terminalProfile.windows" /* TerminalProfileWindows */]: {
    restricted: true,
    markdownDescription: localize("terminalChatAgentProfile.windows", "The terminal profile to use on Windows for chat agent's run in terminal tool."),
    type: ["object", "null"],
    default: null,
    "anyOf": [
      { type: "null" },
      terminalChatAgentProfileSchema
    ],
    defaultSnippets: [
      {
        body: {
          path: "${1}"
        }
      }
    ]
  },
  ["chat.tools.terminal.outputLocation" /* OutputLocation */]: {
    markdownDescription: localize("outputLocation.description", "Where to show the output from the run in terminal tool."),
    type: "string",
    enum: ["terminal", "chat"],
    enumDescriptions: [
      localize("outputLocation.terminal", "Reveal the terminal in the panel or editor in addition to chat."),
      localize("outputLocation.chat", "Reveal the terminal output within chat only.")
    ],
    default: "chat",
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    }
  },
  [AgentSandboxSettingId.AgentSandboxEnabled]: {
    markdownDescription: localize("agentSandbox.enabledSetting", "Controls whether agent mode uses sandboxing to restrict what tools can do. When enabled, tools like the terminal are run in a sandboxed environment to limit access to the system. Use {0} to allow all network domains.", `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``),
    type: "string",
    enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
    enumDescriptions: [
      localize("agentSandbox.enabledSetting.offDescription", "Disable sandboxing for agent mode tools."),
      localize("agentSandbox.enabledSetting.onDescription", "Enable sandboxing for agent mode tools.")
    ],
    default: AgentSandboxEnabledValue.Off,
    tags: ["preview"],
    restricted: true,
    experiment: {
      mode: "auto"
    },
    policy: {
      name: "ChatAgentSandboxEnabled",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.116",
      localization: {
        description: {
          key: "agentSandbox.enabledSetting",
          value: localize("agentSandbox.enabledSetting", "Controls whether agent mode uses sandboxing to restrict what tools can do. When enabled, tools like the terminal are run in a sandboxed environment to limit access to the system. Use {0} to allow all network domains.", `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``)
        },
        enumDescriptions: [
          {
            key: "agentSandbox.enabledSetting.offDescription",
            value: localize("agentSandbox.enabledSetting.offDescription", "Disable sandboxing for agent mode tools.")
          },
          {
            key: "agentSandbox.enabledSetting.onDescription",
            value: localize("agentSandbox.enabledSetting.onDescription", "Enable sandboxing for agent mode tools.")
          }
        ]
      }
    }
  },
  [AgentSandboxSettingId.AgentSandboxWindowsEnabled]: {
    markdownDescription: localize("agentSandbox.windowsEnabledSetting", "Controls whether agent mode uses sandboxing on Windows. Use {0} to allow all network domains.", `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``),
    type: "string",
    enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
    enumDescriptions: [
      localize("agentSandbox.windowsEnabledSetting.offDescription", "Disable sandboxing for agent mode tools on Windows."),
      localize("agentSandbox.windowsEnabledSetting.onDescription", "Enable sandboxing for agent mode tools on Windows.")
    ],
    default: AgentSandboxEnabledValue.Off,
    tags: ["experimental"],
    restricted: true,
    experiment: {
      mode: "auto"
    }
  },
  [AgentSandboxSettingId.AgentSandboxAllowNetwork]: {
    markdownDescription: localize("agentSandbox.allowNetwork", "When {0} is enabled, controls whether to allow all network domains in the sandbox. When enabled, the sandbox preserves file system restrictions while relaxing all network restrictions.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: false,
    tags: ["preview"],
    restricted: true,
    policy: {
      name: "ChatAgentSandboxAllowNetwork",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.127",
      localization: {
        description: {
          key: "agentSandbox.allowNetwork",
          value: localize("agentSandbox.allowNetwork", "When {0} is enabled, controls whether to allow all network domains in the sandbox. When enabled, the sandbox preserves file system restrictions while relaxing all network restrictions.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
        }
      }
    }
  },
  [AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: {
    markdownDescription: localize("agentSandbox.allowUnsandboxedCommands", "Controls whether agent mode terminal commands can run outside the sandbox after user confirmation when a sandboxed command fails or when sandbox restrictions would block the command. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: true,
    tags: ["preview"],
    restricted: true,
    policy: {
      name: "ChatAgentSandboxAllowUnsandboxedCommands",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.116",
      localization: {
        description: {
          key: "agentSandbox.allowUnsandboxedCommands",
          value: localize("agentSandbox.allowUnsandboxedCommands", "Controls whether agent mode terminal commands can run outside the sandbox after user confirmation when a sandboxed command fails or when sandbox restrictions would block the command. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
        }
      }
    }
  },
  [AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests]: {
    markdownDescription: localize("agentSandbox.retryWithAllowNetworkRequests", "Controls whether agent mode terminal commands can retry in the sandbox with unrestricted network access after user confirmation. This applies only when {0} is enabled and preserves file system sandboxing while relaxing network restrictions for an approved command.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: true,
    tags: ["preview"],
    restricted: true
  },
  [AgentSandboxSettingId.AgentSandboxAllowAutoApprove]: {
    markdownDescription: localize("agentSandbox.allowAutoApprove", "Controls whether agent mode terminal commands that run inside the sandbox are auto-approved. When disabled, the run in terminal tool uses the existing approval flow. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: true,
    tags: ["preview"],
    restricted: true,
    policy: {
      name: "ChatAgentSandboxAllowAutoApprove",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.116",
      localization: {
        description: {
          key: "agentSandbox.allowAutoApprove",
          value: localize("agentSandbox.allowAutoApprove", "Controls whether agent mode terminal commands that run inside the sandbox are auto-approved. When disabled, the run in terminal tool uses the existing approval flow. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
        }
      }
    }
  },
  ["chat.agent.sandbox.fileSystem.linux" /* AgentSandboxLinuxFileSystem */]: {
    markdownDescription: localize("agentSandbox.linuxFileSystemSetting", "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on Linux. Paths do not support glob patterns, only literal paths (ex: ./src/, ~/.ssh, .env). **bubblewrap** and **socat** should be installed for this setting to work.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    properties: {
      denyRead: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.denyRead", "Array of paths to deny read access. Leave empty to allow reading all paths."),
        items: { type: "string" },
        default: []
      },
      allowRead: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.allowRead", "Array of paths to re-allow read access within denied regions. Takes precedence over denyRead."),
        items: { type: "string" },
        default: []
      },
      allowWrite: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.allowWrite", "Array of additional paths to allow write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
        items: { type: "string" },
        default: []
      },
      denyWrite: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.denyWrite", "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
        items: { type: "string" },
        default: []
      }
    },
    default: {
      denyRead: [],
      allowRead: [],
      allowWrite: [],
      denyWrite: []
    },
    tags: ["preview"],
    restricted: true
  },
  ["chat.agent.sandbox.fileSystem.mac" /* AgentSandboxMacFileSystem */]: {
    markdownDescription: localize("agentSandbox.macFileSystemSetting", "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on macOS. Paths also support git-style glob patterns(ex: *.ts, ./src, ./src/**/*.ts, file?.txt).", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    properties: {
      denyRead: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.denyRead", "Array of paths to deny read access. Leave empty to allow reading all paths."),
        items: { type: "string" },
        default: []
      },
      allowRead: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.allowRead", "Array of paths to re-allow read access within denied regions. Takes precedence over denyRead."),
        items: { type: "string" },
        default: []
      },
      allowWrite: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.allowWrite", "Array of additional paths to allow write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
        items: { type: "string" },
        default: []
      },
      denyWrite: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.denyWrite", "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
        items: { type: "string" },
        default: []
      }
    },
    default: {
      denyRead: [],
      allowRead: [],
      allowWrite: [],
      denyWrite: []
    },
    tags: ["preview"],
    restricted: true
  },
  ["chat.agent.sandbox.fileSystem.windows" /* AgentSandboxWindowsFileSystem */]: {
    markdownDescription: localize("agentSandbox.windowsFileSystemSetting", "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on Windows. Paths do not support glob patterns, only literal paths (ex: C:\\src, C:\\Users\\me\\.ssh, .env).", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    properties: {
      denyRead: {
        type: "array",
        description: localize("agentSandbox.windowsFileSystemSetting.denyRead", "Array of paths to deny access. Leave empty to allow reading all paths."),
        items: { type: "string" },
        default: []
      },
      allowRead: {
        type: "array",
        description: localize("agentSandbox.windowsFileSystemSetting.allowRead", "Array of additional paths to allow read-only access. Takes precedence over denyRead."),
        items: { type: "string" },
        default: []
      },
      allowWrite: {
        type: "array",
        description: localize("agentSandbox.windowsFileSystemSetting.allowWrite", "Array of additional paths to allow read/write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
        items: { type: "string" },
        default: []
      }
    },
    default: {
      denyRead: [],
      allowRead: [],
      allowWrite: []
    },
    tags: ["preview"],
    restricted: true
  },
  [AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion]: {
    // Intentionally available only to callers that explicitly set it in settings.json.
    included: false,
    restricted: true,
    type: "string"
  },
  ["chat.agent.sandbox.advanced.runtime" /* AgentSandboxAdvancedRuntime */]: {
    markdownDescription: localize("agentSandbox.runtimeSetting", "Note: this setting is applicable only when {0} is enabled. Key/value pairs are passed through to the root of the sandbox runtime configuration.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    default: {
      enableWeakerNestedSandbox: false
    },
    additionalProperties: true,
    tags: ["preview"],
    restricted: true
  },
  ["chat.tools.terminal.preventShellHistory" /* PreventShellHistory */]: {
    type: "boolean",
    default: true,
    markdownDescription: [
      localize("preventShellHistory.description", "Whether to exclude commands run by the terminal tool from the shell history. See below for the supported shells and the method used for each:"),
      `- \`bash\`: ${localize("preventShellHistory.description.bash", "Sets `HISTCONTROL=ignorespace` and prepends the command with space")}`,
      `- \`zsh\`: ${localize("preventShellHistory.description.zsh", "Sets `HIST_IGNORE_SPACE` option and prepends the command with space")}`,
      `- \`fish\`: ${localize("preventShellHistory.description.fish", "Sets `fish_private_mode` to prevent any command from entering history")}`,
      `- \`pwsh\`: ${localize("preventShellHistory.description.pwsh", "Sets a custom history handler via PSReadLine's `AddToHistoryHandler` to prevent any command from entering history")}`
    ].join("\n")
  },
  ["chat.tools.terminal.enforceTimeoutFromModel" /* EnforceTimeoutFromModel */]: {
    restricted: true,
    type: "boolean",
    default: true,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("enforceTimeoutFromModel.description", "Whether to enforce the timeout value provided by the model in the run in terminal tool. When enabled, if the model provides a timeout parameter, the tool will stop tracking the command after that duration and return the output collected so far.")
  },
  ["chat.tools.terminal.idleSilenceTimeoutMs" /* IdleSilenceTimeoutMs */]: {
    restricted: true,
    type: "number",
    default: DEFAULT_IDLE_SILENCE_TIMEOUT_MS,
    minimum: 0,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("idleSilenceTimeoutMs.description", "Number of milliseconds the run in terminal tool will wait for new output from a synchronous command before moving it to a background terminal and returning what was collected so far. The process is not killed \u2014 the tool returns the terminal ID so the model can poll, send input, or kill it. Set to {0} to disable.", "`0`")
  },
  ["chat.tools.terminal.detachBackgroundProcesses" /* DetachBackgroundProcesses */]: {
    included: false,
    restricted: true,
    type: "boolean",
    default: false,
    tags: ["experimental"],
    markdownDescription: localize("detachBackgroundProcesses.description", 'Whether to detach persistent terminal processes so they survive when VS Code exits. When enabled, commands started with `mode: "async"` (legacy: `isBackground: true`) are wrapped with `nohup` (POSIX) or `Start-Process` (Windows) so the process continues running after the terminal is disposed.')
  },
  ["chat.tools.terminal.backgroundNotifications" /* BackgroundNotifications */]: {
    restricted: true,
    type: "boolean",
    default: true,
    tags: ["experimental"],
    deprecated: true,
    markdownDeprecationMessage: localize("backgroundNotifications.deprecated", "This setting is deprecated. Terminal completion and input-needed notifications are now always enabled."),
    markdownDescription: localize("backgroundNotifications.description", "This setting is deprecated and no longer has any effect. Terminal completion and input-needed notifications are now always enabled for any command that continues running after the tool returns.")
  },
  ["chat.tools.terminal.outputDeltas" /* OutputDeltas */]: {
    restricted: true,
    type: "boolean",
    default: false,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("outputDeltas.description", "When enabled, repeated get terminal output tool calls return only output added since the previous poll for the same terminal execution, or a short unchanged-output message when there is no new output.")
  },
  ["chat.tools.terminal.outputCompaction" /* OutputCompaction */]: {
    restricted: true,
    type: "boolean",
    default: false,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("outputCompaction.description", "When enabled, the output of commands run by the run in terminal tool is compacted before being returned to the model, reducing the number of tokens spent on noisy output (for example progress bars or repeated log lines) while preserving the important information.")
  }
};
for (const id of [
  "chat.agent.terminal.allowList" /* DeprecatedAutoApprove1 */,
  "chat.agent.terminal.denyList" /* DeprecatedAutoApprove2 */,
  "github.copilot.chat.agent.terminal.allowList" /* DeprecatedAutoApprove3 */,
  "github.copilot.chat.agent.terminal.denyList" /* DeprecatedAutoApprove4 */,
  "chat.agent.terminal.autoApprove" /* DeprecatedAutoApproveCompatible */
]) {
  terminalChatAgentToolsConfiguration[id] = {
    deprecated: true,
    markdownDeprecationMessage: localize("autoApprove.deprecated", "Use {0} instead", `\`#${"chat.tools.terminal.autoApprove" /* AutoApprove */}#\``)
  };
}
export {
  DEFAULT_IDLE_SILENCE_TIMEOUT_MS,
  TerminalChatAgentToolsSettingId,
  terminalChatAgentToolsConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9jb21tb24vdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSwgQWdlbnRTYW5kYm94U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2FuZGJveC9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgdGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxQbGF0Zm9ybUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuXG4vKipcbiAqIERlZmF1bHQgaWRsZSBzaWxlbmNlIHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzLiBVc2VkIGFzIGJvdGggdGhlIGNvbmZpZ3VyYXRpb25cbiAqIGRlZmF1bHQgYW5kIHRoZSBydW50aW1lIGZhbGxiYWNrIHdoZW4gdGhlIHNldHRpbmcgaXMgdW5hdmFpbGFibGUuXG4gKi9cbmV4cG9ydCBjb25zdCBERUZBVUxUX0lETEVfU0lMRU5DRV9USU1FT1VUX01TID0gMzAwXzAwMDsgLy8gNSBtaW51dGVzXG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQge1xuXHRFbmFibGVBdXRvQXBwcm92ZSA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmVuYWJsZUF1dG9BcHByb3ZlJyxcblx0QXV0b0FwcHJvdmUgPSAnY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZScsXG5cdEF1dG9BcHByb3ZlV29ya3NwYWNlTnBtU2NyaXB0cyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmF1dG9BcHByb3ZlV29ya3NwYWNlTnBtU2NyaXB0cycsXG5cdElnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzID0gJ2NoYXQudG9vbHMudGVybWluYWwuaWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXMnLFxuXHRCbG9ja0RldGVjdGVkRmlsZVdyaXRlcyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmJsb2NrRGV0ZWN0ZWRGaWxlV3JpdGVzJyxcblx0U2hlbGxJbnRlZ3JhdGlvblRpbWVvdXQgPSAnY2hhdC50b29scy50ZXJtaW5hbC5zaGVsbEludGVncmF0aW9uVGltZW91dCcsXG5cdE91dHB1dExvY2F0aW9uID0gJ2NoYXQudG9vbHMudGVybWluYWwub3V0cHV0TG9jYXRpb24nLFxuXHRBZ2VudFNhbmRib3hMaW51eEZpbGVTeXN0ZW0gPSAnY2hhdC5hZ2VudC5zYW5kYm94LmZpbGVTeXN0ZW0ubGludXgnLFxuXHRBZ2VudFNhbmRib3hNYWNGaWxlU3lzdGVtID0gJ2NoYXQuYWdlbnQuc2FuZGJveC5maWxlU3lzdGVtLm1hYycsXG5cdEFnZW50U2FuZGJveFdpbmRvd3NGaWxlU3lzdGVtID0gJ2NoYXQuYWdlbnQuc2FuZGJveC5maWxlU3lzdGVtLndpbmRvd3MnLFxuXHRBZ2VudFNhbmRib3hBZHZhbmNlZFJ1bnRpbWUgPSAnY2hhdC5hZ2VudC5zYW5kYm94LmFkdmFuY2VkLnJ1bnRpbWUnLFxuXHRQcmV2ZW50U2hlbGxIaXN0b3J5ID0gJ2NoYXQudG9vbHMudGVybWluYWwucHJldmVudFNoZWxsSGlzdG9yeScsXG5cdEVuZm9yY2VUaW1lb3V0RnJvbU1vZGVsID0gJ2NoYXQudG9vbHMudGVybWluYWwuZW5mb3JjZVRpbWVvdXRGcm9tTW9kZWwnLFxuXHRJZGxlU2lsZW5jZVRpbWVvdXRNcyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmlkbGVTaWxlbmNlVGltZW91dE1zJyxcblx0RGV0YWNoQmFja2dyb3VuZFByb2Nlc3NlcyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmRldGFjaEJhY2tncm91bmRQcm9jZXNzZXMnLFxuXHRCYWNrZ3JvdW5kTm90aWZpY2F0aW9ucyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmJhY2tncm91bmROb3RpZmljYXRpb25zJyxcblx0T3V0cHV0RGVsdGFzID0gJ2NoYXQudG9vbHMudGVybWluYWwub3V0cHV0RGVsdGFzJyxcblx0T3V0cHV0Q29tcGFjdGlvbiA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLm91dHB1dENvbXBhY3Rpb24nLFxuXHRJZGxlUG9sbEludGVydmFsID0gJ2NoYXQudG9vbHMudGVybWluYWwuaWRsZVBvbGxJbnRlcnZhbCcsXG5cblx0VGVybWluYWxQcm9maWxlTGludXggPSAnY2hhdC50b29scy50ZXJtaW5hbC50ZXJtaW5hbFByb2ZpbGUubGludXgnLFxuXHRUZXJtaW5hbFByb2ZpbGVNYWNPcyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLnRlcm1pbmFsUHJvZmlsZS5vc3gnLFxuXHRUZXJtaW5hbFByb2ZpbGVXaW5kb3dzID0gJ2NoYXQudG9vbHMudGVybWluYWwudGVybWluYWxQcm9maWxlLndpbmRvd3MnLFxuXG5cdERlcHJlY2F0ZWRBdXRvQXBwcm92ZUNvbXBhdGlibGUgPSAnY2hhdC5hZ2VudC50ZXJtaW5hbC5hdXRvQXBwcm92ZScsXG5cdERlcHJlY2F0ZWRBdXRvQXBwcm92ZTEgPSAnY2hhdC5hZ2VudC50ZXJtaW5hbC5hbGxvd0xpc3QnLFxuXHREZXByZWNhdGVkQXV0b0FwcHJvdmUyID0gJ2NoYXQuYWdlbnQudGVybWluYWwuZGVueUxpc3QnLFxuXHREZXByZWNhdGVkQXV0b0FwcHJvdmUzID0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQuYWdlbnQudGVybWluYWwuYWxsb3dMaXN0Jyxcblx0RGVwcmVjYXRlZEF1dG9BcHByb3ZlNCA9ICdnaXRodWIuY29waWxvdC5jaGF0LmFnZW50LnRlcm1pbmFsLmRlbnlMaXN0Jyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24ge1xuXHRhdXRvQXBwcm92ZTogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH07XG5cdGNvbW1hbmRSZXBvcnRpbmdBbGxvd0xpc3Q6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9O1xuXHRzaGVsbEludGVncmF0aW9uVGltZW91dDogbnVtYmVyO1xufVxuXG5jb25zdCBhdXRvQXBwcm92ZUJvb2xlYW46IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnYm9vbGVhbicsXG5cdGVudW06IFtcblx0XHR0cnVlLFxuXHRcdGZhbHNlLFxuXHRdLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0bG9jYWxpemUoJ2F1dG9BcHByb3ZlLnRydWUnLCBcIkF1dG9tYXRpY2FsbHkgYXBwcm92ZSB0aGUgcGF0dGVybi5cIiksXG5cdFx0bG9jYWxpemUoJ2F1dG9BcHByb3ZlLmZhbHNlJywgXCJSZXF1aXJlIGV4cGxpY2l0IGFwcHJvdmFsIGZvciB0aGUgcGF0dGVybi5cIiksXG5cdF0sXG5cdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUua2V5JywgXCJUaGUgc3RhcnQgb2YgYSBjb21tYW5kIHRvIG1hdGNoIGFnYWluc3QuIEEgcmVndWxhciBleHByZXNzaW9uIGNhbiBiZSBwcm92aWRlZCBieSB3cmFwcGluZyB0aGUgc3RyaW5nIGluIGAvYCBjaGFyYWN0ZXJzLlwiKSxcbn07XG5cbmNvbnN0IHRlcm1pbmFsQ2hhdEFnZW50UHJvZmlsZVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRyZXF1aXJlZDogWydwYXRoJ10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHRwYXRoOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsQ2hhdEFnZW50UHJvZmlsZS5wYXRoJywgXCJBIHBhdGggdG8gYSBzaGVsbCBleGVjdXRhYmxlLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdH0sXG5cdFx0Li4udGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXMsXG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCB0ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbjogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gPSB7XG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmVNb2RlLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGFsbG93IGF1dG8gYXBwcm92YWwgaW4gdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRwb2xpY3k6IHtcblx0XHRcdG5hbWU6ICdDaGF0VG9vbHNUZXJtaW5hbEVuYWJsZUF1dG9BcHByb3ZlJyxcblx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlZ3JhdGVkVGVybWluYWwsXG5cdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTA0Jyxcblx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGtleTogJ2F1dG9BcHByb3ZlTW9kZS5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhdXRvQXBwcm92ZU1vZGUuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gYWxsb3cgYXV0byBhcHByb3ZhbCBpbiB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wuXCIpLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSB9LFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZV06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBbXG5cdFx0XHRsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uaW50cm8nLCBcIkEgbGlzdCBvZiBjb21tYW5kcyBvciByZWd1bGFyIGV4cHJlc3Npb25zIHRoYXQgY29udHJvbCB3aGV0aGVyIHRoZSBydW4gaW4gdGVybWluYWwgdG9vbCBjb21tYW5kcyByZXF1aXJlIGV4cGxpY2l0IGFwcHJvdmFsLiBUaGVzZSB3aWxsIGJlIG1hdGNoZWQgYWdhaW5zdCB0aGUgc3RhcnQgb2YgYSBjb21tYW5kLiBBIHJlZ3VsYXIgZXhwcmVzc2lvbiBjYW4gYmUgcHJvdmlkZWQgYnkgd3JhcHBpbmcgdGhlIHN0cmluZyBpbiB7MH0gY2hhcmFjdGVycyBmb2xsb3dlZCBieSBvcHRpb25hbCBmbGFncyBzdWNoIGFzIHsxfSBmb3IgY2FzZS1pbnNlbnNpdGl2aXR5LlwiLCAnYC9gJywgJ2BpYCcpLFxuXHRcdFx0bG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLnZhbHVlcycsIFwiU2V0IHRvIHswfSB0byBhdXRvbWF0aWNhbGx5IGFwcHJvdmUgY29tbWFuZHMsIHsxfSB0byBhbHdheXMgcmVxdWlyZSBleHBsaWNpdCBhcHByb3ZhbCBvciB7Mn0gdG8gdW5zZXQgdGhlIHZhbHVlLlwiLCAnYHRydWVgJywgJ2BmYWxzZWAnLCAnYG51bGxgJyksXG5cdFx0XHRsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uc3ViQ29tbWFuZHMnLCBcIk5vdGUgdGhhdCB0aGVzZSBjb21tYW5kcyBhbmQgcmVndWxhciBleHByZXNzaW9ucyBhcmUgZXZhbHVhdGVkIGZvciBldmVyeSBfc3ViLWNvbW1hbmRfIHdpdGhpbiB0aGUgZnVsbCBfY29tbWFuZCBsaW5lXywgc28gezB9IGZvciBleGFtcGxlIHdpbGwgbmVlZCBib3RoIHsxfSBhbmQgezJ9IHRvIG1hdGNoIGEgezN9IGVudHJ5IGFuZCBtdXN0IG5vdCBtYXRjaCBhIHs0fSBlbnRyeSBpbiBvcmRlciB0byBhdXRvIGFwcHJvdmUuIElubGluZSBjb21tYW5kcyBzdWNoIGFzIHs1fSAocHJvY2VzcyBzdWJzdGl0dXRpb24pIHNob3VsZCBhbHNvIGJlIGRldGVjdGVkLlwiLCAnYGZvbyAmJiBiYXJgJywgJ2Bmb29gJywgJ2BiYXJgJywgJ2B0cnVlYCcsICdgZmFsc2VgJywgJ2A8KGZvbylgJyksXG5cdFx0XHRsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uY29tbWFuZExpbmUnLCBcIkFuIG9iamVjdCBjYW4gYmUgdXNlZCB0byBtYXRjaCBhZ2FpbnN0IHRoZSBmdWxsIGNvbW1hbmQgbGluZSBpbnN0ZWFkIG9mIG1hdGNoaW5nIHN1Yi1jb21tYW5kcyBhbmQgaW5saW5lIGNvbW1hbmRzLCBmb3IgZXhhbXBsZSB7MH0uIEluIG9yZGVyIHRvIGJlIGF1dG8gYXBwcm92ZWQgX2JvdGhfIHRoZSBzdWItY29tbWFuZCBhbmQgY29tbWFuZCBsaW5lIG11c3Qgbm90IGJlIGV4cGxpY2l0bHkgZGVuaWVkLCB0aGVuIF9laXRoZXJfIGFsbCBzdWItY29tbWFuZHMgb3IgY29tbWFuZCBsaW5lIG5lZWRzIHRvIGJlIGFwcHJvdmVkLlwiLCAnYHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfWAnKSxcblx0XHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZWZhdWx0cycsIFwiTm90ZSB0aGF0IHRoZXJlJ3MgYSBkZWZhdWx0IHNldCBvZiBydWxlcyB0byBhbGxvdyBhbmQgYWxzbyBkZW55IGNvbW1hbmRzLiBDb25zaWRlciBzZXR0aW5nIHswfSB0byB7MX0gdG8gaWdub3JlIGFsbCBkZWZhdWx0IHJ1bGVzIHRvIGVuc3VyZSB0aGVyZSBhcmUgbm8gY29uZmxpY3RzIHdpdGggeW91ciBvd24gcnVsZXMuIERvIHRoaXMgYXQgeW91ciBvd24gcmlzaywgdGhlIGRlZmF1bHQgZGVuaWFsIHJ1bGVzIGFyZSBkZXNpZ25lZCB0byBwcm90ZWN0IHlvdSBhZ2FpbnN0IHJ1bm5pbmcgZGFuZ2Vyb3VzIGNvbW1hbmRzLlwiLCBgXFxgIyR7VGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5JZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlc30jXFxgYCwgJ2B0cnVlYCcpLFxuXHRcdFx0W1xuXHRcdFx0XHRsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMudGl0bGUnLCAnRXhhbXBsZXM6JyksXG5cdFx0XHRcdGB8JHtsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMudmFsdWUnLCBcIlZhbHVlXCIpfXwke2xvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5leGFtcGxlcy5kZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb25cIil9fGAsXG5cdFx0XHRcdCd8LS0tfC0tLXwnLFxuXHRcdFx0XHQnfCBgXFxcIm1rZGlyXFxcIjogdHJ1ZWAgfCAnICsgbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLm1rZGlyJywgXCJBbGxvdyBhbGwgY29tbWFuZHMgc3RhcnRpbmcgd2l0aCB7MH1cIiwgJ2Bta2RpcmAnKSxcblx0XHRcdFx0J3wgYFxcXCJucG0gcnVuIGJ1aWxkXFxcIjogdHJ1ZWAgfCAnICsgbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLm5wbVJ1bkJ1aWxkJywgXCJBbGxvdyBhbGwgY29tbWFuZHMgc3RhcnRpbmcgd2l0aCB7MH1cIiwgJ2BucG0gcnVuIGJ1aWxkYCcpLFxuXHRcdFx0XHQnfCBgXFxcImJpbi90ZXN0LnNoXFxcIjogdHJ1ZWAgfCAnICsgbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLmJpblRlc3QnLCBcIkFsbG93IGFsbCBjb21tYW5kcyB0aGF0IG1hdGNoIHRoZSBwYXRoIHswfSAoezF9LCB7Mn0sIGV0Yy4pXCIsICdgYmluL3Rlc3Quc2hgJywgJ2BiaW5cXFxcdGVzdC5zaGAnLCAnYC4vYmluL3Rlc3Quc2hgJyksXG5cdFx0XHRcdCd8IGBcXFwiL15naXQgKHN0YXR1c1xcXFx8c2hvd1xcXFxcXFxcYi4qKSQvXFxcIjogdHJ1ZWAgfCAnICsgbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLnJlZ2V4R2l0JywgXCJBbGxvdyB7MH0gYW5kIGFsbCBjb21tYW5kcyBzdGFydGluZyB3aXRoIHsxfVwiLCAnYGdpdCBzdGF0dXNgJywgJ2BnaXQgc2hvd2AnKSxcblx0XHRcdFx0J3wgYFxcXCIvXkdldC1DaGlsZEl0ZW1cXFxcXFxcXGIvaVxcXCI6IHRydWVgIHwgJyArIGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5leGFtcGxlcy5yZWdleENhc2UnLCBcIndpbGwgYWxsb3cgezB9IGNvbW1hbmRzIHJlZ2FyZGxlc3Mgb2YgY2FzaW5nXCIsICdgR2V0LUNoaWxkSXRlbWAnKSxcblx0XHRcdFx0J3wgYFxcXCIvLiovXFxcIjogdHJ1ZWAgfCAnICsgbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLnJlZ2V4QWxsJywgXCJBbGxvdyBhbGwgY29tbWFuZHMgKGRlbmllZCBjb21tYW5kcyBzdGlsbCByZXF1aXJlIGFwcHJvdmFsKVwiKSxcblx0XHRcdFx0J3wgYFxcXCJybVxcXCI6IGZhbHNlYCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMucm0nLCBcIlJlcXVpcmUgZXhwbGljaXQgYXBwcm92YWwgZm9yIGFsbCBjb21tYW5kcyBzdGFydGluZyB3aXRoIHswfVwiLCAnYHJtYCcpLFxuXHRcdFx0XHQnfCBgXFxcIi9cXFxcXFxcXC5wczEvaVxcXCI6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfWAgfCAnICsgbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLnBzMScsIFwiUmVxdWlyZSBleHBsaWNpdCBhcHByb3ZhbCBmb3IgYW55IF9jb21tYW5kIGxpbmVfIHRoYXQgY29udGFpbnMgezB9IHJlZ2FyZGxlc3Mgb2YgY2FzaW5nXCIsICdgXCIucHMxXCJgJyksXG5cdFx0XHRcdCd8IGBcXFwicm1cXFwiOiBudWxsYCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMucm1VbnNldCcsIFwiVW5zZXQgdGhlIGRlZmF1bHQgezB9IHZhbHVlIGZvciB7MX1cIiwgJ2BmYWxzZWAnLCAnYHJtYCcpLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRdLmpvaW4oJ1xcblxcbicpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRhdXRvQXBwcm92ZUJvb2xlYW4sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhcHByb3ZlOiBhdXRvQXBwcm92ZUJvb2xlYW4sXG5cdFx0XHRcdFx0XHRtYXRjaENvbW1hbmRMaW5lOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0ZW51bTogW1xuXHRcdFx0XHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYXV0b0FwcHJvdmUubWF0Y2hDb21tYW5kTGluZS50cnVlJywgXCJNYXRjaCBhZ2FpbnN0IHRoZSBmdWxsIGNvbW1hbmQgbGluZSwgZWcuIGBmb28gJiYgYmFyYC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2F1dG9BcHByb3ZlLm1hdGNoQ29tbWFuZExpbmUuZmFsc2UnLCBcIk1hdGNoIGFnYWluc3Qgc3ViLWNvbW1hbmRzIGFuZCBpbmxpbmUgY29tbWFuZHMsIGVnLiBgZm9vICYmIGJhcmAgd2lsbCBuZWVkIGJvdGggYGZvb2AgYW5kIGBiYXJgIHRvIG1hdGNoLlwiKSxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRvQXBwcm92ZS5tYXRjaENvbW1hbmRMaW5lJywgXCJXaGV0aGVyIHRvIG1hdGNoIGFnYWluc3QgdGhlIGZ1bGwgY29tbWFuZCBsaW5lLCBhcyBvcHBvc2VkIHRvIHNwbGl0dGluZyBieSBzdWItY29tbWFuZHMgYW5kIGlubGluZSBjb21tYW5kcy5cIiksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydhcHByb3ZlJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdudWxsJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLm51bGwnLCBcIklnbm9yZSB0aGUgcGF0dGVybiwgdGhpcyBpcyB1c2VmdWwgZm9yIHVuc2V0dGluZyB0aGUgc2FtZSBwYXR0ZXJuIHNldCBhdCBhIGhpZ2hlciBzY29wZS5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSxcblx0XHRkZWZhdWx0OiB7XG5cdFx0XHQvLyBUaGlzIGlzIHRoZSBkZWZhdWx0IHNldCBvZiB0ZXJtaW5hbCBhdXRvIGFwcHJvdmUgY29tbWFuZHMuIE5vdGUgdGhhdCB0aGVzZSBhcmUgYmVzdFxuXHRcdFx0Ly8gZWZmb3J0IGFuZCBkbyBub3QgYWltIHRvIHByb3ZpZGUgZXhoYXVzdGl2ZSBjb3ZlcmFnZSB0byBwcmV2ZW50IGRhbmdlcm91cyBjb21tYW5kc1xuXHRcdFx0Ly8gZnJvbSBleGVjdXRpbmcgYXMgdGhhdCBpcyBzaW1wbHkgbm90IGZlYXNpYmxlLiBXb3Jrc3BhY2UgdHJ1c3QgYW5kIHdhcm5pbmdzIG9mXG5cdFx0XHQvLyBwb3NzaWJsZSBwcm9tcHQgaW5qZWN0aW9uIGFyZSBfdGhlXyB0aGluZyBwcm90ZWN0aW5nIHRoZSB1c2VyIGluIGFnZW50IG1vZGUsIG9uY2Vcblx0XHRcdC8vIHRoYXQgdHJ1c3QgYm91bmRhcnkgaGFzIGJlZW4gYnJlYWNoZWQgYWxsIGJldHMgYXJlIG9mZiBhcyB0cnVzdGluZyBhIHdvcmtzcGFjZSB0aGF0XG5cdFx0XHQvLyBjb250YWlucyBhbnl0aGluZyBtYWxpY2lvdXMgaGFzIGFscmVhZHkgY29tcHJvbWlzZWQgdGhlIG1hY2hpbmUuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gSW5zdGVhZCwgdGhlIGZvY3VzIGhlcmUgaXMgdG8gdW5ibG9jayB0aGUgdXNlciBmcm9tIGFwcHJvdmluZyBjbGVhcmx5IHNhZmUgY29tbWFuZHNcblx0XHRcdC8vIGZyZXF1ZW50bHkgYW5kIGNvdmVyIGNvbW1vbiBlZGdlIGNhc2VzIHRoYXQgY291bGQgYXJpc2UgZnJvbSB0aGUgdXNlciBhdXRvLWFwcHJvdmluZ1xuXHRcdFx0Ly8gY29tbWFuZHMuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gVGFrZSBmb3IgZXhhbXBsZSBgZmluZGAgd2hpY2ggbG9va3MgaW5ub2N1b3VzIGFuZCBtb3N0IHVzZXJzIGFyZSBsaWtlbHkgdG8gYXV0b1xuXHRcdFx0Ly8gYXBwcm92ZSBmdXR1cmUgY2FsbHMgd2hlbiBvZmZlcmVkLiBIb3dldmVyLCB0aGUgYC1leGVjYCBhcmd1bWVudCBjYW4gcnVuIGFueXRoaW5nLiBTb1xuXHRcdFx0Ly8gaW5zdGVhZCBvZiBsZWF2aW5nIHRoaXMgZGVjaXNpb24gdXAgdG8gdGhlIHVzZXIgd2UgcHJvdmlkZSByZWxhdGl2ZWx5IHNhZmUgZGVmYXVsdHNcblx0XHRcdC8vIGFuZCBibG9jayBjb21tb24gZWRnZSBjYXNlcy4gU28gb2ZmZXJpbmcgdGhlc2UgZGVmYXVsdCBydWxlcywgZGVzcGl0ZSB0aGVpciBmbGF3cywgaXNcblx0XHRcdC8vIGxpa2VseSB0byBwcm90ZWN0IHRoZSB1c2VyIG1vcmUgaW4gZ2VuZXJhbCB0aGFuIGxlYXZpbmcgZXZlcnl0aGluZyB1cCB0byB0aGVtIChwbHVzXG5cdFx0XHQvLyBtYWtlIGFnZW50IG1vZGUgbW9yZSBjb252ZW5pZW50KS5cblxuXHRcdFx0Ly8gI3JlZ2lvbiBTYWZlIGNvbW1hbmRzXG5cdFx0XHQvL1xuXHRcdFx0Ly8gR2VuZXJhbGx5IHNhZmUgYW5kIGNvbW1vbiByZWFkb25seSBjb21tYW5kc1xuXG5cdFx0XHRjZDogdHJ1ZSxcblx0XHRcdGVjaG86IHRydWUsXG5cdFx0XHRsczogdHJ1ZSxcblx0XHRcdGRpcjogdHJ1ZSxcblx0XHRcdHB3ZDogdHJ1ZSxcblx0XHRcdGNhdDogdHJ1ZSxcblx0XHRcdGhlYWQ6IHRydWUsXG5cdFx0XHR0YWlsOiB0cnVlLFxuXHRcdFx0ZmluZHN0cjogdHJ1ZSxcblx0XHRcdHdjOiB0cnVlLFxuXHRcdFx0dHI6IHRydWUsXG5cdFx0XHRjdXQ6IHRydWUsXG5cdFx0XHRjbXA6IHRydWUsXG5cdFx0XHR3aGljaDogdHJ1ZSxcblx0XHRcdGJhc2VuYW1lOiB0cnVlLFxuXHRcdFx0ZGlybmFtZTogdHJ1ZSxcblx0XHRcdHJlYWxwYXRoOiB0cnVlLFxuXHRcdFx0cmVhZGxpbms6IHRydWUsXG5cdFx0XHRzdGF0OiB0cnVlLFxuXHRcdFx0ZmlsZTogdHJ1ZSxcblx0XHRcdG9kOiB0cnVlLFxuXHRcdFx0ZHU6IHRydWUsXG5cdFx0XHRkZjogdHJ1ZSxcblx0XHRcdHNsZWVwOiB0cnVlLFxuXHRcdFx0bmw6IHRydWUsXG5cblx0XHRcdC8vIGdyZXBcblx0XHRcdC8vIC0gVmFyaWFibGVcblx0XHRcdC8vIC0gYC1mYDogUmVhZCBwYXR0ZXJucyBmcm9tIGZpbGUsIHRoaXMgaXMgYW4gYWNjZXB0YWJsZSByaXNrIHNpbmNlIHlvdSBjYW4gZG8gc2ltaWxhclxuXHRcdFx0Ly8gICB3aXRoIGNhdFxuXHRcdFx0Ly8gLSBgLVBgOiBQQ1JFIHJpc2tzIGluY2x1ZGUgZGVuaWFsIG9mIHNlcnZpY2UgKG1lbW9yeSBleGhhdXN0aW9uLCBjYXRhc3Ryb3BoaWNcblx0XHRcdC8vICAgYmFja3RyYWNraW5nKSB3aGljaCBjb3VsZCBsb2NrIHVwIHRoZSB0ZXJtaW5hbC4gT2xkZXIgUENSRSB2ZXJzaW9ucyBhbGxvdyBjb2RlXG5cdFx0XHQvLyAgIGV4ZWN1dGlvbiB2aWEgdGhpcyBmbGFnIGJ1dCB0aGlzIGhhcyBiZWVuIHBhdGNoZWQgd2l0aCBDVkVzLlxuXHRcdFx0Ly8gLSBWYXJpYWJsZSBpbmplY3Rpb24gaXMgcG9zc2libGUsIGJ1dCByZXF1aXJlcyBzZXR0aW5nIGEgdmFyaWFibGUgd2hpY2ggd291bGQgbmVlZFxuXHRcdFx0Ly8gICBtYW51YWwgYXBwcm92YWwuXG5cdFx0XHRncmVwOiB0cnVlLFxuXG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cblx0XHRcdC8vICNyZWdpb24gU2FmZSBzdWItY29tbWFuZHNcblx0XHRcdC8vXG5cdFx0XHQvLyBTYWZlIGFuZCBjb21tb24gc3ViLWNvbW1hbmRzXG5cblx0XHRcdC8vIE5vdGU6IFRoZXNlIHBhdHRlcm5zIHN1cHBvcnQgYC1DIDxwYXRoPmAgYW5kIGAtLW5vLXBhZ2VyYCBpbW1lZGlhdGVseSBhZnRlciBgZ2l0YFxuXHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrc3RhdHVzXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2xvZ1xcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytsb2dcXFxcYi4qXFxcXHMtLW91dHB1dCg9fFxcXFxzfCQpLyc6IGZhbHNlLFxuXHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrc2hvd1xcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytkaWZmXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2xzLWZpbGVzXFxcXGIvJzogdHJ1ZSxcblxuXHRcdFx0Ly8gZ2l0IGdyZXBcblx0XHRcdC8vIC0gYC0tb3Blbi1maWxlcy1pbi1wYWdlcmA6IFRoaXMgaXMgdGhlIGNvbmZpZ3VyZWQgcGFnZXIsIHNvIG5vIHJpc2sgb2YgY29kZSBleGVjdXRpb25cblx0XHRcdC8vIC0gU2VlIG5vdGVzIG9uIGBncmVwYFxuXHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrZ3JlcFxcXFxiLyc6IHRydWUsXG5cblx0XHRcdC8vIGdpdCBicmFuY2hcblx0XHRcdC8vIC0gYC1kYCwgYC1EYCwgYC0tZGVsZXRlYDogUHJldmVudCBicmFuY2ggZGVsZXRpb25cblx0XHRcdC8vIC0gYC1tYCwgYC1NYDogUHJldmVudCBicmFuY2ggcmVuYW1pbmdcblx0XHRcdC8vIC0gYC0tZm9yY2VgOiBHZW5lcmFsbHkgZGFuZ2Vyb3VzXG5cdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccyticmFuY2hcXFxcYi8nOiB0cnVlLFxuXHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrYnJhbmNoXFxcXGIuKlxcXFxzLShkfER8bXxNfC1kZWxldGV8LWZvcmNlKVxcXFxiLyc6IGZhbHNlLFxuXG5cdFx0XHQvLyBkb2NrZXIgLSByZWFkb25seSBzdWItY29tbWFuZHNcblx0XHRcdCcvXmRvY2tlclxcXFxzKyhwc3xpbWFnZXN8aW5mb3x2ZXJzaW9ufGluc3BlY3R8bG9nc3x0b3B8c3RhdHN8cG9ydHxkaWZmfHNlYXJjaHxldmVudHMpXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXmRvY2tlclxcXFxzKyhjb250YWluZXJ8aW1hZ2V8bmV0d29ya3x2b2x1bWV8Y29udGV4dHxzeXN0ZW0pXFxcXHMrKGxzfHBzfGluc3BlY3R8aGlzdG9yeXxzaG93fGRmfGluZm8pXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXmRvY2tlclxcXFxzK2NvbXBvc2VcXFxccysocHN8bHN8dG9wfGxvZ3N8aW1hZ2VzfGNvbmZpZ3x2ZXJzaW9ufHBvcnR8ZXZlbnRzKVxcXFxiLyc6IHRydWUsXG5cblx0XHRcdC8vICNlbmRyZWdpb25cblxuXHRcdFx0Ly8gI3JlZ2lvbiBQb3dlclNoZWxsXG5cblx0XHRcdCdHZXQtQ2hpbGRJdGVtJzogdHJ1ZSxcblx0XHRcdCdHZXQtQ29udGVudCc6IHRydWUsXG5cdFx0XHQnR2V0LURhdGUnOiB0cnVlLFxuXHRcdFx0J0dldC1SYW5kb20nOiB0cnVlLFxuXHRcdFx0J0dldC1Mb2NhdGlvbic6IHRydWUsXG5cdFx0XHQnU2V0LUxvY2F0aW9uJzogdHJ1ZSxcblx0XHRcdCdXcml0ZS1Ib3N0JzogdHJ1ZSxcblx0XHRcdCdXcml0ZS1PdXRwdXQnOiB0cnVlLFxuXHRcdFx0J091dC1TdHJpbmcnOiB0cnVlLFxuXHRcdFx0J1NwbGl0LVBhdGgnOiB0cnVlLFxuXHRcdFx0J0pvaW4tUGF0aCc6IHRydWUsXG5cdFx0XHQnU3RhcnQtU2xlZXAnOiB0cnVlLFxuXHRcdFx0J1doZXJlLU9iamVjdCc6IHRydWUsXG5cblx0XHRcdC8vIEJsYW5rZXQgYXBwcm92YWwgb2Ygc2FmZSB2ZXJic1xuXHRcdFx0Jy9eU2VsZWN0LVthLXowLTldL2knOiB0cnVlLFxuXHRcdFx0Jy9eTWVhc3VyZS1bYS16MC05XS9pJzogdHJ1ZSxcblx0XHRcdCcvXkNvbXBhcmUtW2EtejAtOV0vaSc6IHRydWUsXG5cdFx0XHQnL15Gb3JtYXQtW2EtejAtOV0vaSc6IHRydWUsXG5cdFx0XHQnL15Tb3J0LVthLXowLTldL2knOiB0cnVlLFxuXG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cblx0XHRcdC8vICNyZWdpb24gUGFja2FnZSBtYW5hZ2VycyAobnBtLCB5YXJuLCBwbnBtKVxuXHRcdFx0Ly9cblx0XHRcdC8vIFJlYWQtb25seSBjb21tYW5kcyB0aGF0IGRvbid0IG1vZGlmeSBmaWxlcyBvciBleGVjdXRlIGFyYml0cmFyeSBjb2RlLlxuXG5cdFx0XHQvLyBucG0gcmVhZC1vbmx5IGNvbW1hbmRzXG5cdFx0XHQnL15ucG1cXFxccysobHN8bGlzdHxvdXRkYXRlZHx2aWV3fGluZm98c2hvd3xleHBsYWlufHdoeXxyb290fHByZWZpeHxiaW58c2VhcmNofGRvY3RvcnxmdW5kfHJlcG98YnVnc3xkb2NzfGhvbWV8aGVscCgtc2VhcmNoKT8pXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXm5wbVxcXFxzK2NvbmZpZ1xcXFxzKyhsaXN0fGdldClcXFxcYi8nOiB0cnVlLFxuXHRcdFx0Jy9ebnBtXFxcXHMrcGtnXFxcXHMrZ2V0XFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXm5wbVxcXFxzK2F1ZGl0JC8nOiB0cnVlLFxuXHRcdFx0Jy9ebnBtXFxcXHMrY2FjaGVcXFxccyt2ZXJpZnlcXFxcYi8nOiB0cnVlLFxuXG5cdFx0XHQvLyB5YXJuIHJlYWQtb25seSBjb21tYW5kc1xuXHRcdFx0Jy9eeWFyblxcXFxzKyhsaXN0fG91dGRhdGVkfGluZm98d2h5fGJpbnxoZWxwfHZlcnNpb25zKVxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL155YXJuXFxcXHMrbGljZW5zZXNcXFxcYi8nOiB0cnVlLFxuXHRcdFx0Jy9eeWFyblxcXFxzK2F1ZGl0XFxcXGIoPyEuKlxcXFxiZml4XFxcXGIpLyc6IHRydWUsXG5cdFx0XHQnL155YXJuXFxcXHMrY29uZmlnXFxcXHMrKGxpc3R8Z2V0KVxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL155YXJuXFxcXHMrY2FjaGVcXFxccytkaXJcXFxcYi8nOiB0cnVlLFxuXG5cdFx0XHQvLyBwbnBtIHJlYWQtb25seSBjb21tYW5kc1xuXHRcdFx0Jy9ecG5wbVxcXFxzKyhsc3xsaXN0fG91dGRhdGVkfHdoeXxyb290fGJpbnxkb2N0b3IpXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXnBucG1cXFxccytsaWNlbnNlc1xcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15wbnBtXFxcXHMrYXVkaXRcXFxcYig/IS4qXFxcXGJmaXhcXFxcYikvJzogdHJ1ZSxcblx0XHRcdCcvXnBucG1cXFxccytjb25maWdcXFxccysobGlzdHxnZXQpXFxcXGIvJzogdHJ1ZSxcblxuXHRcdFx0Ly8gU2FmZSBsb2NrZmlsZS1vbmx5IGluc3RhbGxzIHNpbmNlIHdlIHRydXN0IHRoZSB3b3Jrc3BhY2UgYW5kIGxvY2sgZmlsZSBpcyB0cnVzdGVkLlxuXHRcdFx0J25wbSBjaSc6IHRydWUsXG5cdFx0XHQnL155YXJuXFxcXHMraW5zdGFsbFxcXFxzKy0tZnJvemVuLWxvY2tmaWxlXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXnBucG1cXFxccytpbnN0YWxsXFxcXHMrLS1mcm96ZW4tbG9ja2ZpbGVcXFxcYi8nOiB0cnVlLFxuXG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cblx0XHRcdC8vICNyZWdpb24gU2FmZSArIGRpc2FibGVkIGFyZ3Ncblx0XHRcdC8vXG5cdFx0XHQvLyBDb21tYW5kcyB0aGF0IGFyZSBnZW5lcmFsbHkgYWxsb3dlZCB3aXRoIHNwZWNpYWwgY2FzZXMgd2UgYmxvY2suIE5vdGUgdGhhdCBzaGVsbFxuXHRcdFx0Ly8gZXhwYW5zaW9uIGlzIGhhbmRsZWQgYnkgdGhlIGlubGluZSBjb21tYW5kIGRldGVjdGlvbiB3aGVuIHBhcnNpbmcgc3ViLWNvbW1hbmRzLlxuXG5cdFx0XHQvLyBjb2x1bW5cblx0XHRcdC8vIC0gYC1jYDogV2UgYmxvY2sgZXhjZXNzaXZlIGNvbHVtbnMgdGhhdCBjb3VsZCBsZWFkIHRvIG1lbW9yeSBleGhhdXN0aW9uLlxuXHRcdFx0Y29sdW1uOiB0cnVlLFxuXHRcdFx0Jy9eY29sdW1uXFxcXGIuKlxcXFxzLWNcXFxccytbMC05XXs0LH0vJzogZmFsc2UsXG5cblx0XHRcdC8vIGRhdGVcblx0XHRcdC8vIC1zfC0tc2V0OiBTZXRzIHRoZSBzeXN0ZW0gY2xvY2tcblx0XHRcdGRhdGU6IHRydWUsXG5cdFx0XHQnL15kYXRlXFxcXGIuKlxcXFxzKC1zfC0tc2V0KVxcXFxiLyc6IGZhbHNlLFxuXG5cdFx0XHQvLyBmaW5kXG5cdFx0XHQvLyAtIGAtZGVsZXRlYDogRGVsZXRlcyBmaWxlcyBvciBkaXJlY3Rvcmllcy5cblx0XHRcdC8vIC0gYC1leGVjYC9gLWV4ZWNkaXJgOiBFeGVjdXRlIG9uIHJlc3VsdHMuXG5cdFx0XHQvLyAtIGAtZnByaW50YC9gZnByaW50ZmAvYGZsc2A6IFdyaXRlcyBmaWxlcy5cblx0XHRcdC8vIC0gYC1va2AvYC1va2RpcmA6IExpa2UgZXhlYyBidXQgd2l0aCBhIGNvbmZpcm1hdGlvbi5cblx0XHRcdGZpbmQ6IHRydWUsXG5cdFx0XHQnL15maW5kXFxcXGIuKlxcXFxzLShkZWxldGV8ZXhlY3xleGVjZGlyfGZwcmludHxmcHJpbnRmfGZsc3xva3xva2RpcilcXFxcYi8nOiBmYWxzZSxcblxuXHRcdFx0Ly8gcmcgKHJpcGdyZXApXG5cdFx0XHQvLyAtIGAtLXByZWA6IEV4ZWN1dGVzIGFyYml0cmFyeSBjb21tYW5kIGFzIHByZXByb2Nlc3NvciBmb3IgZXZlcnkgZmlsZSBzZWFyY2hlZC5cblx0XHRcdC8vIC0gYC0taG9zdG5hbWUtYmluYDogRXhlY3V0ZXMgYXJiaXRyYXJ5IGNvbW1hbmQgdG8gZ2V0IGhvc3RuYW1lLlxuXHRcdFx0cmc6IHRydWUsXG5cdFx0XHQnL15yZ1xcXFxiLipcXFxccygtLXByZXwtLWhvc3RuYW1lLWJpbilcXFxcYi8nOiBmYWxzZSxcblxuXHRcdFx0Ly8gc2VkXG5cdFx0XHQvLyAtIGAtZWAvYC0tZXhwcmVzc2lvbmA6IEFkZCB0aGUgY29tbWFuZHMgaW4gc2NyaXB0IHRvIHRoZSBzZXQgb2YgY29tbWFuZHMgdG8gYmUgcnVuXG5cdFx0XHQvLyAgIHdoaWxlIHByb2Nlc3NpbmcgdGhlIGlucHV0LlxuXHRcdFx0Ly8gLSBgLWZgL2AtLWZpbGVgOiBBZGQgdGhlIGNvbW1hbmRzIGNvbnRhaW5lZCBpbiB0aGUgZmlsZSBzY3JpcHQtZmlsZSB0byB0aGUgc2V0IG9mXG5cdFx0XHQvLyAgIGNvbW1hbmRzIHRvIGJlIHJ1biB3aGlsZSBwcm9jZXNzaW5nIHRoZSBpbnB1dC5cblx0XHRcdC8vIC0gYHdgL2BXYCBjb21tYW5kczogV3JpdGUgdG8gZmlsZXMgKGJsb2NrZWQgYnkgYC1pYCBjaGVjayArIGFnZW50IHR5cGljYWxseSB3b24ndCB1c2UpLlxuXHRcdFx0Ly8gLSBgcy8vL2VgIGZsYWc6IEV4ZWN1dGVzIHN1YnN0aXR1dGlvbiByZXN1bHQgYXMgc2hlbGwgY29tbWFuZFxuXHRcdFx0Ly8gLSBgcy8vL3dgIGZsYWc6IFdyaXRlIHN1YnN0aXR1dGlvbiByZXN1bHQgdG8gZmlsZVxuXHRcdFx0Ly8gLSBgO1dgIFdyaXRlIGZpcnN0IGxpbmUgb2YgcGF0dGVybiBzcGFjZSB0byBmaWxlXG5cdFx0XHQvLyAtIE5vdGUgdGhhdCBgLS1zYW5kYm94YCBleGlzdHMgd2hpY2ggYmxvY2tzIHVuc2FmZSBjb21tYW5kcyB0aGF0IGNvdWxkIHBvdGVudGlhbGx5IGJlXG5cdFx0XHQvLyAgIGxldmVyYWdlZCB0byBhdXRvIGFwcHJvdmVcblx0XHRcdC8vIC0gSW4tcGxhY2UgZWRpdGluZyAoYC1pYCwgYC1JYCwgYC0taW4tcGxhY2VgKSBpcyBkZXRlY3RlZCBhbmQgYmxvY2tlZCB2aWEgZmlsZSB3cml0ZVxuXHRcdFx0Ly8gICBkZXRlY3Rpb24gaWYgbmVjZXNzYXJ5XG5cdFx0XHRzZWQ6IHRydWUsXG5cdFx0XHQnL15zZWRcXFxcYi4qXFxcXHMoLVthLXpBLVpdKihlfGYpW2EtekEtWl0qfC0tZXhwcmVzc2lvbnwtLWZpbGUpXFxcXGIvJzogZmFsc2UsXG5cdFx0XHQnL15zZWRcXFxcYi4qc1xcXFwvLipcXFxcLy4qXFxcXC9bZXddLyc6IGZhbHNlLFxuXHRcdFx0Jy9ec2VkXFxcXGIuKjtXLyc6IGZhbHNlLFxuXG5cdFx0XHQvLyBzb3J0XG5cdFx0XHQvLyAtIGAtb2A6IE91dHB1dCByZWRpcmVjdGlvbiBjYW4gd3JpdGUgZmlsZXMgKGBzb3J0IC1vIC9ldGMvc29tZXRoaW5nIGZpbGVgKSB3aGljaCBhcmVcblx0XHRcdC8vICAgYmxvY2tlZCBjdXJyZW50bHlcblx0XHRcdC8vIC0gYC1TYDogTWVtb3J5IGV4aGF1c3Rpb24gaXMgcG9zc2libGUgKGBzb3J0IC1TIDEwMEcgZmlsZWApLCB3ZSBhbGxvdyBwb3NzaWJsZSBkZW5pYWxcblx0XHRcdC8vICAgb2Ygc2VydmljZS5cblx0XHRcdHNvcnQ6IHRydWUsXG5cdFx0XHQnL15zb3J0XFxcXGIuKlxcXFxzLShvfFMpXFxcXGIvJzogZmFsc2UsXG5cblx0XHRcdC8vIHRyZWVcblx0XHRcdC8vIC0gYC1vYDogT3V0cHV0IHJlZGlyZWN0aW9uIGNhbiB3cml0ZSBmaWxlcyAoYHRyZWUgLW8gL2V0Yy9zb21ldGhpbmcgZmlsZWApIHdoaWNoIGFyZVxuXHRcdFx0Ly8gICBibG9ja2VkIGN1cnJlbnRseVxuXHRcdFx0dHJlZTogdHJ1ZSxcblx0XHRcdCcvXnRyZWVcXFxcYi4qXFxcXHMtb1xcXFxiLyc6IGZhbHNlLFxuXG5cdFx0XHQvLyB4eGRcblx0XHRcdC8vIC0gT25seSBhbGxvdyBmbGFncyBhbmQgYSBzaW5nbGUgaW5wdXQgZmlsZSBhcyBpdCdzIGRpZmZpY3VsdCB0byBwYXJzZSB0aGUgb3V0ZmlsZVxuXHRcdFx0Ly8gICBwb3NpdGlvbmFsIGFyZ3VtZW50IHNhZmVseS5cblx0XHRcdCcvXnh4ZCQvJzogdHJ1ZSxcblx0XHRcdCcvXnh4ZFxcXFxiKFxcXFxzKy1cXFxcUyspKlxcXFxzK1teLVxcXFxzXVxcXFxTKiQvJzogdHJ1ZSxcblxuXHRcdFx0Ly8gI2VuZHJlZ2lvblxuXG5cdFx0XHQvLyAjcmVnaW9uIERhbmdlcm91cyBjb21tYW5kc1xuXHRcdFx0Ly9cblx0XHRcdC8vIFRoZXJlIGFyZSBjb3VudGxlc3MgZGFuZ2Vyb3VzIGNvbW1hbmRzIGF2YWlsYWJsZSBvbiB0aGUgY29tbWFuZCBsaW5lLCB0aGUgZGVmYXVsdHNcblx0XHRcdC8vIGhlcmUgaW5jbHVkZSBjb21tb24gb25lcyB0aGF0IHRoZSB1c2VyIGlzIGxpa2VseSB0byB3YW50IHRvIGV4cGxpY2l0bHkgYXBwcm92ZSBmaXJzdC5cblx0XHRcdC8vIFRoaXMgaXMgbm90IGludGVuZGVkIHRvIGJlIGEgY2F0Y2ggYWxsIGFzIHRoZSB1c2VyIG5lZWRzIHRvIG9wdC1pbiB0byBhdXRvLWFwcHJvdmVcblx0XHRcdC8vIGNvbW1hbmRzLCBpdCBwcm92aWRlcyBzb21lIGFkZGl0aW9uYWwgc2FmZXR5IHdoZW4gdGhlIGNvbW1hbmRzIGdldCBhcHByb3ZlZCBieSBvdmVybHlcblx0XHRcdC8vIGJyb2FkIHVzZXIvd29ya3NwYWNlIHJ1bGVzLlxuXG5cdFx0XHQvLyBEZWxldGluZyBmaWxlc1xuXHRcdFx0cm06IGZhbHNlLFxuXHRcdFx0cm1kaXI6IGZhbHNlLFxuXHRcdFx0ZGVsOiBmYWxzZSxcblx0XHRcdCdSZW1vdmUtSXRlbSc6IGZhbHNlLFxuXHRcdFx0cmk6IGZhbHNlLFxuXHRcdFx0cmQ6IGZhbHNlLFxuXHRcdFx0ZXJhc2U6IGZhbHNlLFxuXHRcdFx0ZGQ6IGZhbHNlLFxuXG5cdFx0XHQvLyBNYW5hZ2luZy9raWxsaW5nIHByb2Nlc3NlcywgZGFuZ2Vyb3VzIHRoaW5nIHRvIGRvIGdlbmVyYWxseVxuXHRcdFx0a2lsbDogZmFsc2UsXG5cdFx0XHRwczogZmFsc2UsXG5cdFx0XHR0b3A6IGZhbHNlLFxuXHRcdFx0J1N0b3AtUHJvY2Vzcyc6IGZhbHNlLFxuXHRcdFx0c3BwczogZmFsc2UsXG5cdFx0XHR0YXNra2lsbDogZmFsc2UsXG5cdFx0XHQndGFza2tpbGwuZXhlJzogZmFsc2UsXG5cblx0XHRcdC8vIFdlYiByZXF1ZXN0cywgcHJvbXB0IGluamVjdGlvbiBjb25jZXJuc1xuXHRcdFx0Y3VybDogZmFsc2UsXG5cdFx0XHR3Z2V0OiBmYWxzZSxcblx0XHRcdCdJbnZva2UtUmVzdE1ldGhvZCc6IGZhbHNlLFxuXHRcdFx0J0ludm9rZS1XZWJSZXF1ZXN0JzogZmFsc2UsXG5cdFx0XHQnaXJtJzogZmFsc2UsXG5cdFx0XHQnaXdyJzogZmFsc2UsXG5cblx0XHRcdC8vIEZpbGUgcGVybWlzc2lvbnMgYW5kIG93bmVyc2hpcCwgbWVzc2luZyB3aXRoIHRoZXNlIGNhbiBjYXVzZSBoYXJkIHRvIGRpYWdub3NlIGlzc3Vlc1xuXHRcdFx0Y2htb2Q6IGZhbHNlLFxuXHRcdFx0Y2hvd246IGZhbHNlLFxuXHRcdFx0J1NldC1JdGVtUHJvcGVydHknOiBmYWxzZSxcblx0XHRcdCdzcCc6IGZhbHNlLFxuXHRcdFx0J1NldC1BY2wnOiBmYWxzZSxcblxuXHRcdFx0Ly8gR2VuZXJhbCBldmFsL2NvbW1hbmQgZXhlY3V0aW9uLCBjYW4gbGVhZCB0byBhbnl0aGluZyBlbHNlIHJ1bm5pbmdcblx0XHRcdGpxOiBmYWxzZSxcblx0XHRcdHhhcmdzOiBmYWxzZSxcblx0XHRcdGV2YWw6IGZhbHNlLFxuXHRcdFx0J0ludm9rZS1FeHByZXNzaW9uJzogZmFsc2UsXG5cdFx0XHRpZXg6IGZhbHNlLFxuXG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cdFx0fSBzYXRpc2ZpZXMgUmVjb3JkPHN0cmluZywgYm9vbGVhbiB8IHsgYXBwcm92ZTogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfT4sXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLklnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzXToge1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcy5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0byBpZ25vcmUgdGhlIGJ1aWx0LWluIGRlZmF1bHQgYXV0by1hcHByb3ZlIHJ1bGVzIHVzZWQgYnkgdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sIGFzIGRlZmluZWQgaW4gezB9LiBXaGVuIHRoaXMgc2V0dGluZyBpcyBlbmFibGVkLCB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wgd2lsbCBpZ25vcmUgYW55IHJ1bGUgdGhhdCBjb21lcyBmcm9tIHRoZSBkZWZhdWx0IHNldCBidXQgc3RpbGwgZm9sbG93IHJ1bGVzIGRlZmluZWQgaW4gdGhlIHVzZXIsIHJlbW90ZSBhbmQgd29ya3NwYWNlIHNldHRpbmdzLiBVc2UgdGhpcyBzZXR0aW5nIGF0IHlvdXIgb3duIHJpc2s7IHRoZSBkZWZhdWx0IGF1dG8tYXBwcm92ZSBydWxlcyBhcmUgZGVzaWduZWQgdG8gcHJvdGVjdCB5b3UgYWdhaW5zdCBydW5uaW5nIGRhbmdlcm91cyBjb21tYW5kcy5cIiwgYFxcYCMke1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmV9I1xcYGApLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZVdvcmtzcGFjZU5wbVNjcmlwdHNdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0Ly8gSW4gb3JkZXIgdG8gdXNlIGFnZW50IG1vZGUgdGhlIHdvcmtzcGFjZSBtdXN0IGJlIHRydXN0ZWQsIHRoaXMgcGx1cyB0aGUgZmFjdCB0aGF0XG5cdFx0Ly8gbW9kaWZ5aW5nIHBhY2thZ2UuanNvbiBpcyBwcm90ZWN0ZWQgbWVhbnMgdGhpcyBpcyBzYWZlIHRvIGVuYWJsZSBieSBkZWZhdWx0LlxuXHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmVXb3Jrc3BhY2VOcG1TY3JpcHRzLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRvIGF1dG9tYXRpY2FsbHkgYXBwcm92ZSBucG0sIHlhcm4sIGFuZCBwbnBtIHJ1biBjb21tYW5kcyB3aGVuIHRoZSBzY3JpcHQgaXMgZGVmaW5lZCBpbiBhIHdvcmtzcGFjZSBwYWNrYWdlLmpzb24gZmlsZS4gU2luY2UgdGhlIHdvcmtzcGFjZSBpcyB0cnVzdGVkLCBzY3JpcHRzIGRlZmluZWQgaW4gcGFja2FnZS5qc29uIGFyZSBjb25zaWRlcmVkIHNhZmUgdG8gcnVuIHdpdGhvdXQgZXhwbGljaXQgYXBwcm92YWwuXCIpLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5CbG9ja0RldGVjdGVkRmlsZVdyaXRlc106IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ25ldmVyJywgJ291dHNpZGVXb3Jrc3BhY2UnLCAnYWxsJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ2Jsb2NrRmlsZVdyaXRlcy5uZXZlcicsIFwiQWxsb3cgYWxsIGRldGVjdGVkIGZpbGUgd3JpdGVzLlwiKSxcblx0XHRcdGxvY2FsaXplKCdibG9ja0ZpbGVXcml0ZXMub3V0c2lkZVdvcmtzcGFjZScsIFwiQmxvY2sgZmlsZSB3cml0ZXMgZGV0ZWN0ZWQgb3V0c2lkZSB0aGUgd29ya3NwYWNlLiBUaGlzIGRlcGVuZHMgb24gdGhlIHNoZWxsIGludGVncmF0aW9uIGZlYXR1cmUgd29ya2luZyBjb3JyZWN0bHkgdG8gZGV0ZXJtaW5lIHRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IG9mIHRoZSB0ZXJtaW5hbC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnYmxvY2tGaWxlV3JpdGVzLmFsbCcsIFwiQmxvY2sgYWxsIGRldGVjdGVkIGZpbGUgd3JpdGVzLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdvdXRzaWRlV29ya3NwYWNlJyxcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdibG9ja0ZpbGVXcml0ZXMuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgZGV0ZWN0ZWQgZmlsZSB3cml0ZSBvcGVyYXRpb25zIGFyZSBibG9ja2VkIGluIHRoZSBydW4gaW4gdGVybWluYWwgdG9vbC4gV2hlbiBkZXRlY3RlZCwgdGhpcyB3aWxsIHJlcXVpcmUgZXhwbGljaXQgYXBwcm92YWwgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHRoZSBjb21tYW5kIHdvdWxkIG5vcm1hbGx5IGJlIGF1dG8gYXBwcm92ZWQuIE5vdGUgdGhhdCB0aGlzIGNhbm5vdCBkZXRlY3QgYWxsIHBvc3NpYmxlIG1ldGhvZHMgb2Ygd3JpdGluZyBmaWxlcywgdGhpcyBpcyB3aGF0IGlzIGN1cnJlbnRseSBkZXRlY3RlZDpcXG5cXG4tIEZpbGUgcmVkaXJlY3Rpb24gKGRldGVjdGVkIHZpYSB0aGUgYmFzaCBvciBQb3dlclNoZWxsIHRyZWUgc2l0dGVyIGdyYW1tYXIpXFxuLSBgc2VkYCBpbi1wbGFjZSBlZGl0aW5nIChgLWlgLCBgLUlgLCBgLS1pbi1wbGFjZWApXCIpLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5TaGVsbEludGVncmF0aW9uVGltZW91dF06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvblRpbWVvdXQuZGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZXMgdGhlIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciBzaGVsbCBpbnRlZ3JhdGlvbiB0byBiZSBkZXRlY3RlZCB3aGVuIHRoZSBydW4gaW4gdGVybWluYWwgdG9vbCBsYXVuY2hlcyBhIG5ldyB0ZXJtaW5hbC4gU2V0IHRvIGAwYCB0byBza2lwIHRoZSB3YWl0IGVudGlyZWx5LCB0aGUgZGVmYXVsdCB2YWx1ZSBgLTFgIHVzZXMgYSB2YXJpYWJsZSB3YWl0IHRpbWUgYmFzZWQgb24gdGhlIHZhbHVlIG9mIHswfSBhbmQgd2hldGhlciBpdCdzIGEgcmVtb3RlIHdpbmRvdy4gQSBsYXJnZSB2YWx1ZSBjYW4gYmUgdXNlZnVsIGlmIHlvdXIgc2hlbGwgc3RhcnRzIHZlcnkgc2xvd2x5LlwiLCBgXFxgIyR7VGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRtaW5pbXVtOiAtMSxcblx0XHRtYXhpbXVtOiA2MDAwMCxcblx0XHRkZWZhdWx0OiAtMSxcblx0XHRtYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3NoZWxsSW50ZWdyYXRpb25UaW1lb3V0LmRlcHJlY2F0ZWQnLCAnVXNlIHswfSBpbnN0ZWFkJywgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25UaW1lb3V0fSNcXGBgKVxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5JZGxlUG9sbEludGVydmFsXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpZGxlUG9sbEludGVydmFsLmRlc2NyaXB0aW9uJywgXCJDb25maWd1cmVzIHRoZSBpZGxlIHBvbGwgaW50ZXJ2YWwgaW4gbWlsbGlzZWNvbmRzIHVzZWQgYnkgdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sIHRvIGRldGVjdCB3aGVuIGNvbW1hbmRzIGhhdmUgZmluaXNoZWQgZXhlY3V0aW5nLiBMb3dlciB2YWx1ZXMgbWFrZSBjb21tYW5kIGRldGVjdGlvbiBmYXN0ZXIgYnV0IG1heSBjYXVzZSBmYWxzZSBwb3NpdGl2ZXMgb24gc2xvdyBzeXN0ZW1zLiBUaGlzIHByaW1hcmlseSBhZmZlY3RzIHRlcm1pbmFscyB3aXRob3V0IHNoZWxsIGludGVncmF0aW9uIHdoZXJlIGlkbGUgZGV0ZWN0aW9uIGlzIHVzZWQgaW5zdGVhZCBvZiBzaGVsbCBpbnRlZ3JhdGlvbiBldmVudHMuXCIpLFxuXHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRtaW5pbXVtOiA1MCxcblx0XHRtYXhpbXVtOiAxMDAwMCxcblx0XHRkZWZhdWx0OiAxMDAwLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5UZXJtaW5hbFByb2ZpbGVMaW51eF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGUubGludXgnLCBcIlRoZSB0ZXJtaW5hbCBwcm9maWxlIHRvIHVzZSBvbiBMaW51eCBmb3IgY2hhdCBhZ2VudCdzIHJ1biBpbiB0ZXJtaW5hbCB0b29sLlwiKSxcblx0XHR0eXBlOiBbJ29iamVjdCcsICdudWxsJ10sXG5cdFx0ZGVmYXVsdDogbnVsbCxcblx0XHQnYW55T2YnOiBbXG5cdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0dGVybWluYWxDaGF0QWdlbnRQcm9maWxlU2NoZW1hXG5cdFx0XSxcblx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdHtcblx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdHBhdGg6ICckezF9J1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5UZXJtaW5hbFByb2ZpbGVNYWNPc106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGUub3N4JywgXCJUaGUgdGVybWluYWwgcHJvZmlsZSB0byB1c2Ugb24gbWFjT1MgZm9yIGNoYXQgYWdlbnQncyBydW4gaW4gdGVybWluYWwgdG9vbC5cIiksXG5cdFx0dHlwZTogWydvYmplY3QnLCAnbnVsbCddLFxuXHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0J2FueU9mJzogW1xuXHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdHRlcm1pbmFsQ2hhdEFnZW50UHJvZmlsZVNjaGVtYVxuXHRcdF0sXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRwYXRoOiAnJHsxfSdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlV2luZG93c106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGUud2luZG93cycsIFwiVGhlIHRlcm1pbmFsIHByb2ZpbGUgdG8gdXNlIG9uIFdpbmRvd3MgZm9yIGNoYXQgYWdlbnQncyBydW4gaW4gdGVybWluYWwgdG9vbC5cIiksXG5cdFx0dHlwZTogWydvYmplY3QnLCAnbnVsbCddLFxuXHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0J2FueU9mJzogW1xuXHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdHRlcm1pbmFsQ2hhdEFnZW50UHJvZmlsZVNjaGVtYVxuXHRcdF0sXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRwYXRoOiAnJHsxfSdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuT3V0cHV0TG9jYXRpb25dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ291dHB1dExvY2F0aW9uLmRlc2NyaXB0aW9uJywgXCJXaGVyZSB0byBzaG93IHRoZSBvdXRwdXQgZnJvbSB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wuXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsndGVybWluYWwnLCAnY2hhdCddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdvdXRwdXRMb2NhdGlvbi50ZXJtaW5hbCcsIFwiUmV2ZWFsIHRoZSB0ZXJtaW5hbCBpbiB0aGUgcGFuZWwgb3IgZWRpdG9yIGluIGFkZGl0aW9uIHRvIGNoYXQuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ291dHB1dExvY2F0aW9uLmNoYXQnLCBcIlJldmVhbCB0aGUgdGVybWluYWwgb3V0cHV0IHdpdGhpbiBjaGF0IG9ubHkuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2NoYXQnLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5lbmFibGVkU2V0dGluZycsIFwiQ29udHJvbHMgd2hldGhlciBhZ2VudCBtb2RlIHVzZXMgc2FuZGJveGluZyB0byByZXN0cmljdCB3aGF0IHRvb2xzIGNhbiBkby4gV2hlbiBlbmFibGVkLCB0b29scyBsaWtlIHRoZSB0ZXJtaW5hbCBhcmUgcnVuIGluIGEgc2FuZGJveGVkIGVudmlyb25tZW50IHRvIGxpbWl0IGFjY2VzcyB0byB0aGUgc3lzdGVtLiBVc2UgezB9IHRvIGFsbG93IGFsbCBuZXR3b3JrIGRvbWFpbnMuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrfSNcXGBgKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZiwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmVuYWJsZWRTZXR0aW5nLm9mZkRlc2NyaXB0aW9uJywgJ0Rpc2FibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scy4nKSxcblx0XHRcdGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub25EZXNjcmlwdGlvbicsICdFbmFibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scy4nKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRtb2RlOiAnYXV0bydcblx0XHR9LFxuXHRcdHBvbGljeToge1xuXHRcdFx0bmFtZTogJ0NoYXRBZ2VudFNhbmRib3hFbmFibGVkJyxcblx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlZ3JhdGVkVGVybWluYWwsXG5cdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGtleTogJ2FnZW50U2FuZGJveC5lbmFibGVkU2V0dGluZycsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYWdlbnQgbW9kZSB1c2VzIHNhbmRib3hpbmcgdG8gcmVzdHJpY3Qgd2hhdCB0b29scyBjYW4gZG8uIFdoZW4gZW5hYmxlZCwgdG9vbHMgbGlrZSB0aGUgdGVybWluYWwgYXJlIHJ1biBpbiBhIHNhbmRib3hlZCBlbnZpcm9ubWVudCB0byBsaW1pdCBhY2Nlc3MgdG8gdGhlIHN5c3RlbS4gVXNlIHswfSB0byBhbGxvdyBhbGwgbmV0d29yayBkb21haW5zLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya30jXFxgYCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRrZXk6ICdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub2ZmRGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub2ZmRGVzY3JpcHRpb24nLCAnRGlzYWJsZSBzYW5kYm94aW5nIGZvciBhZ2VudCBtb2RlIHRvb2xzLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0a2V5OiAnYWdlbnRTYW5kYm94LmVuYWJsZWRTZXR0aW5nLm9uRGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub25EZXNjcmlwdGlvbicsICdFbmFibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scy4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NFbmFibGVkXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3gud2luZG93c0VuYWJsZWRTZXR0aW5nJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdXNlcyBzYW5kYm94aW5nIG9uIFdpbmRvd3MuIFVzZSB7MH0gdG8gYWxsb3cgYWxsIG5ldHdvcmsgZG9tYWlucy5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmt9I1xcYGApLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFtBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT25dLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdhZ2VudFNhbmRib3gud2luZG93c0VuYWJsZWRTZXR0aW5nLm9mZkRlc2NyaXB0aW9uJywgJ0Rpc2FibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scyBvbiBXaW5kb3dzLicpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50U2FuZGJveC53aW5kb3dzRW5hYmxlZFNldHRpbmcub25EZXNjcmlwdGlvbicsICdFbmFibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scyBvbiBXaW5kb3dzLicpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmFsbG93TmV0d29yaycsIFwiV2hlbiB7MH0gaXMgZW5hYmxlZCwgY29udHJvbHMgd2hldGhlciB0byBhbGxvdyBhbGwgbmV0d29yayBkb21haW5zIGluIHRoZSBzYW5kYm94LiBXaGVuIGVuYWJsZWQsIHRoZSBzYW5kYm94IHByZXNlcnZlcyBmaWxlIHN5c3RlbSByZXN0cmljdGlvbnMgd2hpbGUgcmVsYXhpbmcgYWxsIG5ldHdvcmsgcmVzdHJpY3Rpb25zLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHBvbGljeToge1xuXHRcdFx0bmFtZTogJ0NoYXRBZ2VudFNhbmRib3hBbGxvd05ldHdvcmsnLFxuXHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVncmF0ZWRUZXJtaW5hbCxcblx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0a2V5OiAnYWdlbnRTYW5kYm94LmFsbG93TmV0d29yaycsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guYWxsb3dOZXR3b3JrJywgXCJXaGVuIHswfSBpcyBlbmFibGVkLCBjb250cm9scyB3aGV0aGVyIHRvIGFsbG93IGFsbCBuZXR3b3JrIGRvbWFpbnMgaW4gdGhlIHNhbmRib3guIFdoZW4gZW5hYmxlZCwgdGhlIHNhbmRib3ggcHJlc2VydmVzIGZpbGUgc3lzdGVtIHJlc3RyaWN0aW9ucyB3aGlsZSByZWxheGluZyBhbGwgbmV0d29yayByZXN0cmljdGlvbnMuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3guYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdGVybWluYWwgY29tbWFuZHMgY2FuIHJ1biBvdXRzaWRlIHRoZSBzYW5kYm94IGFmdGVyIHVzZXIgY29uZmlybWF0aW9uIHdoZW4gYSBzYW5kYm94ZWQgY29tbWFuZCBmYWlscyBvciB3aGVuIHNhbmRib3ggcmVzdHJpY3Rpb25zIHdvdWxkIGJsb2NrIHRoZSBjb21tYW5kLiBUaGlzIGFwcGxpZXMgb25seSB3aGVuIHswfSBpcyBlbmFibGVkLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0cG9saWN5OiB7XG5cdFx0XHRuYW1lOiAnQ2hhdEFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcycsXG5cdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZWdyYXRlZFRlcm1pbmFsLFxuXHRcdFx0bWluaW11bVZlcnNpb246ICcxLjExNicsXG5cdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRrZXk6ICdhZ2VudFNhbmRib3guYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzJyxcblx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYWdlbnQgbW9kZSB0ZXJtaW5hbCBjb21tYW5kcyBjYW4gcnVuIG91dHNpZGUgdGhlIHNhbmRib3ggYWZ0ZXIgdXNlciBjb25maXJtYXRpb24gd2hlbiBhIHNhbmRib3hlZCBjb21tYW5kIGZhaWxzIG9yIHdoZW4gc2FuZGJveCByZXN0cmljdGlvbnMgd291bGQgYmxvY2sgdGhlIGNvbW1hbmQuIFRoaXMgYXBwbGllcyBvbmx5IHdoZW4gezB9IGlzIGVuYWJsZWQuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHNdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cycsIFwiQ29udHJvbHMgd2hldGhlciBhZ2VudCBtb2RlIHRlcm1pbmFsIGNvbW1hbmRzIGNhbiByZXRyeSBpbiB0aGUgc2FuZGJveCB3aXRoIHVucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBhZnRlciB1c2VyIGNvbmZpcm1hdGlvbi4gVGhpcyBhcHBsaWVzIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZCBhbmQgcHJlc2VydmVzIGZpbGUgc3lzdGVtIHNhbmRib3hpbmcgd2hpbGUgcmVsYXhpbmcgbmV0d29yayByZXN0cmljdGlvbnMgZm9yIGFuIGFwcHJvdmVkIGNvbW1hbmQuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93QXV0b0FwcHJvdmVdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5hbGxvd0F1dG9BcHByb3ZlJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdGVybWluYWwgY29tbWFuZHMgdGhhdCBydW4gaW5zaWRlIHRoZSBzYW5kYm94IGFyZSBhdXRvLWFwcHJvdmVkLiBXaGVuIGRpc2FibGVkLCB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wgdXNlcyB0aGUgZXhpc3RpbmcgYXBwcm92YWwgZmxvdy4gVGhpcyBhcHBsaWVzIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZC5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHBvbGljeToge1xuXHRcdFx0bmFtZTogJ0NoYXRBZ2VudFNhbmRib3hBbGxvd0F1dG9BcHByb3ZlJyxcblx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlZ3JhdGVkVGVybWluYWwsXG5cdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGtleTogJ2FnZW50U2FuZGJveC5hbGxvd0F1dG9BcHByb3ZlJyxcblx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5hbGxvd0F1dG9BcHByb3ZlJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdGVybWluYWwgY29tbWFuZHMgdGhhdCBydW4gaW5zaWRlIHRoZSBzYW5kYm94IGFyZSBhdXRvLWFwcHJvdmVkLiBXaGVuIGRpc2FibGVkLCB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wgdXNlcyB0aGUgZXhpc3RpbmcgYXBwcm92YWwgZmxvdy4gVGhpcyBhcHBsaWVzIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZC5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3gubGludXhGaWxlU3lzdGVtU2V0dGluZycsIFwiTm90ZTogdGhpcyBzZXR0aW5nIGlzIGFwcGxpY2FibGUgb25seSB3aGVuIHswfSBpcyBlbmFibGVkLiBDb250cm9scyBmaWxlIHN5c3RlbSBhY2Nlc3MgaW4gc2FuZGJveCBvbiBMaW51eC4gUGF0aHMgZG8gbm90IHN1cHBvcnQgZ2xvYiBwYXR0ZXJucywgb25seSBsaXRlcmFsIHBhdGhzIChleDogLi9zcmMvLCB+Ly5zc2gsIC5lbnYpLiAqKmJ1YmJsZXdyYXAqKiBhbmQgKipzb2NhdCoqIHNob3VsZCBiZSBpbnN0YWxsZWQgZm9yIHRoaXMgc2V0dGluZyB0byB3b3JrLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGRlbnlSZWFkOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmxpbnV4RmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIGRlbnkgcmVhZCBhY2Nlc3MuIExlYXZlIGVtcHR5IHRvIGFsbG93IHJlYWRpbmcgYWxsIHBhdGhzLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1JlYWQ6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3gubGludXhGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIHJlLWFsbG93IHJlYWQgYWNjZXNzIHdpdGhpbiBkZW5pZWQgcmVnaW9ucy4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGRlbnlSZWFkLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1dyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmxpbnV4RmlsZVN5c3RlbVNldHRpbmcuYWxsb3dXcml0ZScsIFwiQXJyYXkgb2YgYWRkaXRpb25hbCBwYXRocyB0byBhbGxvdyB3cml0ZSBhY2Nlc3MuIExlYXZlIGVtcHR5IHRvIGRpc2FsbG93IHdyaXRlcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgZm9sZGVycywgd29ya3NwYWNlIHN0b3JhZ2UgZm9sZGVyLCBhbmQgc2FuZGJveCB0ZW1wIGRpcmVjdG9yeS5cIiksXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0XHR9LFxuXHRcdFx0ZGVueVdyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmxpbnV4RmlsZVN5c3RlbVNldHRpbmcuZGVueVdyaXRlJywgXCJBcnJheSBvZiBwYXRocyB0byBkZW55IHdyaXRlIGFjY2VzcyB3aXRoaW4gYWxsb3dlZCBwYXRocyAodGFrZXMgcHJlY2VkZW5jZSBvdmVyIGFsbG93V3JpdGUpLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH1cblx0XHR9LFxuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdGRlbnlSZWFkOiBbXSxcblx0XHRcdGFsbG93UmVhZDogW10sXG5cdFx0XHRhbGxvd1dyaXRlOiBbXSxcblx0XHRcdGRlbnlXcml0ZTogW11cblx0XHR9LFxuXHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkFnZW50U2FuZGJveE1hY0ZpbGVTeXN0ZW1dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZycsIFwiTm90ZTogdGhpcyBzZXR0aW5nIGlzIGFwcGxpY2FibGUgb25seSB3aGVuIHswfSBpcyBlbmFibGVkLiBDb250cm9scyBmaWxlIHN5c3RlbSBhY2Nlc3MgaW4gc2FuZGJveCBvbiBtYWNPUy4gUGF0aHMgYWxzbyBzdXBwb3J0IGdpdC1zdHlsZSBnbG9iIHBhdHRlcm5zKGV4OiAqLnRzLCAuL3NyYywgLi9zcmMvKiovKi50cywgZmlsZT8udHh0KS5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRkZW55UmVhZDoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55UmVhZCcsIFwiQXJyYXkgb2YgcGF0aHMgdG8gZGVueSByZWFkIGFjY2Vzcy4gTGVhdmUgZW1wdHkgdG8gYWxsb3cgcmVhZGluZyBhbGwgcGF0aHMuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fSxcblx0XHRcdGFsbG93UmVhZDoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIHJlLWFsbG93IHJlYWQgYWNjZXNzIHdpdGhpbiBkZW5pZWQgcmVnaW9ucy4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGRlbnlSZWFkLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1dyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94Lm1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93V3JpdGUnLCBcIkFycmF5IG9mIGFkZGl0aW9uYWwgcGF0aHMgdG8gYWxsb3cgd3JpdGUgYWNjZXNzLiBMZWF2ZSBlbXB0eSB0byBkaXNhbGxvdyB3cml0ZXMgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGZvbGRlcnMsIHdvcmtzcGFjZSBzdG9yYWdlIGZvbGRlciwgYW5kIHNhbmRib3ggdGVtcCBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fSxcblx0XHRcdGRlbnlXcml0ZToge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55V3JpdGUnLCBcIkFycmF5IG9mIHBhdGhzIHRvIGRlbnkgd3JpdGUgYWNjZXNzIHdpdGhpbiBhbGxvd2VkIHBhdGhzICh0YWtlcyBwcmVjZWRlbmNlIG92ZXIgYWxsb3dXcml0ZSkuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZGVmYXVsdDoge1xuXHRcdFx0ZGVueVJlYWQ6IFtdLFxuXHRcdFx0YWxsb3dSZWFkOiBbXSxcblx0XHRcdGFsbG93V3JpdGU6IFtdLFxuXHRcdFx0ZGVueVdyaXRlOiBbXVxuXHRcdH0sXG5cdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0ZpbGVTeXN0ZW1dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC53aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcnLCBcIk5vdGU6IHRoaXMgc2V0dGluZyBpcyBhcHBsaWNhYmxlIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZC4gQ29udHJvbHMgZmlsZSBzeXN0ZW0gYWNjZXNzIGluIHNhbmRib3ggb24gV2luZG93cy4gUGF0aHMgZG8gbm90IHN1cHBvcnQgZ2xvYiBwYXR0ZXJucywgb25seSBsaXRlcmFsIHBhdGhzIChleDogQzpcXFxcc3JjLCBDOlxcXFxVc2Vyc1xcXFxtZVxcXFwuc3NoLCAuZW52KS5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRkZW55UmVhZDoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC53aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIGRlbnkgYWNjZXNzLiBMZWF2ZSBlbXB0eSB0byBhbGxvdyByZWFkaW5nIGFsbCBwYXRocy5cIiksXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0XHR9LFxuXHRcdFx0YWxsb3dSZWFkOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LndpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQnLCBcIkFycmF5IG9mIGFkZGl0aW9uYWwgcGF0aHMgdG8gYWxsb3cgcmVhZC1vbmx5IGFjY2Vzcy4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGRlbnlSZWFkLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1dyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LndpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1dyaXRlJywgXCJBcnJheSBvZiBhZGRpdGlvbmFsIHBhdGhzIHRvIGFsbG93IHJlYWQvd3JpdGUgYWNjZXNzLiBMZWF2ZSBlbXB0eSB0byBkaXNhbGxvdyB3cml0ZXMgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGZvbGRlcnMsIHdvcmtzcGFjZSBzdG9yYWdlIGZvbGRlciwgYW5kIHNhbmRib3ggdGVtcCBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZGVmYXVsdDoge1xuXHRcdFx0ZGVueVJlYWQ6IFtdLFxuXHRcdFx0YWxsb3dSZWFkOiBbXSxcblx0XHRcdGFsbG93V3JpdGU6IFtdXG5cdFx0fSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NTY2hlbWFWZXJzaW9uXToge1xuXHRcdC8vIEludGVudGlvbmFsbHkgYXZhaWxhYmxlIG9ubHkgdG8gY2FsbGVycyB0aGF0IGV4cGxpY2l0bHkgc2V0IGl0IGluIHNldHRpbmdzLmpzb24uXG5cdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkFnZW50U2FuZGJveEFkdmFuY2VkUnVudGltZV06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LnJ1bnRpbWVTZXR0aW5nJywgXCJOb3RlOiB0aGlzIHNldHRpbmcgaXMgYXBwbGljYWJsZSBvbmx5IHdoZW4gezB9IGlzIGVuYWJsZWQuIEtleS92YWx1ZSBwYWlycyBhcmUgcGFzc2VkIHRocm91Z2ggdG8gdGhlIHJvb3Qgb2YgdGhlIHNhbmRib3ggcnVudGltZSBjb25maWd1cmF0aW9uLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdGVuYWJsZVdlYWtlck5lc3RlZFNhbmRib3g6IGZhbHNlXG5cdFx0fSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5QcmV2ZW50U2hlbGxIaXN0b3J5XToge1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IFtcblx0XHRcdGxvY2FsaXplKCdwcmV2ZW50U2hlbGxIaXN0b3J5LmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRvIGV4Y2x1ZGUgY29tbWFuZHMgcnVuIGJ5IHRoZSB0ZXJtaW5hbCB0b29sIGZyb20gdGhlIHNoZWxsIGhpc3RvcnkuIFNlZSBiZWxvdyBmb3IgdGhlIHN1cHBvcnRlZCBzaGVsbHMgYW5kIHRoZSBtZXRob2QgdXNlZCBmb3IgZWFjaDpcIiksXG5cdFx0XHRgLSBcXGBiYXNoXFxgOiAke2xvY2FsaXplKCdwcmV2ZW50U2hlbGxIaXN0b3J5LmRlc2NyaXB0aW9uLmJhc2gnLCBcIlNldHMgYEhJU1RDT05UUk9MPWlnbm9yZXNwYWNlYCBhbmQgcHJlcGVuZHMgdGhlIGNvbW1hbmQgd2l0aCBzcGFjZVwiKX1gLFxuXHRcdFx0YC0gXFxgenNoXFxgOiAke2xvY2FsaXplKCdwcmV2ZW50U2hlbGxIaXN0b3J5LmRlc2NyaXB0aW9uLnpzaCcsIFwiU2V0cyBgSElTVF9JR05PUkVfU1BBQ0VgIG9wdGlvbiBhbmQgcHJlcGVuZHMgdGhlIGNvbW1hbmQgd2l0aCBzcGFjZVwiKX1gLFxuXHRcdFx0YC0gXFxgZmlzaFxcYDogJHtsb2NhbGl6ZSgncHJldmVudFNoZWxsSGlzdG9yeS5kZXNjcmlwdGlvbi5maXNoJywgXCJTZXRzIGBmaXNoX3ByaXZhdGVfbW9kZWAgdG8gcHJldmVudCBhbnkgY29tbWFuZCBmcm9tIGVudGVyaW5nIGhpc3RvcnlcIil9YCxcblx0XHRcdGAtIFxcYHB3c2hcXGA6ICR7bG9jYWxpemUoJ3ByZXZlbnRTaGVsbEhpc3RvcnkuZGVzY3JpcHRpb24ucHdzaCcsIFwiU2V0cyBhIGN1c3RvbSBoaXN0b3J5IGhhbmRsZXIgdmlhIFBTUmVhZExpbmUncyBgQWRkVG9IaXN0b3J5SGFuZGxlcmAgdG8gcHJldmVudCBhbnkgY29tbWFuZCBmcm9tIGVudGVyaW5nIGhpc3RvcnlcIil9YCxcblx0XHRdLmpvaW4oJ1xcbicpLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmZvcmNlVGltZW91dEZyb21Nb2RlbF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZW5mb3JjZVRpbWVvdXRGcm9tTW9kZWwuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdG8gZW5mb3JjZSB0aGUgdGltZW91dCB2YWx1ZSBwcm92aWRlZCBieSB0aGUgbW9kZWwgaW4gdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sLiBXaGVuIGVuYWJsZWQsIGlmIHRoZSBtb2RlbCBwcm92aWRlcyBhIHRpbWVvdXQgcGFyYW1ldGVyLCB0aGUgdG9vbCB3aWxsIHN0b3AgdHJhY2tpbmcgdGhlIGNvbW1hbmQgYWZ0ZXIgdGhhdCBkdXJhdGlvbiBhbmQgcmV0dXJuIHRoZSBvdXRwdXQgY29sbGVjdGVkIHNvIGZhci5cIiksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLklkbGVTaWxlbmNlVGltZW91dE1zXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogREVGQVVMVF9JRExFX1NJTEVOQ0VfVElNRU9VVF9NUyxcblx0XHRtaW5pbXVtOiAwLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaWRsZVNpbGVuY2VUaW1lb3V0TXMuZGVzY3JpcHRpb24nLCBcIk51bWJlciBvZiBtaWxsaXNlY29uZHMgdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sIHdpbGwgd2FpdCBmb3IgbmV3IG91dHB1dCBmcm9tIGEgc3luY2hyb25vdXMgY29tbWFuZCBiZWZvcmUgbW92aW5nIGl0IHRvIGEgYmFja2dyb3VuZCB0ZXJtaW5hbCBhbmQgcmV0dXJuaW5nIHdoYXQgd2FzIGNvbGxlY3RlZCBzbyBmYXIuIFRoZSBwcm9jZXNzIGlzIG5vdCBraWxsZWQgXHUyMDE0IHRoZSB0b29sIHJldHVybnMgdGhlIHRlcm1pbmFsIElEIHNvIHRoZSBtb2RlbCBjYW4gcG9sbCwgc2VuZCBpbnB1dCwgb3Iga2lsbCBpdC4gU2V0IHRvIHswfSB0byBkaXNhYmxlLlwiLCAnYDBgJyksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRldGFjaEJhY2tncm91bmRQcm9jZXNzZXNdOiB7XG5cdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RldGFjaEJhY2tncm91bmRQcm9jZXNzZXMuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdG8gZGV0YWNoIHBlcnNpc3RlbnQgdGVybWluYWwgcHJvY2Vzc2VzIHNvIHRoZXkgc3Vydml2ZSB3aGVuIFZTIENvZGUgZXhpdHMuIFdoZW4gZW5hYmxlZCwgY29tbWFuZHMgc3RhcnRlZCB3aXRoIGBtb2RlOiBcXFwiYXN5bmNcXFwiYCAobGVnYWN5OiBgaXNCYWNrZ3JvdW5kOiB0cnVlYCkgYXJlIHdyYXBwZWQgd2l0aCBgbm9odXBgIChQT1NJWCkgb3IgYFN0YXJ0LVByb2Nlc3NgIChXaW5kb3dzKSBzbyB0aGUgcHJvY2VzcyBjb250aW51ZXMgcnVubmluZyBhZnRlciB0aGUgdGVybWluYWwgaXMgZGlzcG9zZWQuXCIpLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5CYWNrZ3JvdW5kTm90aWZpY2F0aW9uc106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZGVwcmVjYXRlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2JhY2tncm91bmROb3RpZmljYXRpb25zLmRlcHJlY2F0ZWQnLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkLiBUZXJtaW5hbCBjb21wbGV0aW9uIGFuZCBpbnB1dC1uZWVkZWQgbm90aWZpY2F0aW9ucyBhcmUgbm93IGFsd2F5cyBlbmFibGVkLlwiKSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYmFja2dyb3VuZE5vdGlmaWNhdGlvbnMuZGVzY3JpcHRpb24nLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkIGFuZCBubyBsb25nZXIgaGFzIGFueSBlZmZlY3QuIFRlcm1pbmFsIGNvbXBsZXRpb24gYW5kIGlucHV0LW5lZWRlZCBub3RpZmljYXRpb25zIGFyZSBub3cgYWx3YXlzIGVuYWJsZWQgZm9yIGFueSBjb21tYW5kIHRoYXQgY29udGludWVzIHJ1bm5pbmcgYWZ0ZXIgdGhlIHRvb2wgcmV0dXJucy5cIiksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhc106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdH0sXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ291dHB1dERlbHRhcy5kZXNjcmlwdGlvbicsIFwiV2hlbiBlbmFibGVkLCByZXBlYXRlZCBnZXQgdGVybWluYWwgb3V0cHV0IHRvb2wgY2FsbHMgcmV0dXJuIG9ubHkgb3V0cHV0IGFkZGVkIHNpbmNlIHRoZSBwcmV2aW91cyBwb2xsIGZvciB0aGUgc2FtZSB0ZXJtaW5hbCBleGVjdXRpb24sIG9yIGEgc2hvcnQgdW5jaGFuZ2VkLW91dHB1dCBtZXNzYWdlIHdoZW4gdGhlcmUgaXMgbm8gbmV3IG91dHB1dC5cIiksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dENvbXBhY3Rpb25dOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRtb2RlOiAnYXV0bydcblx0XHR9LFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdvdXRwdXRDb21wYWN0aW9uLmRlc2NyaXB0aW9uJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBvdXRwdXQgb2YgY29tbWFuZHMgcnVuIGJ5IHRoZSBydW4gaW4gdGVybWluYWwgdG9vbCBpcyBjb21wYWN0ZWQgYmVmb3JlIGJlaW5nIHJldHVybmVkIHRvIHRoZSBtb2RlbCwgcmVkdWNpbmcgdGhlIG51bWJlciBvZiB0b2tlbnMgc3BlbnQgb24gbm9pc3kgb3V0cHV0IChmb3IgZXhhbXBsZSBwcm9ncmVzcyBiYXJzIG9yIHJlcGVhdGVkIGxvZyBsaW5lcykgd2hpbGUgcHJlc2VydmluZyB0aGUgaW1wb3J0YW50IGluZm9ybWF0aW9uLlwiKSxcblx0fVxufTtcblxuZm9yIChjb25zdCBpZCBvZiBbXG5cdFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRGVwcmVjYXRlZEF1dG9BcHByb3ZlMSxcblx0VGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5EZXByZWNhdGVkQXV0b0FwcHJvdmUyLFxuXHRUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRlcHJlY2F0ZWRBdXRvQXBwcm92ZTMsXG5cdFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRGVwcmVjYXRlZEF1dG9BcHByb3ZlNCxcblx0VGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5EZXByZWNhdGVkQXV0b0FwcHJvdmVDb21wYXRpYmxlLFxuXSkge1xuXHR0ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbltpZF0gPSB7XG5cdFx0ZGVwcmVjYXRlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlcHJlY2F0ZWQnLCAnVXNlIHswfSBpbnN0ZWFkJywgYFxcYCMke1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmV9I1xcYGApXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDBCQUEwQiw2QkFBNkI7QUFDaEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxzQkFBc0I7QUFNeEIsTUFBTSxrQ0FBa0M7QUFFeEMsSUFBVyxrQ0FBWCxrQkFBV0EscUNBQVg7QUFDTixFQUFBQSxpQ0FBQSx1QkFBb0I7QUFDcEIsRUFBQUEsaUNBQUEsaUJBQWM7QUFDZCxFQUFBQSxpQ0FBQSxvQ0FBaUM7QUFDakMsRUFBQUEsaUNBQUEsbUNBQWdDO0FBQ2hDLEVBQUFBLGlDQUFBLDZCQUEwQjtBQUMxQixFQUFBQSxpQ0FBQSw2QkFBMEI7QUFDMUIsRUFBQUEsaUNBQUEsb0JBQWlCO0FBQ2pCLEVBQUFBLGlDQUFBLGlDQUE4QjtBQUM5QixFQUFBQSxpQ0FBQSwrQkFBNEI7QUFDNUIsRUFBQUEsaUNBQUEsbUNBQWdDO0FBQ2hDLEVBQUFBLGlDQUFB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QUEsSUFDTixTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3JCLFlBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxJQUNQO0FBQUEsSUFDQSxxQkFBcUIsU0FBUyxvQ0FBb0Msa1VBQTZULEtBQUs7QUFBQSxFQUNyWTtBQUFBLEVBQ0EsQ0FBQywrRUFBeUQsR0FBRztBQUFBLElBQzVELFVBQVU7QUFBQSxJQUNWLFlBQVk7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxJQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDckIscUJBQXFCLFNBQVMseUNBQXlDLHVTQUF5UztBQUFBLEVBQ2pYO0FBQUEsRUFDQSxDQUFDLDJFQUF1RCxHQUFHO0FBQUEsSUFDMUQsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUNyQixZQUFZO0FBQUEsSUFDWiw0QkFBNEIsU0FBUyxzQ0FBc0Msd0dBQXdHO0FBQUEsSUFDbkwscUJBQXFCLFNBQVMsdUNBQXVDLG1NQUFtTTtBQUFBLEVBQ3pRO0FBQUEsRUFDQSxDQUFDLHFEQUE0QyxHQUFHO0FBQUEsSUFDL0MsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUNyQixZQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EscUJBQXFCLFNBQVMsNEJBQTRCLDBNQUEwTTtBQUFBLEVBQ3JRO0FBQUEsRUFDQSxDQUFDLDZEQUFnRCxHQUFHO0FBQUEsSUFDbkQsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUNyQixZQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EscUJBQXFCLFNBQVMsZ0NBQWdDLHlRQUF5UTtBQUFBLEVBQ3hVO0FBQ0Q7QUFFQSxXQUFXLE1BQU07QUFBQSxFQUNoQjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRCxHQUFHO0FBQ0Ysc0NBQW9DLEVBQUUsSUFBSTtBQUFBLElBQ3pDLFlBQVk7QUFBQSxJQUNaLDRCQUE0QixTQUFTLDBCQUEwQixtQkFBbUIsTUFBTSxtREFBMkMsS0FBSztBQUFBLEVBQ3pJO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQiXQp9Cg==
