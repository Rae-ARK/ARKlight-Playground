import minimist from "minimist";
import { isWindows } from "../../../base/common/platform.js";
import { localize } from "../../../nls.js";
const helpCategories = {
  o: localize("optionsUpperCase", "Options"),
  e: localize("extensionsManagement", "Extensions Management"),
  t: localize("troubleshooting", "Troubleshooting"),
  m: localize("mcp", "Model Context Protocol")
};
const NATIVE_CLI_COMMANDS = ["tunnel", "serve-web", "agent"];
const OPTIONS = {
  "chat": {
    type: "subcommand",
    description: "Pass in a prompt to run in a chat session in the current working directory.",
    options: {
      "_": { type: "string[]", description: localize("prompt", "The prompt to use as chat.") },
      "mode": { type: "string", cat: "o", alias: "m", args: "mode", description: localize("chatMode", "The mode to use for the chat session. Available options: 'ask', 'edit', 'agent', or the identifier of a custom mode. Defaults to 'agent'.") },
      "add-file": { type: "string[]", cat: "o", alias: "a", args: "path", description: localize("addFile", "Add files as context to the chat session.") },
      "maximize": { type: "boolean", cat: "o", description: localize("chatMaximize", "Maximize the chat session view.") },
      "reuse-window": { type: "boolean", cat: "o", alias: "r", description: localize("reuseWindowForChat", "Force to use the last active window for the chat session.") },
      "new-window": { type: "boolean", cat: "o", alias: "n", description: localize("newWindowForChat", "Force to open an empty window for the chat session.") },
      "profile": { type: "string", "cat": "o", args: "profileName", description: localize("profileName", "Opens the provided folder or workspace with the given profile and associates the profile with the workspace. If the profile does not exist, a new empty one is created.") },
      "help": { type: "boolean", alias: "h", description: localize("help", "Print usage.") }
    }
  },
  "serve-web": {
    type: "subcommand",
    description: "Run a server that displays the editor UI in browsers.",
    options: {
      "cli-data-dir": { type: "string", args: "dir", description: localize("cliDataDir", "Directory where CLI metadata should be stored.") },
      "disable-telemetry": { type: "boolean" },
      "telemetry-level": { type: "string" }
    }
  },
  "agent": {
    type: "subcommand",
    description: "Start and interact with AI agent hosts.",
    options: {
      "cli-data-dir": { type: "string", args: "dir", description: localize("cliDataDir", "Directory where CLI metadata should be stored.") },
      "disable-telemetry": { type: "boolean" },
      "telemetry-level": { type: "string" }
    }
  },
  "tunnel": {
    type: "subcommand",
    description: "Make the current machine accessible from vscode.dev or other machines through a secure tunnel.",
    options: {
      "cli-data-dir": { type: "string", args: "dir", description: localize("cliDataDir", "Directory where CLI metadata should be stored.") },
      "disable-telemetry": { type: "boolean" },
      "telemetry-level": { type: "string" },
      user: {
        type: "subcommand",
        options: {
          login: {
            type: "subcommand",
            options: {
              provider: { type: "string" },
              "access-token": { type: "string" }
            }
          }
        }
      }
    }
  },
  "diff": { type: "boolean", cat: "o", alias: "d", args: ["file", "file"], description: localize("diff", "Compare two files with each other.") },
  "merge": { type: "boolean", cat: "o", alias: "m", args: ["path1", "path2", "base", "result"], description: localize("merge", "Perform a three-way merge by providing paths for two modified versions of a file, the common origin of both modified versions and the output file to save merge results.") },
  "add": { type: "boolean", cat: "o", alias: "a", args: "folder", description: localize("add", "Add folder(s) to the last active window.") },
  "remove": { type: "boolean", cat: "o", args: "folder", description: localize("remove", "Remove folder(s) from the last active window.") },
  "goto": { type: "boolean", cat: "o", alias: "g", args: "file:line[:character]", description: localize("goto", "Open a file at the path on the specified line and character position.") },
  "new-window": { type: "boolean", cat: "o", alias: "n", description: localize("newWindow", "Force to open a new window.") },
  "reuse-window": { type: "boolean", cat: "o", alias: "r", description: localize("reuseWindow", "Force to open a file or folder in an already opened window.") },
  "agents": { type: "boolean", cat: "o", deprecates: ["sessions"], description: localize("agents", "Opens the agents window.") },
  "wait": { type: "boolean", cat: "o", alias: "w", description: localize("wait", "Wait for the files to be closed before returning.") },
  "waitMarkerFilePath": { type: "string" },
  "locale": { type: "string", cat: "o", args: "locale", description: localize("locale", "The locale to use (e.g. en-US or zh-TW).") },
  "user-data-dir": { type: "string", cat: "o", args: "dir", description: localize("userDataDir", "Specifies the directory that user data is kept in. Can be used to open multiple distinct instances of Code.") },
  "profile": { type: "string", "cat": "o", args: "profileName", description: localize("profileName", "Opens the provided folder or workspace with the given profile and associates the profile with the workspace. If the profile does not exist, a new empty one is created.") },
  "help": { type: "boolean", cat: "o", alias: "h", description: localize("help", "Print usage.") },
  "extensions-dir": { type: "string", deprecates: ["extensionHomePath"], cat: "e", args: "dir", description: localize("extensionHomePath", "Set the root path for extensions.") },
  "extensions-download-dir": { type: "string" },
  "builtin-extensions-dir": { type: "string" },
  "shared-data-dir": { type: "string" },
  "list-extensions": { type: "boolean", cat: "e", description: localize("listExtensions", "List the installed extensions.") },
  "agent-plugins-dir": { type: "string" },
  "agents-user-data-dir": { type: "string" },
  "agents-extensions-dir": { type: "string" },
  "show-versions": { type: "boolean", cat: "e", description: localize("showVersions", "Show versions of installed extensions, when using --list-extensions.") },
  "category": { type: "string", allowEmptyValue: true, cat: "e", description: localize("category", "Filters installed extensions by provided category, when using --list-extensions."), args: "category" },
  "install-extension": { type: "string[]", cat: "e", args: "ext-id | path", description: localize("installExtension", "Installs or updates an extension. The argument is either an extension id or a path to a VSIX. The identifier of an extension is '${publisher}.${name}'. Use '--force' argument to update to latest version. To install a specific version provide '@${version}'. For example: 'vscode.csharp@1.2.3'.") },
  "pre-release": { type: "boolean", cat: "e", description: localize("install prerelease", "Installs the pre-release version of the extension, when using --install-extension") },
  "uninstall-extension": { type: "string[]", cat: "e", args: "ext-id", description: localize("uninstallExtension", "Uninstalls an extension.") },
  "update-extensions": { type: "boolean", cat: "e", description: localize("updateExtensions", "Update the installed extensions.") },
  "enable-proposed-api": { type: "string[]", allowEmptyValue: true, cat: "e", args: "ext-id", description: localize("experimentalApis", "Enables proposed API features for extensions. Can receive one or more extension IDs to enable individually.") },
  "add-mcp": { type: "string[]", cat: "m", args: "json", description: localize("addMcp", `Adds a Model Context Protocol server definition to the user profile. Accepts JSON input in the form '{"name":"server-name","command":...}'`) },
  "version": { type: "boolean", cat: "t", alias: "v", description: localize("version", "Print version.") },
  "verbose": { type: "boolean", cat: "t", global: true, description: localize("verbose", "Print verbose output (implies --wait).") },
  "log": { type: "string[]", cat: "t", args: "level", global: true, description: localize("log", "Log level to use. Default is 'info'. Allowed values are 'critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'. You can also configure the log level of an extension by passing extension id and log level in the following format: '${publisher}.${name}:${logLevel}'. For example: 'vscode.csharp:trace'. Can receive one or more such entries.") },
  "status": { type: "boolean", alias: "s", cat: "t", description: localize("status", "Print process usage and diagnostics information.") },
  "prof-startup": { type: "boolean", cat: "t", description: localize("prof-startup", "Run CPU profiler during startup.") },
  "prof-append-timers": { type: "string" },
  "prof-duration-markers": { type: "string[]" },
  "prof-duration-markers-file": { type: "string" },
  "no-cached-data": { type: "boolean" },
  "prof-startup-prefix": { type: "string" },
  "prof-v8-extensions": { type: "boolean" },
  "disable-extensions": { type: "boolean", deprecates: ["disableExtensions"], cat: "t", description: localize("disableExtensions", "Disable all installed extensions. This option is not persisted and is effective only when the command opens a new window.") },
  "disable-extension": { type: "string[]", cat: "t", args: "ext-id", description: localize("disableExtension", "Disable the provided extension. This option is not persisted and is effective only when the command opens a new window.") },
  "sync": { type: "string", cat: "t", description: localize("turn sync", "Turn sync on or off."), args: ["on | off"] },
  "inspect-extensions": { type: "string", allowEmptyValue: true, deprecates: ["debugPluginHost"], args: "port", cat: "t", description: localize("inspect-extensions", "Allow debugging and profiling of extensions. Check the developer tools for the connection URI.") },
  "inspect-brk-extensions": { type: "string", allowEmptyValue: true, deprecates: ["debugBrkPluginHost"], args: "port", cat: "t", description: localize("inspect-brk-extensions", "Allow debugging and profiling of extensions with the extension host being paused after start. Check the developer tools for the connection URI.") },
  "disable-lcd-text": { type: "boolean", cat: "t", description: localize("disableLCDText", "Disable LCD font rendering.") },
  "disable-gpu": { type: "boolean", cat: "t", description: localize("disableGPU", "Disable GPU hardware acceleration.") },
  "disable-chromium-sandbox": { type: "boolean", cat: "t", description: localize("disableChromiumSandbox", "Use this option only when there is requirement to launch the application as sudo user on Linux or when running as an elevated user in an applocker environment on Windows.") },
  "sandbox": { type: "boolean" },
  "locate-shell-integration-path": { type: "string", cat: "t", args: ["shell"], description: localize("locateShellIntegrationPath", "Print the path to a terminal shell integration script. Allowed values are 'bash', 'pwsh', 'zsh' or 'fish'.") },
  "telemetry": { type: "boolean", cat: "t", description: localize("telemetry", "Shows all telemetry events which VS code collects.") },
  "remote": { type: "string", allowEmptyValue: true },
  "folder-uri": { type: "string[]", cat: "o", args: "uri" },
  "file-uri": { type: "string[]", cat: "o", args: "uri" },
  "locate-extension": { type: "string[]" },
  "extensionDevelopmentPath": { type: "string[]" },
  "extensionDevelopmentKind": { type: "string[]" },
  "extensionTestsPath": { type: "string" },
  "extensionEnvironment": { type: "string" },
  "debugId": { type: "string" },
  "debugRenderer": { type: "boolean" },
  "inspect-ptyhost": { type: "string", allowEmptyValue: true },
  "inspect-brk-ptyhost": { type: "string", allowEmptyValue: true },
  "inspect-agenthost": { type: "string", allowEmptyValue: true },
  "inspect-brk-agenthost": { type: "string", allowEmptyValue: true },
  "inspect-sharedprocess": { type: "string", allowEmptyValue: true },
  "inspect-brk-sharedprocess": { type: "string", allowEmptyValue: true },
  "export-default-configuration": { type: "string" },
  "export-policy-data": { type: "string", allowEmptyValue: true },
  "export-default-keybindings": { type: "string", allowEmptyValue: true },
  "install-source": { type: "string" },
  "enable-smoke-test-driver": { type: "boolean" },
  "skip-sessions-welcome": { type: "boolean" },
  "logExtensionHostCommunication": { type: "boolean" },
  "skip-release-notes": { type: "boolean" },
  "skip-welcome": { type: "boolean" },
  "disable-telemetry": { type: "boolean" },
  "disable-updates": { type: "boolean" },
  "share-secrets-with-agents-app": { type: "boolean" },
  "transient": { type: "boolean", cat: "t", description: localize("transient", "Run with temporary data and extension directories, as if launched for the first time.") },
  "use-inmemory-secretstorage": { type: "boolean", deprecates: ["disable-keytar"] },
  "password-store": { type: "string" },
  "disable-workspace-trust": { type: "boolean" },
  "disable-crash-reporter": { type: "boolean" },
  "crash-reporter-directory": { type: "string" },
  "crash-reporter-id": { type: "string" },
  "skip-add-to-recently-opened": { type: "boolean" },
  "open-url": { type: "boolean" },
  "file-write": { type: "boolean" },
  "file-chmod": { type: "boolean" },
  "install-builtin-extension": { type: "string[]" },
  "force": { type: "boolean" },
  "do-not-sync": { type: "boolean" },
  "do-not-include-pack-dependencies": { type: "boolean" },
  "trace": { type: "boolean" },
  "trace-memory-infra": { type: "boolean" },
  "trace-category-filter": { type: "string" },
  "trace-options": { type: "string" },
  "preserve-env": { type: "boolean" },
  "force-user-env": { type: "boolean" },
  "force-disable-user-env": { type: "boolean" },
  "open-devtools": { type: "boolean" },
  "disable-gpu-sandbox": { type: "boolean" },
  "logsPath": { type: "string" },
  "__enable-file-policy": { type: "boolean" },
  "editSessionId": { type: "string" },
  "continueOn": { type: "string" },
  "enable-coi": { type: "boolean" },
  "unresponsive-sample-interval": { type: "string" },
  "unresponsive-sample-period": { type: "string" },
  "enable-rdp-display-tracking": { type: "boolean" },
  "disable-layout-restore": { type: "boolean" },
  "disable-experiments": { type: "boolean" },
  // chromium flags
  "no-proxy-server": { type: "boolean" },
  // Minimist incorrectly parses keys that start with `--no`
  // https://github.com/substack/minimist/blob/aeb3e27dae0412de5c0494e9563a5f10c82cc7a9/index.js#L118-L121
  // If --no-sandbox is passed via cli wrapper it will be treated as --sandbox which is incorrect, we use
  // the alias here to make sure --no-sandbox is always respected.
  // For https://github.com/microsoft/vscode/issues/128279
  "no-sandbox": { type: "boolean", alias: "sandbox" },
  "proxy-server": { type: "string" },
  "proxy-bypass-list": { type: "string" },
  "proxy-pac-url": { type: "string" },
  "js-flags": { type: "string" },
  // chrome js flags
  "inspect": { type: "string", allowEmptyValue: true },
  "inspect-brk": { type: "string", allowEmptyValue: true },
  "nolazy": { type: "boolean" },
  // node inspect
  "force-device-scale-factor": { type: "string" },
  "force-renderer-accessibility": { type: "boolean" },
  "ignore-certificate-errors": { type: "boolean" },
  "allow-insecure-localhost": { type: "boolean" },
  "log-net-log": { type: "string" },
  "vmodule": { type: "string" },
  "_urls": { type: "string[]" },
  "disable-dev-shm-usage": { type: "boolean" },
  "profile-temp": { type: "boolean" },
  "ozone-platform": { type: "string" },
  "enable-tracing": { type: "string" },
  "trace-startup-format": { type: "string" },
  "trace-startup-file": { type: "string" },
  "trace-startup-duration": { type: "string" },
  "xdg-portal-required-version": { type: "string" },
  _: { type: "string[]" }
  // main arguments
};
const ignoringReporter = {
  onUnknownOption: () => {
  },
  onMultipleValues: () => {
  },
  onEmptyValue: () => {
  },
  onDeprecatedOption: () => {
  }
};
function parseArgs(args, options, errorReporter = ignoringReporter) {
  const firstPossibleCommand = args.find((a, i) => a.length > 0 && a[0] !== "-" && options.hasOwnProperty(a) && options[a].type === "subcommand");
  const alias = {};
  const stringOptions = ["_"];
  const booleanOptions = [];
  const globalOptions = {};
  let command = void 0;
  for (const optionId in options) {
    const o = options[optionId];
    if (o.type === "subcommand") {
      if (optionId === firstPossibleCommand) {
        command = o;
      }
    } else {
      if (o.alias) {
        alias[optionId] = o.alias;
      }
      if (o.type === "string" || o.type === "string[]") {
        stringOptions.push(optionId);
        if (o.deprecates) {
          stringOptions.push(...o.deprecates);
        }
      } else if (o.type === "boolean") {
        booleanOptions.push(optionId);
        if (o.deprecates) {
          booleanOptions.push(...o.deprecates);
        }
      }
      if (o.global) {
        globalOptions[optionId] = o;
      }
    }
  }
  if (command && firstPossibleCommand) {
    const options2 = globalOptions;
    for (const optionId in command.options) {
      options2[optionId] = command.options[optionId];
    }
    const newArgs = args.filter((a) => a !== firstPossibleCommand);
    const reporter = errorReporter.getSubcommandReporter ? errorReporter.getSubcommandReporter(firstPossibleCommand) : void 0;
    const subcommandOptions = parseArgs(newArgs, options2, reporter);
    return {
      [firstPossibleCommand]: subcommandOptions,
      _: []
    };
  }
  const parsedArgs = minimist(args, { string: stringOptions, boolean: booleanOptions, alias });
  const cleanedArgs = {};
  const remainingArgs = parsedArgs;
  cleanedArgs._ = parsedArgs._.map((arg) => String(arg)).filter((arg) => arg.length > 0);
  delete remainingArgs._;
  for (const optionId in options) {
    const o = options[optionId];
    if (o.type === "subcommand") {
      continue;
    }
    if (o.alias) {
      delete remainingArgs[o.alias];
    }
    let val = remainingArgs[optionId];
    if (o.deprecates) {
      for (const deprecatedId of o.deprecates) {
        if (remainingArgs.hasOwnProperty(deprecatedId)) {
          if (!val) {
            val = remainingArgs[deprecatedId];
            if (val) {
              errorReporter.onDeprecatedOption(deprecatedId, o.deprecationMessage || localize("deprecated.useInstead", "Use {0} instead.", optionId));
            }
          }
          delete remainingArgs[deprecatedId];
        }
      }
    }
    if (typeof val !== "undefined") {
      if (o.type === "string[]") {
        if (!Array.isArray(val)) {
          val = [val];
        }
        if (!o.allowEmptyValue) {
          const sanitized = val.filter((v) => v.length > 0);
          if (sanitized.length !== val.length) {
            errorReporter.onEmptyValue(optionId);
            val = sanitized.length > 0 ? sanitized : void 0;
          }
        }
      } else if (o.type === "string") {
        if (Array.isArray(val)) {
          val = val.pop();
          errorReporter.onMultipleValues(optionId, val);
        } else if (!val && !o.allowEmptyValue) {
          errorReporter.onEmptyValue(optionId);
          val = void 0;
        }
      }
      cleanedArgs[optionId] = val;
      if (o.deprecationMessage) {
        errorReporter.onDeprecatedOption(optionId, o.deprecationMessage);
      }
    }
    delete remainingArgs[optionId];
  }
  for (const key in remainingArgs) {
    errorReporter.onUnknownOption(key);
  }
  return cleanedArgs;
}
function formatUsage(optionId, option) {
  let args = "";
  if (option.args) {
    if (Array.isArray(option.args)) {
      args = ` <${option.args.join("> <")}>`;
    } else {
      args = ` <${option.args}>`;
    }
  }
  if (option.alias) {
    return `-${option.alias} --${optionId}${args}`;
  }
  return `--${optionId}${args}`;
}
function formatOptions(options, columns) {
  const usageTexts = [];
  for (const optionId in options) {
    const o = options[optionId];
    const usageText = formatUsage(optionId, o);
    usageTexts.push([usageText, o.description]);
  }
  return formatUsageTexts(usageTexts, columns);
}
function formatUsageTexts(usageTexts, columns) {
  const maxLength = usageTexts.reduce((previous, e) => Math.max(previous, e[0].length), 12);
  const argLength = maxLength + 2 + 1;
  if (columns - argLength < 25) {
    return usageTexts.reduce((r, ut) => r.concat([`  ${ut[0]}`, `      ${ut[1]}`]), []);
  }
  const descriptionColumns = columns - argLength - 1;
  const result = [];
  for (const ut of usageTexts) {
    const usage = ut[0];
    const wrappedDescription = wrapText(ut[1], descriptionColumns);
    const keyPadding = indent(
      argLength - usage.length - 2
      /*left padding*/
    );
    result.push("  " + usage + keyPadding + wrappedDescription[0]);
    for (let i = 1; i < wrappedDescription.length; i++) {
      result.push(indent(argLength) + wrappedDescription[i]);
    }
  }
  return result;
}
function indent(count) {
  return " ".repeat(count);
}
function wrapText(text, columns) {
  const lines = [];
  while (text.length) {
    let index = text.length < columns ? text.length : text.lastIndexOf(" ", columns);
    if (index === 0) {
      index = columns;
    }
    const line = text.slice(0, index).trim();
    text = text.slice(index).trimStart();
    lines.push(line);
  }
  return lines;
}
function buildHelpMessage(productName, executableName, version, options, capabilities) {
  const columns = process.stdout.isTTY && process.stdout.columns || 80;
  const inputFiles = capabilities?.noInputFiles ? "" : capabilities?.isChat ? ` [${localize("cliPrompt", "prompt")}]` : ` [${localize("paths", "paths")}...]`;
  const subcommand = capabilities?.isChat ? " chat" : "";
  const help = [`${productName} ${version}`];
  help.push("");
  help.push(`${localize("usage", "Usage")}: ${executableName}${subcommand} [${localize("options", "options")}]${inputFiles}`);
  help.push("");
  if (capabilities?.noPipe !== true) {
    help.push(buildStdinMessage(executableName, capabilities?.isChat));
    help.push("");
  }
  const optionsByCategory = {};
  const subcommands = [];
  for (const optionId in options) {
    const o = options[optionId];
    if (o.type === "subcommand") {
      if (o.description) {
        subcommands.push({ command: optionId, description: o.description });
      }
    } else if (o.description && o.cat) {
      const cat = o.cat;
      let optionsByCat = optionsByCategory[cat];
      if (!optionsByCat) {
        optionsByCategory[cat] = optionsByCat = {};
      }
      optionsByCat[optionId] = o;
    }
  }
  for (const helpCategoryKey in optionsByCategory) {
    const key = helpCategoryKey;
    const categoryOptions = optionsByCategory[key];
    if (categoryOptions) {
      help.push(helpCategories[key]);
      help.push(...formatOptions(categoryOptions, columns));
      help.push("");
    }
  }
  if (subcommands.length) {
    help.push(localize("subcommands", "Subcommands"));
    help.push(...formatUsageTexts(subcommands.map((s) => [s.command, s.description]), columns));
    help.push("");
  }
  return help.join("\n");
}
function buildStdinMessage(executableName, isChat) {
  let example;
  if (isWindows) {
    if (isChat) {
      example = `echo Hello World | ${executableName} chat <prompt> -`;
    } else {
      example = `echo Hello World | ${executableName} -`;
    }
  } else {
    if (isChat) {
      example = `ps aux | grep code | ${executableName} chat <prompt> -`;
    } else {
      example = `ps aux | grep code | ${executableName} -`;
    }
  }
  return localize("stdinUsage", "To read from stdin, append '-' (e.g. '{0}')", example);
}
function buildVersionMessage(version, commit) {
  return `${version || localize("unknownVersion", "Unknown version")}
${commit || localize("unknownCommit", "Unknown commit")}
${process.arch}`;
}
export {
  NATIVE_CLI_COMMANDS,
  OPTIONS,
  buildHelpMessage,
  buildStdinMessage,
  buildVersionMessage,
  formatOptions,
  parseArgs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Vudmlyb25tZW50L25vZGUvYXJndi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBtaW5pbWlzdCBmcm9tICdtaW5pbWlzdCc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vY29tbW9uL2FyZ3YuanMnO1xuXG4vKipcbiAqIFRoaXMgY29kZSBpcyBhbHNvIHVzZWQgYnkgc3RhbmRhbG9uZSBjbGkncy4gQXZvaWQgYWRkaW5nIGFueSBvdGhlciBkZXBlbmRlbmNpZXMuXG4gKi9cbmNvbnN0IGhlbHBDYXRlZ29yaWVzID0ge1xuXHRvOiBsb2NhbGl6ZSgnb3B0aW9uc1VwcGVyQ2FzZScsIFwiT3B0aW9uc1wiKSxcblx0ZTogbG9jYWxpemUoJ2V4dGVuc2lvbnNNYW5hZ2VtZW50JywgXCJFeHRlbnNpb25zIE1hbmFnZW1lbnRcIiksXG5cdHQ6IGxvY2FsaXplKCd0cm91Ymxlc2hvb3RpbmcnLCBcIlRyb3VibGVzaG9vdGluZ1wiKSxcblx0bTogbG9jYWxpemUoJ21jcCcsIFwiTW9kZWwgQ29udGV4dCBQcm90b2NvbFwiKVxufTtcblxuZXhwb3J0IGludGVyZmFjZSBPcHRpb248T3B0aW9uVHlwZT4ge1xuXHR0eXBlOiBPcHRpb25UeXBlO1xuXHRhbGlhcz86IHN0cmluZztcblx0ZGVwcmVjYXRlcz86IHN0cmluZ1tdOyAvLyBvbGQgZGVwcmVjYXRlZCBpZHNcblx0YXJncz86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0ZGVwcmVjYXRpb25NZXNzYWdlPzogc3RyaW5nO1xuXHRhbGxvd0VtcHR5VmFsdWU/OiBib29sZWFuO1xuXHRjYXQ/OiBrZXlvZiB0eXBlb2YgaGVscENhdGVnb3JpZXM7XG5cdGdsb2JhbD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3ViY29tbWFuZDxUPiB7XG5cdHR5cGU6ICdzdWJjb21tYW5kJztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGRlcHJlY2F0aW9uTWVzc2FnZT86IHN0cmluZztcblx0b3B0aW9uczogT3B0aW9uRGVzY3JpcHRpb25zPFJlcXVpcmVkPFQ+Pjtcbn1cblxuZXhwb3J0IHR5cGUgT3B0aW9uRGVzY3JpcHRpb25zPFQ+ID0ge1xuXHRbUCBpbiBrZXlvZiBUXTpcblx0VFtQXSBleHRlbmRzIGJvb2xlYW4gfCB1bmRlZmluZWQgPyBPcHRpb248J2Jvb2xlYW4nPiA6XG5cdFRbUF0gZXh0ZW5kcyBzdHJpbmcgfCB1bmRlZmluZWQgPyBPcHRpb248J3N0cmluZyc+IDpcblx0VFtQXSBleHRlbmRzIHN0cmluZ1tdIHwgdW5kZWZpbmVkID8gT3B0aW9uPCdzdHJpbmdbXSc+IDpcblx0U3ViY29tbWFuZDxUW1BdPlxufTtcblxuZXhwb3J0IGNvbnN0IE5BVElWRV9DTElfQ09NTUFORFMgPSBbJ3R1bm5lbCcsICdzZXJ2ZS13ZWInLCAnYWdlbnQnXSBhcyBjb25zdDtcblxuZXhwb3J0IGNvbnN0IE9QVElPTlM6IE9wdGlvbkRlc2NyaXB0aW9uczxSZXF1aXJlZDxOYXRpdmVQYXJzZWRBcmdzPj4gPSB7XG5cdCdjaGF0Jzoge1xuXHRcdHR5cGU6ICdzdWJjb21tYW5kJyxcblx0XHRkZXNjcmlwdGlvbjogJ1Bhc3MgaW4gYSBwcm9tcHQgdG8gcnVuIGluIGEgY2hhdCBzZXNzaW9uIGluIHRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5LicsXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0J18nOiB7IHR5cGU6ICdzdHJpbmdbXScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0JywgXCJUaGUgcHJvbXB0IHRvIHVzZSBhcyBjaGF0LlwiKSB9LFxuXHRcdFx0J21vZGUnOiB7IHR5cGU6ICdzdHJpbmcnLCBjYXQ6ICdvJywgYWxpYXM6ICdtJywgYXJnczogJ21vZGUnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRNb2RlJywgXCJUaGUgbW9kZSB0byB1c2UgZm9yIHRoZSBjaGF0IHNlc3Npb24uIEF2YWlsYWJsZSBvcHRpb25zOiAnYXNrJywgJ2VkaXQnLCAnYWdlbnQnLCBvciB0aGUgaWRlbnRpZmllciBvZiBhIGN1c3RvbSBtb2RlLiBEZWZhdWx0cyB0byAnYWdlbnQnLlwiKSB9LFxuXHRcdFx0J2FkZC1maWxlJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICdvJywgYWxpYXM6ICdhJywgYXJnczogJ3BhdGgnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FkZEZpbGUnLCBcIkFkZCBmaWxlcyBhcyBjb250ZXh0IHRvIHRoZSBjaGF0IHNlc3Npb24uXCIpIH0sXG5cdFx0XHQnbWF4aW1pemUnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdE1heGltaXplJywgXCJNYXhpbWl6ZSB0aGUgY2hhdCBzZXNzaW9uIHZpZXcuXCIpIH0sXG5cdFx0XHQncmV1c2Utd2luZG93JzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ28nLCBhbGlhczogJ3InLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JldXNlV2luZG93Rm9yQ2hhdCcsIFwiRm9yY2UgdG8gdXNlIHRoZSBsYXN0IGFjdGl2ZSB3aW5kb3cgZm9yIHRoZSBjaGF0IHNlc3Npb24uXCIpIH0sXG5cdFx0XHQnbmV3LXdpbmRvdyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICduJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCduZXdXaW5kb3dGb3JDaGF0JywgXCJGb3JjZSB0byBvcGVuIGFuIGVtcHR5IHdpbmRvdyBmb3IgdGhlIGNoYXQgc2Vzc2lvbi5cIikgfSxcblx0XHRcdCdwcm9maWxlJzogeyB0eXBlOiAnc3RyaW5nJywgJ2NhdCc6ICdvJywgYXJnczogJ3Byb2ZpbGVOYW1lJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9maWxlTmFtZScsIFwiT3BlbnMgdGhlIHByb3ZpZGVkIGZvbGRlciBvciB3b3Jrc3BhY2Ugd2l0aCB0aGUgZ2l2ZW4gcHJvZmlsZSBhbmQgYXNzb2NpYXRlcyB0aGUgcHJvZmlsZSB3aXRoIHRoZSB3b3Jrc3BhY2UuIElmIHRoZSBwcm9maWxlIGRvZXMgbm90IGV4aXN0LCBhIG5ldyBlbXB0eSBvbmUgaXMgY3JlYXRlZC5cIikgfSxcblx0XHRcdCdoZWxwJzogeyB0eXBlOiAnYm9vbGVhbicsIGFsaWFzOiAnaCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaGVscCcsIFwiUHJpbnQgdXNhZ2UuXCIpIH1cblx0XHR9XG5cdH0sXG5cdCdzZXJ2ZS13ZWInOiB7XG5cdFx0dHlwZTogJ3N1YmNvbW1hbmQnLFxuXHRcdGRlc2NyaXB0aW9uOiAnUnVuIGEgc2VydmVyIHRoYXQgZGlzcGxheXMgdGhlIGVkaXRvciBVSSBpbiBicm93c2Vycy4nLFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdCdjbGktZGF0YS1kaXInOiB7IHR5cGU6ICdzdHJpbmcnLCBhcmdzOiAnZGlyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGlEYXRhRGlyJywgXCJEaXJlY3Rvcnkgd2hlcmUgQ0xJIG1ldGFkYXRhIHNob3VsZCBiZSBzdG9yZWQuXCIpIH0sXG5cdFx0XHQnZGlzYWJsZS10ZWxlbWV0cnknOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0J3RlbGVtZXRyeS1sZXZlbCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHR9XG5cdH0sXG5cdCdhZ2VudCc6IHtcblx0XHR0eXBlOiAnc3ViY29tbWFuZCcsXG5cdFx0ZGVzY3JpcHRpb246ICdTdGFydCBhbmQgaW50ZXJhY3Qgd2l0aCBBSSBhZ2VudCBob3N0cy4nLFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdCdjbGktZGF0YS1kaXInOiB7IHR5cGU6ICdzdHJpbmcnLCBhcmdzOiAnZGlyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGlEYXRhRGlyJywgXCJEaXJlY3Rvcnkgd2hlcmUgQ0xJIG1ldGFkYXRhIHNob3VsZCBiZSBzdG9yZWQuXCIpIH0sXG5cdFx0XHQnZGlzYWJsZS10ZWxlbWV0cnknOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0J3RlbGVtZXRyeS1sZXZlbCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHR9XG5cdH0sXG5cdCd0dW5uZWwnOiB7XG5cdFx0dHlwZTogJ3N1YmNvbW1hbmQnLFxuXHRcdGRlc2NyaXB0aW9uOiAnTWFrZSB0aGUgY3VycmVudCBtYWNoaW5lIGFjY2Vzc2libGUgZnJvbSB2c2NvZGUuZGV2IG9yIG90aGVyIG1hY2hpbmVzIHRocm91Z2ggYSBzZWN1cmUgdHVubmVsLicsXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0J2NsaS1kYXRhLWRpcic6IHsgdHlwZTogJ3N0cmluZycsIGFyZ3M6ICdkaXInLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsaURhdGFEaXInLCBcIkRpcmVjdG9yeSB3aGVyZSBDTEkgbWV0YWRhdGEgc2hvdWxkIGJlIHN0b3JlZC5cIikgfSxcblx0XHRcdCdkaXNhYmxlLXRlbGVtZXRyeSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHQndGVsZW1ldHJ5LWxldmVsJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0dXNlcjoge1xuXHRcdFx0XHR0eXBlOiAnc3ViY29tbWFuZCcsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRsb2dpbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N1YmNvbW1hbmQnLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRwcm92aWRlcjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHQnYWNjZXNzLXRva2VuJzogeyB0eXBlOiAnc3RyaW5nJyB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXHQnZGlmZic6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICdkJywgYXJnczogWydmaWxlJywgJ2ZpbGUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaWZmJywgXCJDb21wYXJlIHR3byBmaWxlcyB3aXRoIGVhY2ggb3RoZXIuXCIpIH0sXG5cdCdtZXJnZSc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICdtJywgYXJnczogWydwYXRoMScsICdwYXRoMicsICdiYXNlJywgJ3Jlc3VsdCddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lcmdlJywgXCJQZXJmb3JtIGEgdGhyZWUtd2F5IG1lcmdlIGJ5IHByb3ZpZGluZyBwYXRocyBmb3IgdHdvIG1vZGlmaWVkIHZlcnNpb25zIG9mIGEgZmlsZSwgdGhlIGNvbW1vbiBvcmlnaW4gb2YgYm90aCBtb2RpZmllZCB2ZXJzaW9ucyBhbmQgdGhlIG91dHB1dCBmaWxlIHRvIHNhdmUgbWVyZ2UgcmVzdWx0cy5cIikgfSxcblx0J2FkZCc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICdhJywgYXJnczogJ2ZvbGRlcicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWRkJywgXCJBZGQgZm9sZGVyKHMpIHRvIHRoZSBsYXN0IGFjdGl2ZSB3aW5kb3cuXCIpIH0sXG5cdCdyZW1vdmUnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFyZ3M6ICdmb2xkZXInLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW92ZScsIFwiUmVtb3ZlIGZvbGRlcihzKSBmcm9tIHRoZSBsYXN0IGFjdGl2ZSB3aW5kb3cuXCIpIH0sXG5cdCdnb3RvJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ28nLCBhbGlhczogJ2cnLCBhcmdzOiAnZmlsZTpsaW5lWzpjaGFyYWN0ZXJdJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnb3RvJywgXCJPcGVuIGEgZmlsZSBhdCB0aGUgcGF0aCBvbiB0aGUgc3BlY2lmaWVkIGxpbmUgYW5kIGNoYXJhY3RlciBwb3NpdGlvbi5cIikgfSxcblx0J25ldy13aW5kb3cnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFsaWFzOiAnbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbmV3V2luZG93JywgXCJGb3JjZSB0byBvcGVuIGEgbmV3IHdpbmRvdy5cIikgfSxcblx0J3JldXNlLXdpbmRvdyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgYWxpYXM6ICdyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZXVzZVdpbmRvdycsIFwiRm9yY2UgdG8gb3BlbiBhIGZpbGUgb3IgZm9sZGVyIGluIGFuIGFscmVhZHkgb3BlbmVkIHdpbmRvdy5cIikgfSxcblx0J2FnZW50cyc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICdvJywgZGVwcmVjYXRlczogWydzZXNzaW9ucyddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50cycsIFwiT3BlbnMgdGhlIGFnZW50cyB3aW5kb3cuXCIpIH0sXG5cdCd3YWl0JzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ28nLCBhbGlhczogJ3cnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhaXQnLCBcIldhaXQgZm9yIHRoZSBmaWxlcyB0byBiZSBjbG9zZWQgYmVmb3JlIHJldHVybmluZy5cIikgfSxcblx0J3dhaXRNYXJrZXJGaWxlUGF0aCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2xvY2FsZSc6IHsgdHlwZTogJ3N0cmluZycsIGNhdDogJ28nLCBhcmdzOiAnbG9jYWxlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdsb2NhbGUnLCBcIlRoZSBsb2NhbGUgdG8gdXNlIChlLmcuIGVuLVVTIG9yIHpoLVRXKS5cIikgfSxcblx0J3VzZXItZGF0YS1kaXInOiB7IHR5cGU6ICdzdHJpbmcnLCBjYXQ6ICdvJywgYXJnczogJ2RpcicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndXNlckRhdGFEaXInLCBcIlNwZWNpZmllcyB0aGUgZGlyZWN0b3J5IHRoYXQgdXNlciBkYXRhIGlzIGtlcHQgaW4uIENhbiBiZSB1c2VkIHRvIG9wZW4gbXVsdGlwbGUgZGlzdGluY3QgaW5zdGFuY2VzIG9mIENvZGUuXCIpIH0sXG5cdCdwcm9maWxlJzogeyB0eXBlOiAnc3RyaW5nJywgJ2NhdCc6ICdvJywgYXJnczogJ3Byb2ZpbGVOYW1lJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9maWxlTmFtZScsIFwiT3BlbnMgdGhlIHByb3ZpZGVkIGZvbGRlciBvciB3b3Jrc3BhY2Ugd2l0aCB0aGUgZ2l2ZW4gcHJvZmlsZSBhbmQgYXNzb2NpYXRlcyB0aGUgcHJvZmlsZSB3aXRoIHRoZSB3b3Jrc3BhY2UuIElmIHRoZSBwcm9maWxlIGRvZXMgbm90IGV4aXN0LCBhIG5ldyBlbXB0eSBvbmUgaXMgY3JlYXRlZC5cIikgfSxcblx0J2hlbHAnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAnbycsIGFsaWFzOiAnaCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaGVscCcsIFwiUHJpbnQgdXNhZ2UuXCIpIH0sXG5cblx0J2V4dGVuc2lvbnMtZGlyJzogeyB0eXBlOiAnc3RyaW5nJywgZGVwcmVjYXRlczogWydleHRlbnNpb25Ib21lUGF0aCddLCBjYXQ6ICdlJywgYXJnczogJ2RpcicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uSG9tZVBhdGgnLCBcIlNldCB0aGUgcm9vdCBwYXRoIGZvciBleHRlbnNpb25zLlwiKSB9LFxuXHQnZXh0ZW5zaW9ucy1kb3dubG9hZC1kaXInOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdidWlsdGluLWV4dGVuc2lvbnMtZGlyJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnc2hhcmVkLWRhdGEtZGlyJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnbGlzdC1leHRlbnNpb25zJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ2UnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xpc3RFeHRlbnNpb25zJywgXCJMaXN0IHRoZSBpbnN0YWxsZWQgZXh0ZW5zaW9ucy5cIikgfSxcblx0J2FnZW50LXBsdWdpbnMtZGlyJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnYWdlbnRzLXVzZXItZGF0YS1kaXInOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdhZ2VudHMtZXh0ZW5zaW9ucy1kaXInOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdzaG93LXZlcnNpb25zJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ2UnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Nob3dWZXJzaW9ucycsIFwiU2hvdyB2ZXJzaW9ucyBvZiBpbnN0YWxsZWQgZXh0ZW5zaW9ucywgd2hlbiB1c2luZyAtLWxpc3QtZXh0ZW5zaW9ucy5cIikgfSxcblx0J2NhdGVnb3J5JzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlLCBjYXQ6ICdlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjYXRlZ29yeScsIFwiRmlsdGVycyBpbnN0YWxsZWQgZXh0ZW5zaW9ucyBieSBwcm92aWRlZCBjYXRlZ29yeSwgd2hlbiB1c2luZyAtLWxpc3QtZXh0ZW5zaW9ucy5cIiksIGFyZ3M6ICdjYXRlZ29yeScgfSxcblx0J2luc3RhbGwtZXh0ZW5zaW9uJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICdlJywgYXJnczogJ2V4dC1pZCB8IHBhdGgnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2luc3RhbGxFeHRlbnNpb24nLCBcIkluc3RhbGxzIG9yIHVwZGF0ZXMgYW4gZXh0ZW5zaW9uLiBUaGUgYXJndW1lbnQgaXMgZWl0aGVyIGFuIGV4dGVuc2lvbiBpZCBvciBhIHBhdGggdG8gYSBWU0lYLiBUaGUgaWRlbnRpZmllciBvZiBhbiBleHRlbnNpb24gaXMgJyR7cHVibGlzaGVyfS4ke25hbWV9Jy4gVXNlICctLWZvcmNlJyBhcmd1bWVudCB0byB1cGRhdGUgdG8gbGF0ZXN0IHZlcnNpb24uIFRvIGluc3RhbGwgYSBzcGVjaWZpYyB2ZXJzaW9uIHByb3ZpZGUgJ0Ake3ZlcnNpb259Jy4gRm9yIGV4YW1wbGU6ICd2c2NvZGUuY3NoYXJwQDEuMi4zJy5cIikgfSxcblx0J3ByZS1yZWxlYXNlJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ2UnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2luc3RhbGwgcHJlcmVsZWFzZScsIFwiSW5zdGFsbHMgdGhlIHByZS1yZWxlYXNlIHZlcnNpb24gb2YgdGhlIGV4dGVuc2lvbiwgd2hlbiB1c2luZyAtLWluc3RhbGwtZXh0ZW5zaW9uXCIpIH0sXG5cdCd1bmluc3RhbGwtZXh0ZW5zaW9uJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICdlJywgYXJnczogJ2V4dC1pZCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndW5pbnN0YWxsRXh0ZW5zaW9uJywgXCJVbmluc3RhbGxzIGFuIGV4dGVuc2lvbi5cIikgfSxcblx0J3VwZGF0ZS1leHRlbnNpb25zJzogeyB0eXBlOiAnYm9vbGVhbicsIGNhdDogJ2UnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VwZGF0ZUV4dGVuc2lvbnMnLCBcIlVwZGF0ZSB0aGUgaW5zdGFsbGVkIGV4dGVuc2lvbnMuXCIpIH0sXG5cdCdlbmFibGUtcHJvcG9zZWQtYXBpJzogeyB0eXBlOiAnc3RyaW5nW10nLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUsIGNhdDogJ2UnLCBhcmdzOiAnZXh0LWlkJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHBlcmltZW50YWxBcGlzJywgXCJFbmFibGVzIHByb3Bvc2VkIEFQSSBmZWF0dXJlcyBmb3IgZXh0ZW5zaW9ucy4gQ2FuIHJlY2VpdmUgb25lIG9yIG1vcmUgZXh0ZW5zaW9uIElEcyB0byBlbmFibGUgaW5kaXZpZHVhbGx5LlwiKSB9LFxuXG5cdCdhZGQtbWNwJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICdtJywgYXJnczogJ2pzb24nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FkZE1jcCcsIFwiQWRkcyBhIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgc2VydmVyIGRlZmluaXRpb24gdG8gdGhlIHVzZXIgcHJvZmlsZS4gQWNjZXB0cyBKU09OIGlucHV0IGluIHRoZSBmb3JtICd7XFxcIm5hbWVcXFwiOlxcXCJzZXJ2ZXItbmFtZVxcXCIsXFxcImNvbW1hbmRcXFwiOi4uLn0nXCIpIH0sXG5cblx0J3ZlcnNpb24nOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGFsaWFzOiAndicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyc2lvbicsIFwiUHJpbnQgdmVyc2lvbi5cIikgfSxcblx0J3ZlcmJvc2UnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGdsb2JhbDogdHJ1ZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NlJywgXCJQcmludCB2ZXJib3NlIG91dHB1dCAoaW1wbGllcyAtLXdhaXQpLlwiKSB9LFxuXHQnbG9nJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICd0JywgYXJnczogJ2xldmVsJywgZ2xvYmFsOiB0cnVlLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xvZycsIFwiTG9nIGxldmVsIHRvIHVzZS4gRGVmYXVsdCBpcyAnaW5mbycuIEFsbG93ZWQgdmFsdWVzIGFyZSAnY3JpdGljYWwnLCAnZXJyb3InLCAnd2FybicsICdpbmZvJywgJ2RlYnVnJywgJ3RyYWNlJywgJ29mZicuIFlvdSBjYW4gYWxzbyBjb25maWd1cmUgdGhlIGxvZyBsZXZlbCBvZiBhbiBleHRlbnNpb24gYnkgcGFzc2luZyBleHRlbnNpb24gaWQgYW5kIGxvZyBsZXZlbCBpbiB0aGUgZm9sbG93aW5nIGZvcm1hdDogJyR7cHVibGlzaGVyfS4ke25hbWV9OiR7bG9nTGV2ZWx9Jy4gRm9yIGV4YW1wbGU6ICd2c2NvZGUuY3NoYXJwOnRyYWNlJy4gQ2FuIHJlY2VpdmUgb25lIG9yIG1vcmUgc3VjaCBlbnRyaWVzLlwiKSB9LFxuXHQnc3RhdHVzJzogeyB0eXBlOiAnYm9vbGVhbicsIGFsaWFzOiAncycsIGNhdDogJ3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N0YXR1cycsIFwiUHJpbnQgcHJvY2VzcyB1c2FnZSBhbmQgZGlhZ25vc3RpY3MgaW5mb3JtYXRpb24uXCIpIH0sXG5cdCdwcm9mLXN0YXJ0dXAnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvZi1zdGFydHVwJywgXCJSdW4gQ1BVIHByb2ZpbGVyIGR1cmluZyBzdGFydHVwLlwiKSB9LFxuXHQncHJvZi1hcHBlbmQtdGltZXJzJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQncHJvZi1kdXJhdGlvbi1tYXJrZXJzJzogeyB0eXBlOiAnc3RyaW5nW10nIH0sXG5cdCdwcm9mLWR1cmF0aW9uLW1hcmtlcnMtZmlsZSc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J25vLWNhY2hlZC1kYXRhJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3Byb2Ytc3RhcnR1cC1wcmVmaXgnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdwcm9mLXY4LWV4dGVuc2lvbnMnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZGlzYWJsZS1leHRlbnNpb25zJzogeyB0eXBlOiAnYm9vbGVhbicsIGRlcHJlY2F0ZXM6IFsnZGlzYWJsZUV4dGVuc2lvbnMnXSwgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlzYWJsZUV4dGVuc2lvbnMnLCBcIkRpc2FibGUgYWxsIGluc3RhbGxlZCBleHRlbnNpb25zLiBUaGlzIG9wdGlvbiBpcyBub3QgcGVyc2lzdGVkIGFuZCBpcyBlZmZlY3RpdmUgb25seSB3aGVuIHRoZSBjb21tYW5kIG9wZW5zIGEgbmV3IHdpbmRvdy5cIikgfSxcblx0J2Rpc2FibGUtZXh0ZW5zaW9uJzogeyB0eXBlOiAnc3RyaW5nW10nLCBjYXQ6ICd0JywgYXJnczogJ2V4dC1pZCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlzYWJsZUV4dGVuc2lvbicsIFwiRGlzYWJsZSB0aGUgcHJvdmlkZWQgZXh0ZW5zaW9uLiBUaGlzIG9wdGlvbiBpcyBub3QgcGVyc2lzdGVkIGFuZCBpcyBlZmZlY3RpdmUgb25seSB3aGVuIHRoZSBjb21tYW5kIG9wZW5zIGEgbmV3IHdpbmRvdy5cIikgfSxcblx0J3N5bmMnOiB7IHR5cGU6ICdzdHJpbmcnLCBjYXQ6ICd0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCd0dXJuIHN5bmMnLCBcIlR1cm4gc3luYyBvbiBvciBvZmYuXCIpLCBhcmdzOiBbJ29uIHwgb2ZmJ10gfSxcblxuXHQnaW5zcGVjdC1leHRlbnNpb25zJzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlLCBkZXByZWNhdGVzOiBbJ2RlYnVnUGx1Z2luSG9zdCddLCBhcmdzOiAncG9ydCcsIGNhdDogJ3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2luc3BlY3QtZXh0ZW5zaW9ucycsIFwiQWxsb3cgZGVidWdnaW5nIGFuZCBwcm9maWxpbmcgb2YgZXh0ZW5zaW9ucy4gQ2hlY2sgdGhlIGRldmVsb3BlciB0b29scyBmb3IgdGhlIGNvbm5lY3Rpb24gVVJJLlwiKSB9LFxuXHQnaW5zcGVjdC1icmstZXh0ZW5zaW9ucyc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSwgZGVwcmVjYXRlczogWydkZWJ1Z0Jya1BsdWdpbkhvc3QnXSwgYXJnczogJ3BvcnQnLCBjYXQ6ICd0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnNwZWN0LWJyay1leHRlbnNpb25zJywgXCJBbGxvdyBkZWJ1Z2dpbmcgYW5kIHByb2ZpbGluZyBvZiBleHRlbnNpb25zIHdpdGggdGhlIGV4dGVuc2lvbiBob3N0IGJlaW5nIHBhdXNlZCBhZnRlciBzdGFydC4gQ2hlY2sgdGhlIGRldmVsb3BlciB0b29scyBmb3IgdGhlIGNvbm5lY3Rpb24gVVJJLlwiKSB9LFxuXHQnZGlzYWJsZS1sY2QtdGV4dCc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICd0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaXNhYmxlTENEVGV4dCcsIFwiRGlzYWJsZSBMQ0QgZm9udCByZW5kZXJpbmcuXCIpIH0sXG5cdCdkaXNhYmxlLWdwdSc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBjYXQ6ICd0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaXNhYmxlR1BVJywgXCJEaXNhYmxlIEdQVSBoYXJkd2FyZSBhY2NlbGVyYXRpb24uXCIpIH0sXG5cdCdkaXNhYmxlLWNocm9taXVtLXNhbmRib3gnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlzYWJsZUNocm9taXVtU2FuZGJveCcsIFwiVXNlIHRoaXMgb3B0aW9uIG9ubHkgd2hlbiB0aGVyZSBpcyByZXF1aXJlbWVudCB0byBsYXVuY2ggdGhlIGFwcGxpY2F0aW9uIGFzIHN1ZG8gdXNlciBvbiBMaW51eCBvciB3aGVuIHJ1bm5pbmcgYXMgYW4gZWxldmF0ZWQgdXNlciBpbiBhbiBhcHBsb2NrZXIgZW52aXJvbm1lbnQgb24gV2luZG93cy5cIikgfSxcblx0J3NhbmRib3gnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnbG9jYXRlLXNoZWxsLWludGVncmF0aW9uLXBhdGgnOiB7IHR5cGU6ICdzdHJpbmcnLCBjYXQ6ICd0JywgYXJnczogWydzaGVsbCddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xvY2F0ZVNoZWxsSW50ZWdyYXRpb25QYXRoJywgXCJQcmludCB0aGUgcGF0aCB0byBhIHRlcm1pbmFsIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdC4gQWxsb3dlZCB2YWx1ZXMgYXJlICdiYXNoJywgJ3B3c2gnLCAnenNoJyBvciAnZmlzaCcuXCIpIH0sXG5cdCd0ZWxlbWV0cnknOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVsZW1ldHJ5JywgXCJTaG93cyBhbGwgdGVsZW1ldHJ5IGV2ZW50cyB3aGljaCBWUyBjb2RlIGNvbGxlY3RzLlwiKSB9LFxuXG5cdCdyZW1vdGUnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2ZvbGRlci11cmknOiB7IHR5cGU6ICdzdHJpbmdbXScsIGNhdDogJ28nLCBhcmdzOiAndXJpJyB9LFxuXHQnZmlsZS11cmknOiB7IHR5cGU6ICdzdHJpbmdbXScsIGNhdDogJ28nLCBhcmdzOiAndXJpJyB9LFxuXG5cdCdsb2NhdGUtZXh0ZW5zaW9uJzogeyB0eXBlOiAnc3RyaW5nW10nIH0sXG5cdCdleHRlbnNpb25EZXZlbG9wbWVudFBhdGgnOiB7IHR5cGU6ICdzdHJpbmdbXScgfSxcblx0J2V4dGVuc2lvbkRldmVsb3BtZW50S2luZCc6IHsgdHlwZTogJ3N0cmluZ1tdJyB9LFxuXHQnZXh0ZW5zaW9uVGVzdHNQYXRoJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZXh0ZW5zaW9uRW52aXJvbm1lbnQnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdkZWJ1Z0lkJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZGVidWdSZW5kZXJlcic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdpbnNwZWN0LXB0eWhvc3QnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2luc3BlY3QtYnJrLXB0eWhvc3QnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2luc3BlY3QtYWdlbnRob3N0JzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdpbnNwZWN0LWJyay1hZ2VudGhvc3QnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2luc3BlY3Qtc2hhcmVkcHJvY2Vzcyc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSB9LFxuXHQnaW5zcGVjdC1icmstc2hhcmVkcHJvY2Vzcyc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSB9LFxuXHQnZXhwb3J0LWRlZmF1bHQtY29uZmlndXJhdGlvbic6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2V4cG9ydC1wb2xpY3ktZGF0YSc6IHsgdHlwZTogJ3N0cmluZycsIGFsbG93RW1wdHlWYWx1ZTogdHJ1ZSB9LFxuXHQnZXhwb3J0LWRlZmF1bHQta2V5YmluZGluZ3MnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2luc3RhbGwtc291cmNlJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZW5hYmxlLXNtb2tlLXRlc3QtZHJpdmVyJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3NraXAtc2Vzc2lvbnMtd2VsY29tZSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdsb2dFeHRlbnNpb25Ib3N0Q29tbXVuaWNhdGlvbic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdza2lwLXJlbGVhc2Utbm90ZXMnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnc2tpcC13ZWxjb21lJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2Rpc2FibGUtdGVsZW1ldHJ5JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2Rpc2FibGUtdXBkYXRlcyc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdzaGFyZS1zZWNyZXRzLXdpdGgtYWdlbnRzLWFwcCc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCd0cmFuc2llbnQnOiB7IHR5cGU6ICdib29sZWFuJywgY2F0OiAndCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndHJhbnNpZW50JywgXCJSdW4gd2l0aCB0ZW1wb3JhcnkgZGF0YSBhbmQgZXh0ZW5zaW9uIGRpcmVjdG9yaWVzLCBhcyBpZiBsYXVuY2hlZCBmb3IgdGhlIGZpcnN0IHRpbWUuXCIpIH0sXG5cdCd1c2UtaW5tZW1vcnktc2VjcmV0c3RvcmFnZSc6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXByZWNhdGVzOiBbJ2Rpc2FibGUta2V5dGFyJ10gfSxcblx0J3Bhc3N3b3JkLXN0b3JlJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZGlzYWJsZS13b3Jrc3BhY2UtdHJ1c3QnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZGlzYWJsZS1jcmFzaC1yZXBvcnRlcic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdjcmFzaC1yZXBvcnRlci1kaXJlY3RvcnknOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdjcmFzaC1yZXBvcnRlci1pZCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3NraXAtYWRkLXRvLXJlY2VudGx5LW9wZW5lZCc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdvcGVuLXVybCc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdmaWxlLXdyaXRlJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2ZpbGUtY2htb2QnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnaW5zdGFsbC1idWlsdGluLWV4dGVuc2lvbic6IHsgdHlwZTogJ3N0cmluZ1tdJyB9LFxuXHQnZm9yY2UnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZG8tbm90LXN5bmMnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZG8tbm90LWluY2x1ZGUtcGFjay1kZXBlbmRlbmNpZXMnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQndHJhY2UnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQndHJhY2UtbWVtb3J5LWluZnJhJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J3RyYWNlLWNhdGVnb3J5LWZpbHRlcic6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3RyYWNlLW9wdGlvbnMnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdwcmVzZXJ2ZS1lbnYnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZm9yY2UtdXNlci1lbnYnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZm9yY2UtZGlzYWJsZS11c2VyLWVudic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdvcGVuLWRldnRvb2xzJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2Rpc2FibGUtZ3B1LXNhbmRib3gnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnbG9nc1BhdGgnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdfX2VuYWJsZS1maWxlLXBvbGljeSc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdCdlZGl0U2Vzc2lvbklkJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnY29udGludWVPbic6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2VuYWJsZS1jb2knOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQndW5yZXNwb25zaXZlLXNhbXBsZS1pbnRlcnZhbCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3VucmVzcG9uc2l2ZS1zYW1wbGUtcGVyaW9kJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZW5hYmxlLXJkcC1kaXNwbGF5LXRyYWNraW5nJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2Rpc2FibGUtbGF5b3V0LXJlc3RvcmUnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnZGlzYWJsZS1leHBlcmltZW50cyc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cblx0Ly8gY2hyb21pdW0gZmxhZ3Ncblx0J25vLXByb3h5LXNlcnZlcic6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdC8vIE1pbmltaXN0IGluY29ycmVjdGx5IHBhcnNlcyBrZXlzIHRoYXQgc3RhcnQgd2l0aCBgLS1ub2Bcblx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL3N1YnN0YWNrL21pbmltaXN0L2Jsb2IvYWViM2UyN2RhZTA0MTJkZTVjMDQ5NGU5NTYzYTVmMTBjODJjYzdhOS9pbmRleC5qcyNMMTE4LUwxMjFcblx0Ly8gSWYgLS1uby1zYW5kYm94IGlzIHBhc3NlZCB2aWEgY2xpIHdyYXBwZXIgaXQgd2lsbCBiZSB0cmVhdGVkIGFzIC0tc2FuZGJveCB3aGljaCBpcyBpbmNvcnJlY3QsIHdlIHVzZVxuXHQvLyB0aGUgYWxpYXMgaGVyZSB0byBtYWtlIHN1cmUgLS1uby1zYW5kYm94IGlzIGFsd2F5cyByZXNwZWN0ZWQuXG5cdC8vIEZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI4Mjc5XG5cdCduby1zYW5kYm94JzogeyB0eXBlOiAnYm9vbGVhbicsIGFsaWFzOiAnc2FuZGJveCcgfSxcblx0J3Byb3h5LXNlcnZlcic6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3Byb3h5LWJ5cGFzcy1saXN0JzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQncHJveHktcGFjLXVybCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J2pzLWZsYWdzJzogeyB0eXBlOiAnc3RyaW5nJyB9LCAvLyBjaHJvbWUganMgZmxhZ3Ncblx0J2luc3BlY3QnOiB7IHR5cGU6ICdzdHJpbmcnLCBhbGxvd0VtcHR5VmFsdWU6IHRydWUgfSxcblx0J2luc3BlY3QtYnJrJzogeyB0eXBlOiAnc3RyaW5nJywgYWxsb3dFbXB0eVZhbHVlOiB0cnVlIH0sXG5cdCdub2xhenknOiB7IHR5cGU6ICdib29sZWFuJyB9LCAvLyBub2RlIGluc3BlY3Rcblx0J2ZvcmNlLWRldmljZS1zY2FsZS1mYWN0b3InOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCdmb3JjZS1yZW5kZXJlci1hY2Nlc3NpYmlsaXR5JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2lnbm9yZS1jZXJ0aWZpY2F0ZS1lcnJvcnMnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQnYWxsb3ctaW5zZWN1cmUtbG9jYWxob3N0JzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J2xvZy1uZXQtbG9nJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQndm1vZHVsZSc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J191cmxzJzogeyB0eXBlOiAnc3RyaW5nW10nIH0sXG5cdCdkaXNhYmxlLWRldi1zaG0tdXNhZ2UnOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHQncHJvZmlsZS10ZW1wJzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0J296b25lLXBsYXRmb3JtJzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHQnZW5hYmxlLXRyYWNpbmcnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCd0cmFjZS1zdGFydHVwLWZvcm1hdCc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3RyYWNlLXN0YXJ0dXAtZmlsZSc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0J3RyYWNlLXN0YXJ0dXAtZHVyYXRpb24nOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdCd4ZGctcG9ydGFsLXJlcXVpcmVkLXZlcnNpb24nOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cblx0XzogeyB0eXBlOiAnc3RyaW5nW10nIH0gLy8gbWFpbiBhcmd1bWVudHNcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXJyb3JSZXBvcnRlciB7XG5cdG9uVW5rbm93bk9wdGlvbihpZDogc3RyaW5nKTogdm9pZDtcblx0b25NdWx0aXBsZVZhbHVlcyhpZDogc3RyaW5nLCB1c2VkVmFsdWU6IHN0cmluZyk6IHZvaWQ7XG5cdG9uRW1wdHlWYWx1ZShpZDogc3RyaW5nKTogdm9pZDtcblx0b25EZXByZWNhdGVkT3B0aW9uKGRlcHJlY2F0ZWRJZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkO1xuXG5cdGdldFN1YmNvbW1hbmRSZXBvcnRlcj8oY29tbWFuZDogc3RyaW5nKTogRXJyb3JSZXBvcnRlcjtcbn1cblxuY29uc3QgaWdub3JpbmdSZXBvcnRlciA9IHtcblx0b25Vbmtub3duT3B0aW9uOiAoKSA9PiB7IH0sXG5cdG9uTXVsdGlwbGVWYWx1ZXM6ICgpID0+IHsgfSxcblx0b25FbXB0eVZhbHVlOiAoKSA9PiB7IH0sXG5cdG9uRGVwcmVjYXRlZE9wdGlvbjogKCkgPT4geyB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VBcmdzPFQ+KGFyZ3M6IHN0cmluZ1tdLCBvcHRpb25zOiBPcHRpb25EZXNjcmlwdGlvbnM8VD4sIGVycm9yUmVwb3J0ZXI6IEVycm9yUmVwb3J0ZXIgPSBpZ25vcmluZ1JlcG9ydGVyKTogVCB7XG5cdC8vIEZpbmQgdGhlIGZpcnN0IG5vbi1vcHRpb24gYXJnLCB3aGljaCBhbHNvIGlzbid0IHRoZSB2YWx1ZSBmb3IgYSBwcmV2aW91cyBgLS1mbGFnYFxuXHRjb25zdCBmaXJzdFBvc3NpYmxlQ29tbWFuZCA9IGFyZ3MuZmluZCgoYSwgaSkgPT4gYS5sZW5ndGggPiAwICYmIGFbMF0gIT09ICctJyAmJiBvcHRpb25zLmhhc093blByb3BlcnR5KGEpICYmIG9wdGlvbnNbYSBhcyBUXS50eXBlID09PSAnc3ViY29tbWFuZCcpO1xuXG5cdGNvbnN0IGFsaWFzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG5cdGNvbnN0IHN0cmluZ09wdGlvbnM6IHN0cmluZ1tdID0gWydfJ107XG5cdGNvbnN0IGJvb2xlYW5PcHRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBnbG9iYWxPcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBPcHRpb248J2Jvb2xlYW4nPiB8IE9wdGlvbjwnc3RyaW5nJz4gfCBPcHRpb248J3N0cmluZ1tdJz4+ID0ge307XG5cdGxldCBjb21tYW5kOiBTdWJjb21tYW5kPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBvcHRpb25JZCBpbiBvcHRpb25zKSB7XG5cdFx0Y29uc3QgbyA9IG9wdGlvbnNbb3B0aW9uSWRdO1xuXHRcdGlmIChvLnR5cGUgPT09ICdzdWJjb21tYW5kJykge1xuXHRcdFx0aWYgKG9wdGlvbklkID09PSBmaXJzdFBvc3NpYmxlQ29tbWFuZCkge1xuXHRcdFx0XHRjb21tYW5kID0gbztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG8uYWxpYXMpIHtcblx0XHRcdFx0YWxpYXNbb3B0aW9uSWRdID0gby5hbGlhcztcblx0XHRcdH1cblxuXHRcdFx0aWYgKG8udHlwZSA9PT0gJ3N0cmluZycgfHwgby50eXBlID09PSAnc3RyaW5nW10nKSB7XG5cdFx0XHRcdHN0cmluZ09wdGlvbnMucHVzaChvcHRpb25JZCk7XG5cdFx0XHRcdGlmIChvLmRlcHJlY2F0ZXMpIHtcblx0XHRcdFx0XHRzdHJpbmdPcHRpb25zLnB1c2goLi4uby5kZXByZWNhdGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChvLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRib29sZWFuT3B0aW9ucy5wdXNoKG9wdGlvbklkKTtcblx0XHRcdFx0aWYgKG8uZGVwcmVjYXRlcykge1xuXHRcdFx0XHRcdGJvb2xlYW5PcHRpb25zLnB1c2goLi4uby5kZXByZWNhdGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG8uZ2xvYmFsKSB7XG5cdFx0XHRcdGdsb2JhbE9wdGlvbnNbb3B0aW9uSWRdID0gbztcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0aWYgKGNvbW1hbmQgJiYgZmlyc3RQb3NzaWJsZUNvbW1hbmQpIHtcblx0XHRjb25zdCBvcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBPcHRpb248J2Jvb2xlYW4nPiB8IE9wdGlvbjwnc3RyaW5nJz4gfCBPcHRpb248J3N0cmluZ1tdJz4gfCBTdWJjb21tYW5kPFJlY29yZDxzdHJpbmcsIHVua25vd24+Pj4gPSBnbG9iYWxPcHRpb25zO1xuXHRcdGZvciAoY29uc3Qgb3B0aW9uSWQgaW4gY29tbWFuZC5vcHRpb25zKSB7XG5cdFx0XHRvcHRpb25zW29wdGlvbklkXSA9IGNvbW1hbmQub3B0aW9uc1tvcHRpb25JZF07XG5cdFx0fVxuXHRcdGNvbnN0IG5ld0FyZ3MgPSBhcmdzLmZpbHRlcihhID0+IGEgIT09IGZpcnN0UG9zc2libGVDb21tYW5kKTtcblx0XHRjb25zdCByZXBvcnRlciA9IGVycm9yUmVwb3J0ZXIuZ2V0U3ViY29tbWFuZFJlcG9ydGVyID8gZXJyb3JSZXBvcnRlci5nZXRTdWJjb21tYW5kUmVwb3J0ZXIoZmlyc3RQb3NzaWJsZUNvbW1hbmQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHN1YmNvbW1hbmRPcHRpb25zID0gcGFyc2VBcmdzKG5ld0FyZ3MsIG9wdGlvbnMgYXMgT3B0aW9uRGVzY3JpcHRpb25zPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiwgcmVwb3J0ZXIpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRyZXR1cm4gPFQ+e1xuXHRcdFx0W2ZpcnN0UG9zc2libGVDb21tYW5kXTogc3ViY29tbWFuZE9wdGlvbnMsXG5cdFx0XHRfOiBbXVxuXHRcdH07XG5cdH1cblxuXG5cdC8vIHJlbW92ZSBhbGlhc2VzIHRvIGF2b2lkIGNvbmZ1c2lvblxuXHRjb25zdCBwYXJzZWRBcmdzID0gbWluaW1pc3QoYXJncywgeyBzdHJpbmc6IHN0cmluZ09wdGlvbnMsIGJvb2xlYW46IGJvb2xlYW5PcHRpb25zLCBhbGlhcyB9KTtcblxuXHRjb25zdCBjbGVhbmVkQXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0Y29uc3QgcmVtYWluaW5nQXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSBwYXJzZWRBcmdzO1xuXG5cdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81ODE3NywgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwNjYxN1xuXHRjbGVhbmVkQXJncy5fID0gcGFyc2VkQXJncy5fLm1hcChhcmcgPT4gU3RyaW5nKGFyZykpLmZpbHRlcihhcmcgPT4gYXJnLmxlbmd0aCA+IDApO1xuXG5cdGRlbGV0ZSByZW1haW5pbmdBcmdzLl87XG5cblx0Zm9yIChjb25zdCBvcHRpb25JZCBpbiBvcHRpb25zKSB7XG5cdFx0Y29uc3QgbyA9IG9wdGlvbnNbb3B0aW9uSWRdO1xuXHRcdGlmIChvLnR5cGUgPT09ICdzdWJjb21tYW5kJykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChvLmFsaWFzKSB7XG5cdFx0XHRkZWxldGUgcmVtYWluaW5nQXJnc1tvLmFsaWFzXTtcblx0XHR9XG5cblx0XHRsZXQgdmFsID0gcmVtYWluaW5nQXJnc1tvcHRpb25JZF07XG5cdFx0aWYgKG8uZGVwcmVjYXRlcykge1xuXHRcdFx0Zm9yIChjb25zdCBkZXByZWNhdGVkSWQgb2Ygby5kZXByZWNhdGVzKSB7XG5cdFx0XHRcdGlmIChyZW1haW5pbmdBcmdzLmhhc093blByb3BlcnR5KGRlcHJlY2F0ZWRJZCkpIHtcblx0XHRcdFx0XHRpZiAoIXZhbCkge1xuXHRcdFx0XHRcdFx0dmFsID0gcmVtYWluaW5nQXJnc1tkZXByZWNhdGVkSWRdO1xuXHRcdFx0XHRcdFx0aWYgKHZhbCkge1xuXHRcdFx0XHRcdFx0XHRlcnJvclJlcG9ydGVyLm9uRGVwcmVjYXRlZE9wdGlvbihkZXByZWNhdGVkSWQsIG8uZGVwcmVjYXRpb25NZXNzYWdlIHx8IGxvY2FsaXplKCdkZXByZWNhdGVkLnVzZUluc3RlYWQnLCAnVXNlIHswfSBpbnN0ZWFkLicsIG9wdGlvbklkKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlbGV0ZSByZW1haW5pbmdBcmdzW2RlcHJlY2F0ZWRJZF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHZhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGlmIChvLnR5cGUgPT09ICdzdHJpbmdbXScpIHtcblx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHZhbCkpIHtcblx0XHRcdFx0XHR2YWwgPSBbdmFsXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW8uYWxsb3dFbXB0eVZhbHVlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2FuaXRpemVkID0gKHZhbCBhcyBzdHJpbmdbXSkuZmlsdGVyKCh2OiBzdHJpbmcpID0+IHYubGVuZ3RoID4gMCk7XG5cdFx0XHRcdFx0aWYgKHNhbml0aXplZC5sZW5ndGggIT09ICh2YWwgYXMgc3RyaW5nW10pLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZXJyb3JSZXBvcnRlci5vbkVtcHR5VmFsdWUob3B0aW9uSWQpO1xuXHRcdFx0XHRcdFx0dmFsID0gc2FuaXRpemVkLmxlbmd0aCA+IDAgPyBzYW5pdGl6ZWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKG8udHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsKSkge1xuXHRcdFx0XHRcdHZhbCA9IHZhbC5wb3AoKTsgLy8gdGFrZSB0aGUgbGFzdFxuXHRcdFx0XHRcdGVycm9yUmVwb3J0ZXIub25NdWx0aXBsZVZhbHVlcyhvcHRpb25JZCwgdmFsIGFzIHN0cmluZyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXZhbCAmJiAhby5hbGxvd0VtcHR5VmFsdWUpIHtcblx0XHRcdFx0XHRlcnJvclJlcG9ydGVyLm9uRW1wdHlWYWx1ZShvcHRpb25JZCk7XG5cdFx0XHRcdFx0dmFsID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjbGVhbmVkQXJnc1tvcHRpb25JZF0gPSB2YWw7XG5cblx0XHRcdGlmIChvLmRlcHJlY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRlcnJvclJlcG9ydGVyLm9uRGVwcmVjYXRlZE9wdGlvbihvcHRpb25JZCwgby5kZXByZWNhdGlvbk1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRkZWxldGUgcmVtYWluaW5nQXJnc1tvcHRpb25JZF07XG5cdH1cblxuXHRmb3IgKGNvbnN0IGtleSBpbiByZW1haW5pbmdBcmdzKSB7XG5cdFx0ZXJyb3JSZXBvcnRlci5vblVua25vd25PcHRpb24oa2V5KTtcblx0fVxuXG5cdHJldHVybiBjbGVhbmVkQXJncyBhcyBUO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRVc2FnZShvcHRpb25JZDogc3RyaW5nLCBvcHRpb246IE9wdGlvbjwnYm9vbGVhbic+IHwgT3B0aW9uPCdzdHJpbmcnPiB8IE9wdGlvbjwnc3RyaW5nW10nPikge1xuXHRsZXQgYXJncyA9ICcnO1xuXHRpZiAob3B0aW9uLmFyZ3MpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShvcHRpb24uYXJncykpIHtcblx0XHRcdGFyZ3MgPSBgIDwke29wdGlvbi5hcmdzLmpvaW4oJz4gPCcpfT5gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmdzID0gYCA8JHtvcHRpb24uYXJnc30+YDtcblx0XHR9XG5cdH1cblx0aWYgKG9wdGlvbi5hbGlhcykge1xuXHRcdHJldHVybiBgLSR7b3B0aW9uLmFsaWFzfSAtLSR7b3B0aW9uSWR9JHthcmdzfWA7XG5cdH1cblx0cmV0dXJuIGAtLSR7b3B0aW9uSWR9JHthcmdzfWA7XG59XG5cbi8vIGV4cG9ydGVkIG9ubHkgZm9yIHRlc3RpbmdcbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRPcHRpb25zKG9wdGlvbnM6IE9wdGlvbkRlc2NyaXB0aW9uczx1bmtub3duPiB8IFJlY29yZDxzdHJpbmcsIE9wdGlvbjwnYm9vbGVhbic+IHwgT3B0aW9uPCdzdHJpbmcnPiB8IE9wdGlvbjwnc3RyaW5nW10nPj4sIGNvbHVtbnM6IG51bWJlcik6IHN0cmluZ1tdIHtcblx0Y29uc3QgdXNhZ2VUZXh0czogW3N0cmluZywgc3RyaW5nXVtdID0gW107XG5cdGZvciAoY29uc3Qgb3B0aW9uSWQgaW4gb3B0aW9ucykge1xuXHRcdGNvbnN0IG8gPSBvcHRpb25zW29wdGlvbklkIGFzIGtleW9mIHR5cGVvZiBvcHRpb25zXSBhcyBPcHRpb248J2Jvb2xlYW4nPiB8IE9wdGlvbjwnc3RyaW5nJz4gfCBPcHRpb248J3N0cmluZ1tdJz47XG5cdFx0Y29uc3QgdXNhZ2VUZXh0ID0gZm9ybWF0VXNhZ2Uob3B0aW9uSWQsIG8pO1xuXHRcdHVzYWdlVGV4dHMucHVzaChbdXNhZ2VUZXh0LCBvLmRlc2NyaXB0aW9uIV0pO1xuXHR9XG5cdHJldHVybiBmb3JtYXRVc2FnZVRleHRzKHVzYWdlVGV4dHMsIGNvbHVtbnMpO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRVc2FnZVRleHRzKHVzYWdlVGV4dHM6IFtzdHJpbmcsIHN0cmluZ11bXSwgY29sdW1uczogbnVtYmVyKSB7XG5cdGNvbnN0IG1heExlbmd0aCA9IHVzYWdlVGV4dHMucmVkdWNlKChwcmV2aW91cywgZSkgPT4gTWF0aC5tYXgocHJldmlvdXMsIGVbMF0ubGVuZ3RoKSwgMTIpO1xuXHRjb25zdCBhcmdMZW5ndGggPSBtYXhMZW5ndGggKyAyLypsZWZ0IHBhZGRpbmcqLyArIDEvKnJpZ2h0IHBhZGRpbmcqLztcblx0aWYgKGNvbHVtbnMgLSBhcmdMZW5ndGggPCAyNSkge1xuXHRcdC8vIFVzZSBhIGNvbmRlbnNlZCB2ZXJzaW9uIG9uIG5hcnJvdyB0ZXJtaW5hbHNcblx0XHRyZXR1cm4gdXNhZ2VUZXh0cy5yZWR1Y2U8c3RyaW5nW10+KChyLCB1dCkgPT4gci5jb25jYXQoW2AgICR7dXRbMF19YCwgYCAgICAgICR7dXRbMV19YF0pLCBbXSk7XG5cdH1cblx0Y29uc3QgZGVzY3JpcHRpb25Db2x1bW5zID0gY29sdW1ucyAtIGFyZ0xlbmd0aCAtIDE7XG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCB1dCBvZiB1c2FnZVRleHRzKSB7XG5cdFx0Y29uc3QgdXNhZ2UgPSB1dFswXTtcblx0XHRjb25zdCB3cmFwcGVkRGVzY3JpcHRpb24gPSB3cmFwVGV4dCh1dFsxXSwgZGVzY3JpcHRpb25Db2x1bW5zKTtcblx0XHRjb25zdCBrZXlQYWRkaW5nID0gaW5kZW50KGFyZ0xlbmd0aCAtIHVzYWdlLmxlbmd0aCAtIDIvKmxlZnQgcGFkZGluZyovKTtcblx0XHRyZXN1bHQucHVzaCgnICAnICsgdXNhZ2UgKyBrZXlQYWRkaW5nICsgd3JhcHBlZERlc2NyaXB0aW9uWzBdKTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHdyYXBwZWREZXNjcmlwdGlvbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0cmVzdWx0LnB1c2goaW5kZW50KGFyZ0xlbmd0aCkgKyB3cmFwcGVkRGVzY3JpcHRpb25baV0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBpbmRlbnQoY291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiAnICcucmVwZWF0KGNvdW50KTtcbn1cblxuZnVuY3Rpb24gd3JhcFRleHQodGV4dDogc3RyaW5nLCBjb2x1bW5zOiBudW1iZXIpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHR3aGlsZSAodGV4dC5sZW5ndGgpIHtcblx0XHRsZXQgaW5kZXggPSB0ZXh0Lmxlbmd0aCA8IGNvbHVtbnMgPyB0ZXh0Lmxlbmd0aCA6IHRleHQubGFzdEluZGV4T2YoJyAnLCBjb2x1bW5zKTtcblx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdGluZGV4ID0gY29sdW1ucztcblx0XHR9XG5cdFx0Y29uc3QgbGluZSA9IHRleHQuc2xpY2UoMCwgaW5kZXgpLnRyaW0oKTtcblx0XHR0ZXh0ID0gdGV4dC5zbGljZShpbmRleCkudHJpbVN0YXJ0KCk7XG5cdFx0bGluZXMucHVzaChsaW5lKTtcblx0fVxuXHRyZXR1cm4gbGluZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEhlbHBNZXNzYWdlKHByb2R1Y3ROYW1lOiBzdHJpbmcsIGV4ZWN1dGFibGVOYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZywgb3B0aW9uczogT3B0aW9uRGVzY3JpcHRpb25zPHVua25vd24+IHwgUmVjb3JkPHN0cmluZywgT3B0aW9uPCdib29sZWFuJz4gfCBPcHRpb248J3N0cmluZyc+IHwgT3B0aW9uPCdzdHJpbmdbXSc+IHwgU3ViY29tbWFuZDxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4+LCBjYXBhYmlsaXRpZXM/OiB7IG5vUGlwZT86IGJvb2xlYW47IG5vSW5wdXRGaWxlcz86IGJvb2xlYW47IGlzQ2hhdD86IGJvb2xlYW4gfSk6IHN0cmluZyB7XG5cdGNvbnN0IGNvbHVtbnMgPSAocHJvY2Vzcy5zdGRvdXQpLmlzVFRZICYmIChwcm9jZXNzLnN0ZG91dCkuY29sdW1ucyB8fCA4MDtcblx0Y29uc3QgaW5wdXRGaWxlcyA9IGNhcGFiaWxpdGllcz8ubm9JbnB1dEZpbGVzID8gJycgOiBjYXBhYmlsaXRpZXM/LmlzQ2hhdCA/IGAgWyR7bG9jYWxpemUoJ2NsaVByb21wdCcsICdwcm9tcHQnKX1dYCA6IGAgWyR7bG9jYWxpemUoJ3BhdGhzJywgJ3BhdGhzJyl9Li4uXWA7XG5cdGNvbnN0IHN1YmNvbW1hbmQgPSBjYXBhYmlsaXRpZXM/LmlzQ2hhdCA/ICcgY2hhdCcgOiAnJztcblxuXHRjb25zdCBoZWxwID0gW2Ake3Byb2R1Y3ROYW1lfSAke3ZlcnNpb259YF07XG5cdGhlbHAucHVzaCgnJyk7XG5cdGhlbHAucHVzaChgJHtsb2NhbGl6ZSgndXNhZ2UnLCBcIlVzYWdlXCIpfTogJHtleGVjdXRhYmxlTmFtZX0ke3N1YmNvbW1hbmR9IFske2xvY2FsaXplKCdvcHRpb25zJywgXCJvcHRpb25zXCIpfV0ke2lucHV0RmlsZXN9YCk7XG5cdGhlbHAucHVzaCgnJyk7XG5cdGlmIChjYXBhYmlsaXRpZXM/Lm5vUGlwZSAhPT0gdHJ1ZSkge1xuXHRcdGhlbHAucHVzaChidWlsZFN0ZGluTWVzc2FnZShleGVjdXRhYmxlTmFtZSwgY2FwYWJpbGl0aWVzPy5pc0NoYXQpKTtcblx0XHRoZWxwLnB1c2goJycpO1xuXHR9XG5cdGNvbnN0IG9wdGlvbnNCeUNhdGVnb3J5OiB7IFtQIGluIGtleW9mIHR5cGVvZiBoZWxwQ2F0ZWdvcmllc10/OiBSZWNvcmQ8c3RyaW5nLCBPcHRpb248J2Jvb2xlYW4nPiB8IE9wdGlvbjwnc3RyaW5nJz4gfCBPcHRpb248J3N0cmluZ1tdJz4+IH0gPSB7fTtcblx0Y29uc3Qgc3ViY29tbWFuZHM6IHsgY29tbWFuZDogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG9wdGlvbklkIGluIG9wdGlvbnMpIHtcblx0XHRjb25zdCBvID0gb3B0aW9uc1tvcHRpb25JZCBhcyBrZXlvZiB0eXBlb2Ygb3B0aW9uc10gYXMgT3B0aW9uPCdib29sZWFuJz4gfCBPcHRpb248J3N0cmluZyc+IHwgT3B0aW9uPCdzdHJpbmdbXSc+IHwgU3ViY29tbWFuZDxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj47XG5cdFx0aWYgKG8udHlwZSA9PT0gJ3N1YmNvbW1hbmQnKSB7XG5cdFx0XHRpZiAoby5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRzdWJjb21tYW5kcy5wdXNoKHsgY29tbWFuZDogb3B0aW9uSWQsIGRlc2NyaXB0aW9uOiBvLmRlc2NyaXB0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoby5kZXNjcmlwdGlvbiAmJiBvLmNhdCkge1xuXHRcdFx0Y29uc3QgY2F0ID0gby5jYXQ7XG5cdFx0XHRsZXQgb3B0aW9uc0J5Q2F0ID0gb3B0aW9uc0J5Q2F0ZWdvcnlbY2F0XTtcblx0XHRcdGlmICghb3B0aW9uc0J5Q2F0KSB7XG5cdFx0XHRcdG9wdGlvbnNCeUNhdGVnb3J5W2NhdF0gPSBvcHRpb25zQnlDYXQgPSB7fTtcblx0XHRcdH1cblx0XHRcdG9wdGlvbnNCeUNhdFtvcHRpb25JZF0gPSBvO1xuXHRcdH1cblx0fVxuXG5cdGZvciAoY29uc3QgaGVscENhdGVnb3J5S2V5IGluIG9wdGlvbnNCeUNhdGVnb3J5KSB7XG5cdFx0Y29uc3Qga2V5ID0gPGtleW9mIHR5cGVvZiBoZWxwQ2F0ZWdvcmllcz5oZWxwQ2F0ZWdvcnlLZXk7XG5cblx0XHRjb25zdCBjYXRlZ29yeU9wdGlvbnMgPSBvcHRpb25zQnlDYXRlZ29yeVtrZXldO1xuXHRcdGlmIChjYXRlZ29yeU9wdGlvbnMpIHtcblx0XHRcdGhlbHAucHVzaChoZWxwQ2F0ZWdvcmllc1trZXldKTtcblx0XHRcdGhlbHAucHVzaCguLi5mb3JtYXRPcHRpb25zKGNhdGVnb3J5T3B0aW9ucywgY29sdW1ucykpO1xuXHRcdFx0aGVscC5wdXNoKCcnKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoc3ViY29tbWFuZHMubGVuZ3RoKSB7XG5cdFx0aGVscC5wdXNoKGxvY2FsaXplKCdzdWJjb21tYW5kcycsIFwiU3ViY29tbWFuZHNcIikpO1xuXHRcdGhlbHAucHVzaCguLi5mb3JtYXRVc2FnZVRleHRzKHN1YmNvbW1hbmRzLm1hcChzID0+IFtzLmNvbW1hbmQsIHMuZGVzY3JpcHRpb25dKSwgY29sdW1ucykpO1xuXHRcdGhlbHAucHVzaCgnJyk7XG5cdH1cblxuXHRyZXR1cm4gaGVscC5qb2luKCdcXG4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU3RkaW5NZXNzYWdlKGV4ZWN1dGFibGVOYW1lOiBzdHJpbmcsIGlzQ2hhdD86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRsZXQgZXhhbXBsZTogc3RyaW5nO1xuXHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0aWYgKGlzQ2hhdCkge1xuXHRcdFx0ZXhhbXBsZSA9IGBlY2hvIEhlbGxvIFdvcmxkIHwgJHtleGVjdXRhYmxlTmFtZX0gY2hhdCA8cHJvbXB0PiAtYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXhhbXBsZSA9IGBlY2hvIEhlbGxvIFdvcmxkIHwgJHtleGVjdXRhYmxlTmFtZX0gLWA7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGlmIChpc0NoYXQpIHtcblx0XHRcdGV4YW1wbGUgPSBgcHMgYXV4IHwgZ3JlcCBjb2RlIHwgJHtleGVjdXRhYmxlTmFtZX0gY2hhdCA8cHJvbXB0PiAtYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXhhbXBsZSA9IGBwcyBhdXggfCBncmVwIGNvZGUgfCAke2V4ZWN1dGFibGVOYW1lfSAtYDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbG9jYWxpemUoJ3N0ZGluVXNhZ2UnLCBcIlRvIHJlYWQgZnJvbSBzdGRpbiwgYXBwZW5kICctJyAoZS5nLiAnezB9JylcIiwgZXhhbXBsZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFZlcnNpb25NZXNzYWdlKHZlcnNpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgY29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7dmVyc2lvbiB8fCBsb2NhbGl6ZSgndW5rbm93blZlcnNpb24nLCBcIlVua25vd24gdmVyc2lvblwiKX1cXG4ke2NvbW1pdCB8fCBsb2NhbGl6ZSgndW5rbm93bkNvbW1pdCcsIFwiVW5rbm93biBjb21taXRcIil9XFxuJHtwcm9jZXNzLmFyY2h9YDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sY0FBYztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQU16QixNQUFNLGlCQUFpQjtBQUFBLEVBQ3RCLEdBQUcsU0FBUyxvQkFBb0IsU0FBUztBQUFBLEVBQ3pDLEdBQUcsU0FBUyx3QkFBd0IsdUJBQXVCO0FBQUEsRUFDM0QsR0FBRyxTQUFTLG1CQUFtQixpQkFBaUI7QUFBQSxFQUNoRCxHQUFHLFNBQVMsT0FBTyx3QkFBd0I7QUFDNUM7QUE2Qk8sTUFBTSxzQkFBc0IsQ0FBQyxVQUFVLGFBQWEsT0FBTztBQUUzRCxNQUFN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
