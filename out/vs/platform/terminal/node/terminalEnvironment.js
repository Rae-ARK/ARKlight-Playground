import * as os from "os";
import { FileAccess } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import * as process from "../../../base/common/process.js";
import { format } from "../../../base/common/strings.js";
import { ShellIntegrationInjectionFailureReason } from "../common/terminal.js";
import { EnvironmentVariableMutatorType } from "../common/environmentVariable.js";
import { deserializeEnvironmentVariableCollections } from "../common/environmentVariableShared.js";
import { MergedEnvironmentVariableCollection } from "../common/environmentVariableCollection.js";
import { chmod, realpathSync, mkdirSync } from "fs";
import { promisify } from "util";
import { isString } from "../../../base/common/types.js";
import { getWindowsBuildNumberAsync } from "../../../base/node/windowsVersion.js";
async function getShellIntegrationInjection(shellLaunchConfig, options, env, logService, productService, skipStickyBit = false) {
  if (!options.shellIntegration.enabled) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.InjectionSettingDisabled };
  }
  if (!shellLaunchConfig.executable) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.NoExecutable };
  }
  if (shellLaunchConfig.isFeatureTerminal && !shellLaunchConfig.forceShellIntegration) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FeatureTerminal };
  }
  if (shellLaunchConfig.ignoreShellIntegration) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.IgnoreShellIntegrationFlag };
  }
  const windowsBuildNumber = isWindows ? await getWindowsBuildNumberAsync() : 0;
  if (isWindows && windowsBuildNumber < 18309) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedWindowsBuild };
  }
  const originalArgs = shellLaunchConfig.args;
  const shell = process.platform === "win32" ? path.basename(shellLaunchConfig.executable).toLowerCase() : path.basename(shellLaunchConfig.executable);
  const appRoot = path.dirname(FileAccess.asFileUri("").fsPath);
  const type = "injection";
  let newArgs;
  const envMixin = {
    "VSCODE_INJECTION": "1"
  };
  if (options.shellIntegration.nonce) {
    envMixin["VSCODE_NONCE"] = options.shellIntegration.nonce;
  }
  const scopedDownShellEnvs = ["PATH", "VIRTUAL_ENV", "HOME", "SHELL", "PWD"];
  if (shellLaunchConfig.shellIntegrationEnvironmentReporting) {
    if (isWindows) {
      const enableWindowsEnvReporting = options.windowsUseConptyDll || windowsBuildNumber >= 22631 && shell !== "bash.exe";
      if (enableWindowsEnvReporting) {
        envMixin["VSCODE_SHELL_ENV_REPORTING"] = scopedDownShellEnvs.join(",");
      }
    } else {
      envMixin["VSCODE_SHELL_ENV_REPORTING"] = scopedDownShellEnvs.join(",");
    }
  }
  if (isWindows) {
    if (shell === "pwsh.exe" || shell === "powershell.exe") {
      envMixin["VSCODE_A11Y_MODE"] = options.isScreenReaderOptimized ? "1" : "0";
      if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("windows-pwsh" /* WindowsPwsh */);
      } else if (arePwshLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("windows-pwsh-login" /* WindowsPwshLogin */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, "");
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    } else if (shell === "bash.exe") {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        envMixin["VSCODE_SHELL_LOGIN"] = "1";
        addEnvMixinPathPrefix(options, envMixin, shell);
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    }
    logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedShell };
  }
  switch (shell) {
    case "bash": {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        envMixin["VSCODE_SHELL_LOGIN"] = "1";
        addEnvMixinPathPrefix(options, envMixin, shell);
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    }
    case "fish": {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("fish" /* Fish */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("fish-login" /* FishLogin */);
      } else if (originalArgs === shellIntegrationArgs.get("fish" /* Fish */) || originalArgs === shellIntegrationArgs.get("fish-login" /* FishLogin */)) {
        newArgs = originalArgs;
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      addEnvMixinPathPrefix(options, envMixin, shell);
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
      return { type, newArgs, envMixin };
    }
    case "pwsh": {
      if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("pwsh" /* Pwsh */);
      } else if (arePwshLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("pwsh-login" /* PwshLogin */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot, "");
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    }
    case "zsh": {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("zsh" /* Zsh */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("zsh-login" /* ZshLogin */);
        addEnvMixinPathPrefix(options, envMixin, shell);
      } else if (originalArgs === shellIntegrationArgs.get("zsh" /* Zsh */) || originalArgs === shellIntegrationArgs.get("zsh-login" /* ZshLogin */)) {
        newArgs = originalArgs;
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], appRoot);
      let username;
      try {
        username = os.userInfo().username;
      } catch {
        username = "unknown";
      }
      const realTmpDir = realpathSync(os.tmpdir());
      const zdotdir = path.join(realTmpDir, `${username}-${productService.applicationName}-zsh`);
      if (!skipStickyBit) {
        try {
          const chmodAsync = promisify(chmod);
          await chmodAsync(zdotdir, 960);
        } catch (err) {
          if (err.message.includes("ENOENT")) {
            try {
              mkdirSync(zdotdir);
            } catch (err2) {
              logService.error(`Failed to create zdotdir at ${zdotdir}: ${err2}`);
              return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FailedToCreateTmpDir };
            }
            try {
              const chmodAsync = promisify(chmod);
              await chmodAsync(zdotdir, 960);
            } catch {
              logService.error(`Failed to set sticky bit on ${zdotdir}: ${err}`);
              return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FailedToSetStickyBit };
            }
          }
          logService.error(`Failed to set sticky bit on ${zdotdir}: ${err}`);
          return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FailedToSetStickyBit };
        }
      }
      envMixin["ZDOTDIR"] = zdotdir;
      const userZdotdir = env?.ZDOTDIR ?? os.homedir() ?? `~`;
      envMixin["USER_ZDOTDIR"] = userZdotdir;
      const filesToCopy = [];
      filesToCopy.push({
        source: path.join(appRoot, "out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-rc.zsh"),
        dest: path.join(zdotdir, ".zshrc")
      });
      filesToCopy.push({
        source: path.join(appRoot, "out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-profile.zsh"),
        dest: path.join(zdotdir, ".zprofile")
      });
      filesToCopy.push({
        source: path.join(appRoot, "out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-env.zsh"),
        dest: path.join(zdotdir, ".zshenv")
      });
      filesToCopy.push({
        source: path.join(appRoot, "out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-login.zsh"),
        dest: path.join(zdotdir, ".zlogin")
      });
      return { type, newArgs, envMixin, filesToCopy };
    }
  }
  logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
  return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedShell };
}
function addEnvMixinPathPrefix(options, envMixin, shell) {
  if ((isMacintosh || shell === "fish") && options.environmentVariableCollections) {
    const deserialized = deserializeEnvironmentVariableCollections(options.environmentVariableCollections);
    const merged = new MergedEnvironmentVariableCollection(deserialized);
    const pathEntry = merged.getVariableMap({ workspaceFolder: options.workspaceFolder }).get("PATH");
    const prependToPath = [];
    if (pathEntry) {
      for (const mutator of pathEntry) {
        if (mutator.type === EnvironmentVariableMutatorType.Prepend) {
          prependToPath.push(mutator.value);
        }
      }
    }
    if (prependToPath.length > 0) {
      envMixin["VSCODE_PATH_PREFIX"] = prependToPath.join("");
    }
  }
}
var ShellIntegrationExecutable = /* @__PURE__ */ ((ShellIntegrationExecutable2) => {
  ShellIntegrationExecutable2["WindowsPwsh"] = "windows-pwsh";
  ShellIntegrationExecutable2["WindowsPwshLogin"] = "windows-pwsh-login";
  ShellIntegrationExecutable2["Pwsh"] = "pwsh";
  ShellIntegrationExecutable2["PwshLogin"] = "pwsh-login";
  ShellIntegrationExecutable2["Zsh"] = "zsh";
  ShellIntegrationExecutable2["ZshLogin"] = "zsh-login";
  ShellIntegrationExecutable2["Bash"] = "bash";
  ShellIntegrationExecutable2["Fish"] = "fish";
  ShellIntegrationExecutable2["FishLogin"] = "fish-login";
  return ShellIntegrationExecutable2;
})(ShellIntegrationExecutable || {});
const shellIntegrationArgs = /* @__PURE__ */ new Map();
shellIntegrationArgs.set("windows-pwsh" /* WindowsPwsh */, ["-noexit", "-command", 'try { . "{0}\\out\\vs\\workbench\\contrib\\terminal\\common\\scripts\\shellIntegration.ps1" } catch {}{1}']);
shellIntegrationArgs.set("windows-pwsh-login" /* WindowsPwshLogin */, ["-l", "-noexit", "-command", 'try { . "{0}\\out\\vs\\workbench\\contrib\\terminal\\common\\scripts\\shellIntegration.ps1" } catch {}{1}']);
shellIntegrationArgs.set("pwsh" /* Pwsh */, ["-noexit", "-command", '. "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1"{1}']);
shellIntegrationArgs.set("pwsh-login" /* PwshLogin */, ["-l", "-noexit", "-command", '. "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1"']);
shellIntegrationArgs.set("zsh" /* Zsh */, ["-i"]);
shellIntegrationArgs.set("zsh-login" /* ZshLogin */, ["-il"]);
shellIntegrationArgs.set("bash" /* Bash */, ["--init-file", "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh"]);
shellIntegrationArgs.set("fish" /* Fish */, ["--init-command", 'source "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.fish"']);
shellIntegrationArgs.set("fish-login" /* FishLogin */, ["-l", "--init-command", 'source "{0}/out/vs/workbench/contrib/terminal/common/scripts/shellIntegration.fish"']);
const pwshLoginArgs = ["-login", "-l"];
const shLoginArgs = ["--login", "-l"];
const shInteractiveArgs = ["-i", "--interactive"];
const pwshImpliedArgs = ["-nol", "-nologo"];
function arePwshLoginArgs(originalArgs) {
  if (isString(originalArgs)) {
    return pwshLoginArgs.includes(originalArgs.toLowerCase());
  } else {
    return originalArgs.length === 1 && pwshLoginArgs.includes(originalArgs[0].toLowerCase()) || originalArgs.length === 2 && (pwshLoginArgs.includes(originalArgs[0].toLowerCase()) || pwshLoginArgs.includes(originalArgs[1].toLowerCase())) && (pwshImpliedArgs.includes(originalArgs[0].toLowerCase()) || pwshImpliedArgs.includes(originalArgs[1].toLowerCase()));
  }
}
function arePwshImpliedArgs(originalArgs) {
  if (isString(originalArgs)) {
    return pwshImpliedArgs.includes(originalArgs.toLowerCase());
  } else {
    return originalArgs.length === 0 || originalArgs?.length === 1 && pwshImpliedArgs.includes(originalArgs[0].toLowerCase());
  }
}
function areZshBashFishLoginArgs(originalArgs) {
  if (!isString(originalArgs)) {
    originalArgs = originalArgs.filter((arg) => !shInteractiveArgs.includes(arg.toLowerCase()));
  }
  return isString(originalArgs) && shLoginArgs.includes(originalArgs.toLowerCase()) || !isString(originalArgs) && originalArgs.length === 1 && shLoginArgs.includes(originalArgs[0].toLowerCase());
}
const sensitiveEnvVarNames = /^(?:.*_)?(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_?SECRET|APIKEY)(?:_.*)?$/i;
const secretValuePatterns = [
  // JWT tokens
  /^eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+$/,
  // GitHub tokens
  /^gh[psuro]_[a-zA-Z0-9]{36}$/,
  /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/,
  // Google API keys
  /^AIza[A-Za-z0-9_\-]{35}$/,
  // Slack tokens
  /^xox[pbar]\-[A-Za-z0-9\-]+$/,
  // Azure/MS tokens (common patterns)
  /^[a-zA-Z0-9]{32,}$/
];
function sanitizeEnvForLogging(env) {
  if (!env) {
    return env;
  }
  const sanitized = {};
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (value === void 0) {
      continue;
    }
    if (sensitiveEnvVarNames.test(key)) {
      sanitized[key] = "<REDACTED>";
      continue;
    }
    let isSecret = false;
    for (const pattern of secretValuePatterns) {
      if (pattern.test(value)) {
        isSecret = true;
        break;
      }
    }
    sanitized[key] = isSecret ? "<REDACTED>" : value;
  }
  return sanitized;
}
export {
  getShellIntegrationInjection,
  sanitizeEnvForLogging
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvdGVybWluYWxFbnZpcm9ubWVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcHJvY2VzcyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbEVudmlyb25tZW50LCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24gfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZVNoYXJlZC5qcyc7XG5pbXBvcnQgeyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBjaG1vZCwgcmVhbHBhdGhTeW5jLCBta2RpclN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGlzU3RyaW5nLCBTaW5nbGVPck1hbnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3dzQnVpbGROdW1iZXJBc3luYyB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS93aW5kb3dzVmVyc2lvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24ge1xuXHRyZWFkb25seSB0eXBlOiAnaW5qZWN0aW9uJztcblx0LyoqXG5cdCAqIEEgbmV3IHNldCBvZiBhcmd1bWVudHMgdG8gdXNlLlxuXHQgKi9cblx0cmVhZG9ubHkgbmV3QXJnczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBBbiBvcHRpb25hbCBlbnZpcm9ubWVudCB0byBtaXhpbmcgdG8gdGhlIHJlYWwgZW52aXJvbm1lbnQuXG5cdCAqL1xuXHRyZWFkb25seSBlbnZNaXhpbj86IElQcm9jZXNzRW52aXJvbm1lbnQ7XG5cdC8qKlxuXHQgKiBBbiBvcHRpb25hbCBhcnJheSBvZiBmaWxlcyB0byBjb3B5IGZyb20gYHNvdXJjZWAgdG8gYGRlc3RgLlxuXHQgKi9cblx0cmVhZG9ubHkgZmlsZXNUb0NvcHk/OiB7XG5cdFx0c291cmNlOiBzdHJpbmc7XG5cdFx0ZGVzdDogc3RyaW5nO1xuXHR9W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlIHtcblx0cmVhZG9ubHkgdHlwZTogJ2ZhaWx1cmUnO1xuXHRyZWFkb25seSByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uO1xufVxuXG4vKipcbiAqIEZvciBhIGdpdmVuIHNoZWxsIGxhdW5jaCBjb25maWcsIHJldHVybnMgYXJndW1lbnRzIHRvIHJlcGxhY2UgYW5kIGFuIG9wdGlvbmFsIGVudmlyb25tZW50IHRvXG4gKiBtaXhpbiB0byB0aGUgU0xDJ3MgZW52aXJvbm1lbnQgdG8gZW5hYmxlIHNoZWxsIGludGVncmF0aW9uLiBUaGlzIG11c3QgYmUgcnVuIHdpdGhpbiB0aGUgY29udGV4dFxuICogdGhhdCBjcmVhdGVzIHRoZSBwcm9jZXNzIHRvIGVuc3VyZSBhY2N1cmFjeS4gUmV0dXJucyB1bmRlZmluZWQgaWYgc2hlbGwgaW50ZWdyYXRpb24gY2Fubm90IGJlXG4gKiBlbmFibGVkLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbihcblx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0b3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsXG5cdGVudjogSVRlcm1pbmFsRW52aXJvbm1lbnQgfCB1bmRlZmluZWQsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRza2lwU3RpY2t5Qml0OiBib29sZWFuID0gZmFsc2Vcbik6IFByb21pc2U8SVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24gfCBJU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmU+IHtcblx0Ly8gVGhlIGdsb2JhbCBzZXR0aW5nIGlzIGRpc2FibGVkXG5cdGlmICghb3B0aW9ucy5zaGVsbEludGVncmF0aW9uLmVuYWJsZWQpIHtcblx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uSW5qZWN0aW9uU2V0dGluZ0Rpc2FibGVkIH07XG5cdH1cblx0Ly8gVGhlcmUgaXMgbm8gZXhlY3V0YWJsZSAoc28gdGhlcmUncyBubyB3YXkgdG8gZGV0ZXJtaW5lIGhvdyB0byBpbmplY3QpXG5cdGlmICghc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSkge1xuXHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5Ob0V4ZWN1dGFibGUgfTtcblx0fVxuXHQvLyBJdCdzIGEgZmVhdHVyZSB0ZXJtaW5hbCAodGFza3MsIGRlYnVnKSwgdW5sZXNzIGl0J3MgZXhwbGljaXRseSBiZWluZyBmb3JjZWRcblx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsICYmICFzaGVsbExhdW5jaENvbmZpZy5mb3JjZVNoZWxsSW50ZWdyYXRpb24pIHtcblx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uRmVhdHVyZVRlcm1pbmFsIH07XG5cdH1cblx0Ly8gVGhlIGlnbm9yZVNoZWxsSW50ZWdyYXRpb24gZmxhZyBpcyBwYXNzZWQgKGVnLiByZWxhdW5jaGluZyB3aXRob3V0IHNoZWxsIGludGVncmF0aW9uKVxuXHRpZiAoc2hlbGxMYXVuY2hDb25maWcuaWdub3JlU2hlbGxJbnRlZ3JhdGlvbikge1xuXHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5JZ25vcmVTaGVsbEludGVncmF0aW9uRmxhZyB9O1xuXHR9XG5cdC8vIFNoZWxsIGludGVncmF0aW9uIHJlcXVpcmVzIFdpbmRvd3MgMTAgYnVpbGQgMTgzMDkrIChDb25QVFkgc3VwcG9ydClcblx0Y29uc3Qgd2luZG93c0J1aWxkTnVtYmVyID0gaXNXaW5kb3dzID8gYXdhaXQgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMoKSA6IDA7XG5cdGlmIChpc1dpbmRvd3MgJiYgd2luZG93c0J1aWxkTnVtYmVyIDwgMTgzMDkpIHtcblx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uVW5zdXBwb3J0ZWRXaW5kb3dzQnVpbGQgfTtcblx0fVxuXG5cdGNvbnN0IG9yaWdpbmFsQXJncyA9IHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3M7XG5cdGNvbnN0IHNoZWxsID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/IHBhdGguYmFzZW5hbWUoc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSkudG9Mb3dlckNhc2UoKSA6IHBhdGguYmFzZW5hbWUoc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSk7XG5cdGNvbnN0IGFwcFJvb3QgPSBwYXRoLmRpcm5hbWUoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLmZzUGF0aCk7XG5cdGNvbnN0IHR5cGUgPSAnaW5qZWN0aW9uJztcblx0bGV0IG5ld0FyZ3M6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBlbnZNaXhpbjogSVByb2Nlc3NFbnZpcm9ubWVudCA9IHtcblx0XHQnVlNDT0RFX0lOSkVDVElPTic6ICcxJ1xuXHR9O1xuXG5cdGlmIChvcHRpb25zLnNoZWxsSW50ZWdyYXRpb24ubm9uY2UpIHtcblx0XHRlbnZNaXhpblsnVlNDT0RFX05PTkNFJ10gPSBvcHRpb25zLnNoZWxsSW50ZWdyYXRpb24ubm9uY2U7XG5cdH1cblx0Ly8gVGVtcG9yYXJpbHkgcGFzcyBsaXN0IG9mIGhhcmRjb2RlZCBlbnYgdmFycyBmb3Igc2hlbGwgZW52IGFwaVxuXHRjb25zdCBzY29wZWREb3duU2hlbGxFbnZzID0gWydQQVRIJywgJ1ZJUlRVQUxfRU5WJywgJ0hPTUUnLCAnU0hFTEwnLCAnUFdEJ107XG5cdGlmIChzaGVsbExhdW5jaENvbmZpZy5zaGVsbEludGVncmF0aW9uRW52aXJvbm1lbnRSZXBvcnRpbmcpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBlbmFibGVXaW5kb3dzRW52UmVwb3J0aW5nID0gb3B0aW9ucy53aW5kb3dzVXNlQ29ucHR5RGxsIHx8IHdpbmRvd3NCdWlsZE51bWJlciA+PSAyMjYzMSAmJiBzaGVsbCAhPT0gJ2Jhc2guZXhlJztcblx0XHRcdGlmIChlbmFibGVXaW5kb3dzRW52UmVwb3J0aW5nKSB7XG5cdFx0XHRcdGVudk1peGluWydWU0NPREVfU0hFTExfRU5WX1JFUE9SVElORyddID0gc2NvcGVkRG93blNoZWxsRW52cy5qb2luKCcsJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVudk1peGluWydWU0NPREVfU0hFTExfRU5WX1JFUE9SVElORyddID0gc2NvcGVkRG93blNoZWxsRW52cy5qb2luKCcsJyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gV2luZG93c1xuXHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0aWYgKHNoZWxsID09PSAncHdzaC5leGUnIHx8IHNoZWxsID09PSAncG93ZXJzaGVsbC5leGUnKSB7XG5cdFx0XHRlbnZNaXhpblsnVlNDT0RFX0ExMVlfTU9ERSddID0gb3B0aW9ucy5pc1NjcmVlblJlYWRlck9wdGltaXplZCA/ICcxJyA6ICcwJztcblxuXHRcdFx0aWYgKCFvcmlnaW5hbEFyZ3MgfHwgYXJlUHdzaEltcGxpZWRBcmdzKG9yaWdpbmFsQXJncykpIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5XaW5kb3dzUHdzaCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFyZVB3c2hMb2dpbkFyZ3Mob3JpZ2luYWxBcmdzKSkge1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLldpbmRvd3NQd3NoTG9naW4pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXdBcmdzKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZEFyZ3MgfTtcblx0XHRcdH1cblx0XHRcdG5ld0FyZ3MgPSBbLi4ubmV3QXJnc107XG5cdFx0XHRuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0gPSBmb3JtYXQobmV3QXJnc1tuZXdBcmdzLmxlbmd0aCAtIDFdLCBhcHBSb290LCAnJyk7XG5cdFx0XHRlbnZNaXhpblsnVlNDT0RFX1NUQUJMRSddID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAnMScgOiAnMCc7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBuZXdBcmdzLCBlbnZNaXhpbiB9O1xuXHRcdH0gZWxzZSBpZiAoc2hlbGwgPT09ICdiYXNoLmV4ZScpIHtcblx0XHRcdGlmICghb3JpZ2luYWxBcmdzIHx8IG9yaWdpbmFsQXJncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5CYXNoKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJlWnNoQmFzaEZpc2hMb2dpbkFyZ3Mob3JpZ2luYWxBcmdzKSkge1xuXHRcdFx0XHRlbnZNaXhpblsnVlNDT0RFX1NIRUxMX0xPR0lOJ10gPSAnMSc7XG5cdFx0XHRcdGFkZEVudk1peGluUGF0aFByZWZpeChvcHRpb25zLCBlbnZNaXhpbiwgc2hlbGwpO1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkJhc2gpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXdBcmdzKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZEFyZ3MgfTtcblx0XHRcdH1cblx0XHRcdG5ld0FyZ3MgPSBbLi4ubmV3QXJnc107IC8vIFNoYWxsb3cgY2xvbmUgdGhlIGFycmF5IHRvIGF2b2lkIHNldHRpbmcgdGhlIGRlZmF1bHQgYXJyYXlcblx0XHRcdG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSA9IGZvcm1hdChuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0sIGFwcFJvb3QpO1xuXHRcdFx0ZW52TWl4aW5bJ1ZTQ09ERV9TVEFCTEUnXSA9IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnID8gJzEnIDogJzAnO1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgbmV3QXJncywgZW52TWl4aW4gfTtcblx0XHR9XG5cdFx0bG9nU2VydmljZS53YXJuKGBTaGVsbCBpbnRlZ3JhdGlvbiBjYW5ub3QgYmUgZW5hYmxlZCBmb3IgZXhlY3V0YWJsZSBcIiR7c2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZX1cIiBhbmQgYXJnc2AsIHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MpO1xuXHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZFNoZWxsIH07XG5cdH1cblxuXHQvLyBMaW51eCAmIG1hY09TXG5cdHN3aXRjaCAoc2hlbGwpIHtcblx0XHRjYXNlICdiYXNoJzoge1xuXHRcdFx0aWYgKCFvcmlnaW5hbEFyZ3MgfHwgb3JpZ2luYWxBcmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkJhc2gpO1xuXHRcdFx0fSBlbHNlIGlmIChhcmVac2hCYXNoRmlzaExvZ2luQXJncyhvcmlnaW5hbEFyZ3MpKSB7XG5cdFx0XHRcdGVudk1peGluWydWU0NPREVfU0hFTExfTE9HSU4nXSA9ICcxJztcblx0XHRcdFx0YWRkRW52TWl4aW5QYXRoUHJlZml4KG9wdGlvbnMsIGVudk1peGluLCBzaGVsbCk7XG5cdFx0XHRcdG5ld0FyZ3MgPSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuQmFzaCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW5ld0FyZ3MpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLlVuc3VwcG9ydGVkQXJncyB9O1xuXHRcdFx0fVxuXHRcdFx0bmV3QXJncyA9IFsuLi5uZXdBcmdzXTsgLy8gU2hhbGxvdyBjbG9uZSB0aGUgYXJyYXkgdG8gYXZvaWQgc2V0dGluZyB0aGUgZGVmYXVsdCBhcnJheVxuXHRcdFx0bmV3QXJnc1tuZXdBcmdzLmxlbmd0aCAtIDFdID0gZm9ybWF0KG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSwgYXBwUm9vdCk7XG5cdFx0XHRlbnZNaXhpblsnVlNDT0RFX1NUQUJMRSddID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAnMScgOiAnMCc7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBuZXdBcmdzLCBlbnZNaXhpbiB9O1xuXHRcdH1cblx0XHRjYXNlICdmaXNoJzoge1xuXHRcdFx0aWYgKCFvcmlnaW5hbEFyZ3MgfHwgb3JpZ2luYWxBcmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkZpc2gpO1xuXHRcdFx0fSBlbHNlIGlmIChhcmVac2hCYXNoRmlzaExvZ2luQXJncyhvcmlnaW5hbEFyZ3MpKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuRmlzaExvZ2luKTtcblx0XHRcdH0gZWxzZSBpZiAob3JpZ2luYWxBcmdzID09PSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuRmlzaCkgfHwgb3JpZ2luYWxBcmdzID09PSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuRmlzaExvZ2luKSkge1xuXHRcdFx0XHRuZXdBcmdzID0gb3JpZ2luYWxBcmdzO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXdBcmdzKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZEFyZ3MgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT24gZmlzaCwgJyRmaXNoX3VzZXJfcGF0aHMnIGlzIGFsd2F5cyBwcmVwZW5kZWQgdG8gdGhlIFBBVEgsIGZvciBib3RoIGxvZ2luIGFuZCBub24tbG9naW4gc2hlbGxzLCBzbyB3ZSBuZWVkXG5cdFx0XHQvLyB0byBhcHBseSB0aGUgcGF0aCBwcmVmaXggZml4IGFsd2F5cywgbm90IG9ubHkgZm9yIGxvZ2luIHNoZWxscyAoc2VlICMyMzIyOTEpXG5cdFx0XHRhZGRFbnZNaXhpblBhdGhQcmVmaXgob3B0aW9ucywgZW52TWl4aW4sIHNoZWxsKTtcblxuXHRcdFx0bmV3QXJncyA9IFsuLi5uZXdBcmdzXTsgLy8gU2hhbGxvdyBjbG9uZSB0aGUgYXJyYXkgdG8gYXZvaWQgc2V0dGluZyB0aGUgZGVmYXVsdCBhcnJheVxuXHRcdFx0bmV3QXJnc1tuZXdBcmdzLmxlbmd0aCAtIDFdID0gZm9ybWF0KG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSwgYXBwUm9vdCk7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBuZXdBcmdzLCBlbnZNaXhpbiB9O1xuXHRcdH1cblx0XHRjYXNlICdwd3NoJzoge1xuXHRcdFx0aWYgKCFvcmlnaW5hbEFyZ3MgfHwgYXJlUHdzaEltcGxpZWRBcmdzKG9yaWdpbmFsQXJncykpIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5Qd3NoKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJlUHdzaExvZ2luQXJncyhvcmlnaW5hbEFyZ3MpKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuUHdzaExvZ2luKTtcblx0XHRcdH1cblx0XHRcdGlmICghbmV3QXJncykge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uVW5zdXBwb3J0ZWRBcmdzIH07XG5cdFx0XHR9XG5cdFx0XHRuZXdBcmdzID0gWy4uLm5ld0FyZ3NdOyAvLyBTaGFsbG93IGNsb25lIHRoZSBhcnJheSB0byBhdm9pZCBzZXR0aW5nIHRoZSBkZWZhdWx0IGFycmF5XG5cdFx0XHRuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0gPSBmb3JtYXQobmV3QXJnc1tuZXdBcmdzLmxlbmd0aCAtIDFdLCBhcHBSb290LCAnJyk7XG5cdFx0XHRlbnZNaXhpblsnVlNDT0RFX1NUQUJMRSddID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAnMScgOiAnMCc7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBuZXdBcmdzLCBlbnZNaXhpbiB9O1xuXHRcdH1cblx0XHRjYXNlICd6c2gnOiB7XG5cdFx0XHRpZiAoIW9yaWdpbmFsQXJncyB8fCBvcmlnaW5hbEFyZ3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuWnNoKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJlWnNoQmFzaEZpc2hMb2dpbkFyZ3Mob3JpZ2luYWxBcmdzKSkge1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlpzaExvZ2luKTtcblx0XHRcdFx0YWRkRW52TWl4aW5QYXRoUHJlZml4KG9wdGlvbnMsIGVudk1peGluLCBzaGVsbCk7XG5cdFx0XHR9IGVsc2UgaWYgKG9yaWdpbmFsQXJncyA9PT0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlpzaCkgfHwgb3JpZ2luYWxBcmdzID09PSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuWnNoTG9naW4pKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBvcmlnaW5hbEFyZ3M7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW5ld0FyZ3MpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLlVuc3VwcG9ydGVkQXJncyB9O1xuXHRcdFx0fVxuXHRcdFx0bmV3QXJncyA9IFsuLi5uZXdBcmdzXTsgLy8gU2hhbGxvdyBjbG9uZSB0aGUgYXJyYXkgdG8gYXZvaWQgc2V0dGluZyB0aGUgZGVmYXVsdCBhcnJheVxuXHRcdFx0bmV3QXJnc1tuZXdBcmdzLmxlbmd0aCAtIDFdID0gZm9ybWF0KG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSwgYXBwUm9vdCk7XG5cblx0XHRcdC8vIE1vdmUgLnpzaHJjIGludG8gJFpET1RESVIgYXMgdGhlIHdheSB0byBhY3RpdmF0ZSB0aGUgc2NyaXB0XG5cdFx0XHRsZXQgdXNlcm5hbWU6IHN0cmluZztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHVzZXJuYW1lID0gb3MudXNlckluZm8oKS51c2VybmFtZTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR1c2VybmFtZSA9ICd1bmtub3duJztcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgYWN0dWFsIHRtcCBkaXJlY3Rvcnkgc28gd2UgY2FuIHNldCB0aGUgc3RpY2t5IGJpdFxuXHRcdFx0Y29uc3QgcmVhbFRtcERpciA9IHJlYWxwYXRoU3luYyhvcy50bXBkaXIoKSk7XG5cdFx0XHRjb25zdCB6ZG90ZGlyID0gcGF0aC5qb2luKHJlYWxUbXBEaXIsIGAke3VzZXJuYW1lfS0ke3Byb2R1Y3RTZXJ2aWNlLmFwcGxpY2F0aW9uTmFtZX0tenNoYCk7XG5cblx0XHRcdC8vIFNldCBkaXJlY3RvcnkgcGVybWlzc2lvbnMgdXNpbmcgb2N0YWwgbm90YXRpb246XG5cdFx0XHQvLyAtIDBvMTcwMDpcblx0XHRcdC8vIC0gU3RpY2t5IGJpdCBpcyBzZXQsIHByZXZlbnRpbmcgbm9uLW93bmVycyBmcm9tIGRlbGV0aW5nIG9yIHJlbmFtaW5nIGZpbGVzIHdpdGhpbiB0aGlzIGRpcmVjdG9yeSAoMSlcblx0XHRcdC8vIC0gT3duZXIgaGFzIGZ1bGwgcmVhZCAoNCksIHdyaXRlICgyKSwgZXhlY3V0ZSAoMSkgcGVybWlzc2lvbnNcblx0XHRcdC8vIC0gR3JvdXAgaGFzIG5vIHBlcm1pc3Npb25zICgwKVxuXHRcdFx0Ly8gLSBPdGhlcnMgaGF2ZSBubyBwZXJtaXNzaW9ucyAoMClcblx0XHRcdGlmICghc2tpcFN0aWNreUJpdCkge1xuXHRcdFx0XHQvLyBza2lwIGZvciB0ZXN0c1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNobW9kQXN5bmMgPSBwcm9taXNpZnkoY2htb2QpO1xuXHRcdFx0XHRcdGF3YWl0IGNobW9kQXN5bmMoemRvdGRpciwgMG8xNzAwKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0aWYgKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdFTk9FTlQnKSkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0bWtkaXJTeW5jKHpkb3RkaXIpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBjcmVhdGUgemRvdGRpciBhdCAke3pkb3RkaXJ9OiAke2Vycn1gKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLkZhaWxlZFRvQ3JlYXRlVG1wRGlyIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjaG1vZEFzeW5jID0gcHJvbWlzaWZ5KGNobW9kKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgY2htb2RBc3luYyh6ZG90ZGlyLCAwbzE3MDApO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBzZXQgc3RpY2t5IGJpdCBvbiAke3pkb3RkaXJ9OiAke2Vycn1gKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLkZhaWxlZFRvU2V0U3RpY2t5Qml0IH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBzZXQgc3RpY2t5IGJpdCBvbiAke3pkb3RkaXJ9OiAke2Vycn1gKTtcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uRmFpbGVkVG9TZXRTdGlja3lCaXQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZW52TWl4aW5bJ1pET1RESVInXSA9IHpkb3RkaXI7XG5cdFx0XHRjb25zdCB1c2VyWmRvdGRpciA9IGVudj8uWkRPVERJUiA/PyBvcy5ob21lZGlyKCkgPz8gYH5gO1xuXHRcdFx0ZW52TWl4aW5bJ1VTRVJfWkRPVERJUiddID0gdXNlclpkb3RkaXI7XG5cdFx0XHRjb25zdCBmaWxlc1RvQ29weTogSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb25bJ2ZpbGVzVG9Db3B5J10gPSBbXTtcblx0XHRcdGZpbGVzVG9Db3B5LnB1c2goe1xuXHRcdFx0XHRzb3VyY2U6IHBhdGguam9pbihhcHBSb290LCAnb3V0L3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi9zY3JpcHRzL3NoZWxsSW50ZWdyYXRpb24tcmMuenNoJyksXG5cdFx0XHRcdGRlc3Q6IHBhdGguam9pbih6ZG90ZGlyLCAnLnpzaHJjJylcblx0XHRcdH0pO1xuXHRcdFx0ZmlsZXNUb0NvcHkucHVzaCh7XG5cdFx0XHRcdHNvdXJjZTogcGF0aC5qb2luKGFwcFJvb3QsICdvdXQvdnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3NjcmlwdHMvc2hlbGxJbnRlZ3JhdGlvbi1wcm9maWxlLnpzaCcpLFxuXHRcdFx0XHRkZXN0OiBwYXRoLmpvaW4oemRvdGRpciwgJy56cHJvZmlsZScpXG5cdFx0XHR9KTtcblx0XHRcdGZpbGVzVG9Db3B5LnB1c2goe1xuXHRcdFx0XHRzb3VyY2U6IHBhdGguam9pbihhcHBSb290LCAnb3V0L3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi9zY3JpcHRzL3NoZWxsSW50ZWdyYXRpb24tZW52LnpzaCcpLFxuXHRcdFx0XHRkZXN0OiBwYXRoLmpvaW4oemRvdGRpciwgJy56c2hlbnYnKVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlc1RvQ29weS5wdXNoKHtcblx0XHRcdFx0c291cmNlOiBwYXRoLmpvaW4oYXBwUm9vdCwgJ291dC92cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vc2NyaXB0cy9zaGVsbEludGVncmF0aW9uLWxvZ2luLnpzaCcpLFxuXHRcdFx0XHRkZXN0OiBwYXRoLmpvaW4oemRvdGRpciwgJy56bG9naW4nKVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBuZXdBcmdzLCBlbnZNaXhpbiwgZmlsZXNUb0NvcHkgfTtcblx0XHR9XG5cdH1cblx0bG9nU2VydmljZS53YXJuKGBTaGVsbCBpbnRlZ3JhdGlvbiBjYW5ub3QgYmUgZW5hYmxlZCBmb3IgZXhlY3V0YWJsZSBcIiR7c2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZX1cIiBhbmQgYXJnc2AsIHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MpO1xuXHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uVW5zdXBwb3J0ZWRTaGVsbCB9O1xufVxuXG4vKipcbiAqIFRoZXJlIGFyZSBhIGZldyBzaXR1YXRpb25zIHdoZXJlIHNvbWUgZGlyZWN0b3JpZXMgYXJlIGFkZGVkIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIFBBVEguXG4gKiAxLiBPbiBtYWNPUyB3aGVuIHRoZSBwcm9maWxlIGNhbGxzIHBhdGhfaGVscGVyLlxuICogMi4gRm9yIGZpc2ggdGVybWluYWxzLCB3aGljaCBhbHdheXMgcHJlcGVuZCBcIiRmaXNoX3VzZXJfcGF0aHNcIiB0byB0aGUgUEFUSC5cbiAqXG4gKiBUaGlzIGNhdXNlcyBzaWduaWZpY2FudCBwcm9ibGVtcyBmb3IgdGhlIGVudmlyb25tZW50IHZhcmlhYmxlXG4gKiBjb2xsZWN0aW9uIEFQSSBhcyB0aGUgY3VzdG9tIHBhdGhzIGFkZGVkIHRvIHRoZSBlbmQgd2lsbCBub3cgYmUgc29tZXdoZXJlIGluIHRoZSBtaWRkbGUgb2ZcbiAqIHRoZSBQQVRILiBUbyBjb21iYXQgdGhpcywgVlNDT0RFX1BBVEhfUFJFRklYIGlzIHVzZWQgdG8gcmUtYXBwbHkgYW55IHByZWZpeCBhZnRlciB0aGUgcHJvZmlsZVxuICogaGFzIHJ1bi4gVGhpcyB3aWxsIGNhdXNlIGR1cGxpY2F0aW9uIGluIHRoZSBQQVRIIGJ1dCBzaG91bGQgZml4IHRoZSBpc3N1ZS5cbiAqXG4gKiBTZWUgIzk5ODc4IGZvciBtb3JlIGluZm9ybWF0aW9uLlxuICovXG5mdW5jdGlvbiBhZGRFbnZNaXhpblBhdGhQcmVmaXgob3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsIGVudk1peGluOiBJUHJvY2Vzc0Vudmlyb25tZW50LCBzaGVsbDogc3RyaW5nKTogdm9pZCB7XG5cdGlmICgoaXNNYWNpbnRvc2ggfHwgc2hlbGwgPT09ICdmaXNoJykgJiYgb3B0aW9ucy5lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMpIHtcblx0XHQvLyBEZXNlcmlhbGl6ZSBhbmQgbWVyZ2Vcblx0XHRjb25zdCBkZXNlcmlhbGl6ZWQgPSBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucyhvcHRpb25zLmVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucyk7XG5cdFx0Y29uc3QgbWVyZ2VkID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGRlc2VyaWFsaXplZCk7XG5cblx0XHQvLyBHZXQgYWxsIHByZXBlbmQgUEFUSCBlbnRyaWVzXG5cdFx0Y29uc3QgcGF0aEVudHJ5ID0gbWVyZ2VkLmdldFZhcmlhYmxlTWFwKHsgd29ya3NwYWNlRm9sZGVyOiBvcHRpb25zLndvcmtzcGFjZUZvbGRlciB9KS5nZXQoJ1BBVEgnKTtcblx0XHRjb25zdCBwcmVwZW5kVG9QYXRoOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChwYXRoRW50cnkpIHtcblx0XHRcdGZvciAoY29uc3QgbXV0YXRvciBvZiBwYXRoRW50cnkpIHtcblx0XHRcdFx0aWYgKG11dGF0b3IudHlwZSA9PT0gRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQpIHtcblx0XHRcdFx0XHRwcmVwZW5kVG9QYXRoLnB1c2gobXV0YXRvci52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgdG8gdGhlIGVudmlyb25tZW50IG1peGluIHRvIGJlIGFwcGxpZWQgaW4gdGhlIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdFxuXHRcdGlmIChwcmVwZW5kVG9QYXRoLmxlbmd0aCA+IDApIHtcblx0XHRcdGVudk1peGluWydWU0NPREVfUEFUSF9QUkVGSVgnXSA9IHByZXBlbmRUb1BhdGguam9pbignJyk7XG5cdFx0fVxuXHR9XG59XG5cbmVudW0gU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUge1xuXHRXaW5kb3dzUHdzaCA9ICd3aW5kb3dzLXB3c2gnLFxuXHRXaW5kb3dzUHdzaExvZ2luID0gJ3dpbmRvd3MtcHdzaC1sb2dpbicsXG5cdFB3c2ggPSAncHdzaCcsXG5cdFB3c2hMb2dpbiA9ICdwd3NoLWxvZ2luJyxcblx0WnNoID0gJ3pzaCcsXG5cdFpzaExvZ2luID0gJ3pzaC1sb2dpbicsXG5cdEJhc2ggPSAnYmFzaCcsXG5cdEZpc2ggPSAnZmlzaCcsXG5cdEZpc2hMb2dpbiA9ICdmaXNoLWxvZ2luJyxcbn1cblxuY29uc3Qgc2hlbGxJbnRlZ3JhdGlvbkFyZ3M6IE1hcDxTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZSwgc3RyaW5nW10+ID0gbmV3IE1hcCgpO1xuLy8gVGhlIHRyeSBjYXRjaCBzd2FsbG93cyBleGVjdXRpb24gcG9saWN5IGVycm9ycyBpbiB0aGUgY2FzZSBvZiB0aGUgYXJjaGl2ZSBkaXN0cmlidXRhYmxlXG5zaGVsbEludGVncmF0aW9uQXJncy5zZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuV2luZG93c1B3c2gsIFsnLW5vZXhpdCcsICctY29tbWFuZCcsICd0cnkgeyAuIFxcXCJ7MH1cXFxcb3V0XFxcXHZzXFxcXHdvcmtiZW5jaFxcXFxjb250cmliXFxcXHRlcm1pbmFsXFxcXGNvbW1vblxcXFxzY3JpcHRzXFxcXHNoZWxsSW50ZWdyYXRpb24ucHMxXFxcIiB9IGNhdGNoIHt9ezF9J10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLldpbmRvd3NQd3NoTG9naW4sIFsnLWwnLCAnLW5vZXhpdCcsICctY29tbWFuZCcsICd0cnkgeyAuIFxcXCJ7MH1cXFxcb3V0XFxcXHZzXFxcXHdvcmtiZW5jaFxcXFxjb250cmliXFxcXHRlcm1pbmFsXFxcXGNvbW1vblxcXFxzY3JpcHRzXFxcXHNoZWxsSW50ZWdyYXRpb24ucHMxXFxcIiB9IGNhdGNoIHt9ezF9J10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlB3c2gsIFsnLW5vZXhpdCcsICctY29tbWFuZCcsICcuIFwiezB9L291dC92cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vc2NyaXB0cy9zaGVsbEludGVncmF0aW9uLnBzMVwiezF9J10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlB3c2hMb2dpbiwgWyctbCcsICctbm9leGl0JywgJy1jb21tYW5kJywgJy4gXCJ7MH0vb3V0L3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi9zY3JpcHRzL3NoZWxsSW50ZWdyYXRpb24ucHMxXCInXSk7XG5zaGVsbEludGVncmF0aW9uQXJncy5zZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuWnNoLCBbJy1pJ10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlpzaExvZ2luLCBbJy1pbCddKTtcbnNoZWxsSW50ZWdyYXRpb25BcmdzLnNldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5CYXNoLCBbJy0taW5pdC1maWxlJywgJ3swfS9vdXQvdnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3NjcmlwdHMvc2hlbGxJbnRlZ3JhdGlvbi1iYXNoLnNoJ10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkZpc2gsIFsnLS1pbml0LWNvbW1hbmQnLCAnc291cmNlIFwiezB9L291dC92cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vc2NyaXB0cy9zaGVsbEludGVncmF0aW9uLmZpc2hcIiddKTtcbnNoZWxsSW50ZWdyYXRpb25BcmdzLnNldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5GaXNoTG9naW4sIFsnLWwnLCAnLS1pbml0LWNvbW1hbmQnLCAnc291cmNlIFwiezB9L291dC92cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vc2NyaXB0cy9zaGVsbEludGVncmF0aW9uLmZpc2hcIiddKTtcbmNvbnN0IHB3c2hMb2dpbkFyZ3MgPSBbJy1sb2dpbicsICctbCddO1xuY29uc3Qgc2hMb2dpbkFyZ3MgPSBbJy0tbG9naW4nLCAnLWwnXTtcbmNvbnN0IHNoSW50ZXJhY3RpdmVBcmdzID0gWyctaScsICctLWludGVyYWN0aXZlJ107XG5jb25zdCBwd3NoSW1wbGllZEFyZ3MgPSBbJy1ub2wnLCAnLW5vbG9nbyddO1xuXG5mdW5jdGlvbiBhcmVQd3NoTG9naW5BcmdzKG9yaWdpbmFsQXJnczogU2luZ2xlT3JNYW55PHN0cmluZz4pOiBib29sZWFuIHtcblx0aWYgKGlzU3RyaW5nKG9yaWdpbmFsQXJncykpIHtcblx0XHRyZXR1cm4gcHdzaExvZ2luQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3MudG9Mb3dlckNhc2UoKSk7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIG9yaWdpbmFsQXJncy5sZW5ndGggPT09IDEgJiYgcHdzaExvZ2luQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3NbMF0udG9Mb3dlckNhc2UoKSkgfHxcblx0XHRcdChvcmlnaW5hbEFyZ3MubGVuZ3RoID09PSAyICYmXG5cdFx0XHRcdCgoKHB3c2hMb2dpbkFyZ3MuaW5jbHVkZXMob3JpZ2luYWxBcmdzWzBdLnRvTG93ZXJDYXNlKCkpKSB8fCBwd3NoTG9naW5BcmdzLmluY2x1ZGVzKG9yaWdpbmFsQXJnc1sxXS50b0xvd2VyQ2FzZSgpKSkpXG5cdFx0XHRcdCYmICgocHdzaEltcGxpZWRBcmdzLmluY2x1ZGVzKG9yaWdpbmFsQXJnc1swXS50b0xvd2VyQ2FzZSgpKSkgfHwgcHdzaEltcGxpZWRBcmdzLmluY2x1ZGVzKG9yaWdpbmFsQXJnc1sxXS50b0xvd2VyQ2FzZSgpKSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFyZVB3c2hJbXBsaWVkQXJncyhvcmlnaW5hbEFyZ3M6IFNpbmdsZU9yTWFueTxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdGlmIChpc1N0cmluZyhvcmlnaW5hbEFyZ3MpKSB7XG5cdFx0cmV0dXJuIHB3c2hJbXBsaWVkQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3MudG9Mb3dlckNhc2UoKSk7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIG9yaWdpbmFsQXJncy5sZW5ndGggPT09IDAgfHwgb3JpZ2luYWxBcmdzPy5sZW5ndGggPT09IDEgJiYgcHdzaEltcGxpZWRBcmdzLmluY2x1ZGVzKG9yaWdpbmFsQXJnc1swXS50b0xvd2VyQ2FzZSgpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhcmVac2hCYXNoRmlzaExvZ2luQXJncyhvcmlnaW5hbEFyZ3M6IFNpbmdsZU9yTWFueTxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdGlmICghaXNTdHJpbmcob3JpZ2luYWxBcmdzKSkge1xuXHRcdG9yaWdpbmFsQXJncyA9IG9yaWdpbmFsQXJncy5maWx0ZXIoYXJnID0+ICFzaEludGVyYWN0aXZlQXJncy5pbmNsdWRlcyhhcmcudG9Mb3dlckNhc2UoKSkpO1xuXHR9XG5cdHJldHVybiBpc1N0cmluZyhvcmlnaW5hbEFyZ3MpICYmIHNoTG9naW5BcmdzLmluY2x1ZGVzKG9yaWdpbmFsQXJncy50b0xvd2VyQ2FzZSgpKVxuXHRcdHx8ICFpc1N0cmluZyhvcmlnaW5hbEFyZ3MpICYmIG9yaWdpbmFsQXJncy5sZW5ndGggPT09IDEgJiYgc2hMb2dpbkFyZ3MuaW5jbHVkZXMob3JpZ2luYWxBcmdzWzBdLnRvTG93ZXJDYXNlKCkpO1xufVxuXG4vKipcbiAqIFBhdHRlcm5zIHRoYXQgaW5kaWNhdGUgc2Vuc2l0aXZlIGVudmlyb25tZW50IHZhcmlhYmxlIG5hbWVzLlxuICovXG5jb25zdCBzZW5zaXRpdmVFbnZWYXJOYW1lcyA9IC9eKD86LipfKT8oPzpBUElfP0tFWXxUT0tFTnxTRUNSRVR8UEFTU1dPUkR8UEFTU1dEfFBXRHxDUkVERU5USUFMfEFVVEh8UFJJVkFURV8/S0VZfEFDQ0VTU18/S0VZfENMSUVOVF8/U0VDUkVUfEFQSUtFWSkoPzpfLiopPyQvaTtcblxuLyoqXG4gKiBQYXR0ZXJucyBmb3IgZGV0ZWN0aW5nIHNlY3JldCB2YWx1ZXMgaW4gZW52aXJvbm1lbnQgdmFyaWFibGVzLlxuICovXG5jb25zdCBzZWNyZXRWYWx1ZVBhdHRlcm5zID0gW1xuXHQvLyBKV1QgdG9rZW5zXG5cdC9eZXlKW2EtekEtWjAtOVxcLV9dK1xcLlthLXpBLVowLTlcXC1fXStcXC5bYS16QS1aMC05XFwtX10rJC8sXG5cdC8vIEdpdEh1YiB0b2tlbnNcblx0L15naFtwc3Vyb11fW2EtekEtWjAtOV17MzZ9JC8sXG5cdC9eZ2l0aHViX3BhdF9bYS16QS1aMC05XXsyMn1fW2EtekEtWjAtOV17NTl9JC8sXG5cdC8vIEdvb2dsZSBBUEkga2V5c1xuXHQvXkFJemFbQS1aYS16MC05X1xcLV17MzV9JC8sXG5cdC8vIFNsYWNrIHRva2Vuc1xuXHQvXnhveFtwYmFyXVxcLVtBLVphLXowLTlcXC1dKyQvLFxuXHQvLyBBenVyZS9NUyB0b2tlbnMgKGNvbW1vbiBwYXR0ZXJucylcblx0L15bYS16QS1aMC05XXszMix9JC8sXG5dO1xuXG4vKipcbiAqIFNhbml0aXplcyBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZm9yIGxvZ2dpbmcgYnkgcmVkYWN0aW5nIHNlbnNpdGl2ZSB2YWx1ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZUVudkZvckxvZ2dpbmcoZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50IHwgdW5kZWZpbmVkKTogSVByb2Nlc3NFbnZpcm9ubWVudCB8IHVuZGVmaW5lZCB7XG5cdGlmICghZW52KSB7XG5cdFx0cmV0dXJuIGVudjtcblx0fVxuXHRjb25zdCBzYW5pdGl6ZWQ6IElQcm9jZXNzRW52aXJvbm1lbnQgPSB7fTtcblx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZW52KSkge1xuXHRcdGNvbnN0IHZhbHVlID0gZW52W2tleV07XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBDaGVjayBpZiB0aGUga2V5IG5hbWUgc3VnZ2VzdHMgYSBzZW5zaXRpdmUgdmFsdWVcblx0XHRpZiAoc2Vuc2l0aXZlRW52VmFyTmFtZXMudGVzdChrZXkpKSB7XG5cdFx0XHRzYW5pdGl6ZWRba2V5XSA9ICc8UkVEQUNURUQ+Jztcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHQvLyBDaGVjayBpZiB0aGUgdmFsdWUgbWF0Y2hlcyBrbm93biBzZWNyZXQgcGF0dGVybnNcblx0XHRsZXQgaXNTZWNyZXQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2Ygc2VjcmV0VmFsdWVQYXR0ZXJucykge1xuXHRcdFx0aWYgKHBhdHRlcm4udGVzdCh2YWx1ZSkpIHtcblx0XHRcdFx0aXNTZWNyZXQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0c2FuaXRpemVkW2tleV0gPSBpc1NlY3JldCA/ICc8UkVEQUNURUQ+JyA6IHZhbHVlO1xuXHR9XG5cdHJldHVybiBzYW5pdGl6ZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxVQUFVO0FBQ3RCLFNBQThCLGFBQWEsaUJBQWlCO0FBQzVELFlBQVksYUFBYTtBQUN6QixTQUFTLGNBQWM7QUFHdkIsU0FBNEUsOENBQThDO0FBQzFILFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsaURBQWlEO0FBQzFELFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsT0FBTyxjQUFjLGlCQUFpQjtBQUMvQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUE4QjtBQUN2QyxTQUFTLGtDQUFrQztBQWdDM0MsZUFBc0IsNkJBQ3JCLG1CQUNBLFNBQ0EsS0FDQSxZQUNBLGdCQUNBLGdCQUF5QixPQUN1RDtBQUVoRixNQUFJLENBQUMsUUFBUSxpQkFBaUIsU0FBUztBQUN0QyxXQUFPLEVBQUUsTUFBTSxXQUFXLFFBQVEsdUNBQXVDLHlCQUF5QjtBQUFBLEVBQ25HO0FBRUEsTUFBSSxDQUFDLGtCQUFrQixZQUFZO0FBQ2xDLFdBQU8sRUFBRSxNQUFNLFdBQVcsUUFBUSx1Q0FBdUMsYUFBYTtBQUFBLEVBQ3ZGO0FBRUEsTUFBSSxrQkFBa0IscUJBQXFCLENBQUMsa0JBQWtCLHVCQUF1QjtBQUNwRixXQUFPLEVBQUUsTUFBTSxXQUFXLFFBQVEsdUNBQXVDLGdCQUFnQjtBQUFBLEVBQzFGO0FBRUEsTUFBSSxrQkFBa0Isd0JBQXdCO0FBQzdDLFdBQU8sRUFBRSxNQUFNLFdBQVcsUUFBUSx1Q0FBdUMsMkJBQTJCO0FBQUEsRUFDckc7QUFFQSxR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QUFNLHNCQUFzQjtBQUFBO0FBQUEsRUFFM0I7QUFBQTtBQUFBLEVBRUE7QUFBQSxFQUNBO0FBQUE7QUFBQSxFQUVBO0FBQUE7QUFBQSxFQUVBO0FBQUE7QUFBQSxFQUVBO0FBQ0Q7QUFLTyxTQUFTLHNCQUFzQixLQUF1RTtBQUM1RyxNQUFJLENBQUMsS0FBSztBQUNULFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxZQUFpQyxDQUFDO0FBQ3hDLGFBQVcsT0FBTyxPQUFPLEtBQUssR0FBRyxHQUFHO0FBQ25DLFVBQU0sUUFBUSxJQUFJLEdBQUc7QUFDckIsUUFBSSxVQUFVLFFBQVc7QUFDeEI7QUFBQSxJQUNEO0FBRUEsUUFBSSxxQkFBcUIsS0FBSyxHQUFHLEdBQUc7QUFDbkMsZ0JBQVUsR0FBRyxJQUFJO0FBQ2pCO0FBQUEsSUFDRDtBQUVBLFFBQUksV0FBVztBQUNmLGVBQVcsV0FBVyxxQkFBcUI7QUFDMUMsVUFBSSxRQUFRLEtBQUssS0FBSyxHQUFHO0FBQ3hCLG1CQUFXO0FBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLGNBQVUsR0FBRyxJQUFJLFdBQVcsZUFBZTtBQUFBLEVBQzVDO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJlcnIiLCAiU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUiXQp9Cg==
