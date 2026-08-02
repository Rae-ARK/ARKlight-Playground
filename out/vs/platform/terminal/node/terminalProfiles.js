import * as fs from "fs";
import * as cp from "child_process";
import { Codicon } from "../../../base/common/codicons.js";
import { basename, delimiter, normalize, dirname, resolve } from "../../../base/common/path.js";
import { isLinux, isWindows } from "../../../base/common/platform.js";
import { findExecutable } from "../../../base/node/processes.js";
import { hasKey, isObject, isString } from "../../../base/common/types.js";
import * as pfs from "../../../base/node/pfs.js";
import { enumeratePowerShellInstallations } from "../../../base/node/powershell.js";
import { ProfileSource, TerminalSettingId } from "../common/terminal.js";
import { getWindowsBuildNumberAsync } from "../../../base/node/windowsVersion.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2["UnixShellsPath"] = "/etc/shells";
  return Constants2;
})(Constants || {});
let profileSources;
let logIfWslNotInstalled = true;
function detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, configurationService, shellEnv = process.env, fsProvider, logService, variableResolver, testPwshSourcePaths) {
  fsProvider = fsProvider || {
    existsFile: pfs.SymlinkSupport.existsFile,
    readFile: fs.promises.readFile
  };
  if (isWindows) {
    return detectAvailableWindowsProfiles(
      includeDetectedProfiles,
      fsProvider,
      shellEnv,
      logService,
      configurationService.getValue(TerminalSettingId.UseWslProfiles) !== false,
      profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue(TerminalSettingId.ProfilesWindows),
      isString(defaultProfile) ? defaultProfile : configurationService.getValue(TerminalSettingId.DefaultProfileWindows),
      testPwshSourcePaths,
      variableResolver
    );
  }
  return detectAvailableUnixProfiles(
    fsProvider,
    logService,
    includeDetectedProfiles,
    profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue(isLinux ? TerminalSettingId.ProfilesLinux : TerminalSettingId.ProfilesMacOs),
    isString(defaultProfile) ? defaultProfile : configurationService.getValue(isLinux ? TerminalSettingId.DefaultProfileLinux : TerminalSettingId.DefaultProfileMacOs),
    testPwshSourcePaths,
    variableResolver,
    shellEnv
  );
}
async function detectAvailableWindowsProfiles(includeDetectedProfiles, fsProvider, shellEnv, logService, useWslProfiles, configProfiles, defaultProfileName, testPwshSourcePaths, variableResolver) {
  const is32ProcessOn64Windows = process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432");
  const system32Path = `${process.env["windir"]}\\${is32ProcessOn64Windows ? "Sysnative" : "System32"}`;
  const allowWslDiscovery = await getWindowsBuildNumberAsync() >= 19041;
  await initializeWindowsProfiles(testPwshSourcePaths);
  const detectedProfiles = /* @__PURE__ */ new Map();
  if (includeDetectedProfiles) {
    detectedProfiles.set("PowerShell", {
      source: ProfileSource.Pwsh,
      icon: Codicon.terminalPowershell,
      isAutoDetected: true
    });
    detectedProfiles.set("Windows PowerShell", {
      path: `${system32Path}\\WindowsPowerShell\\v1.0\\powershell.exe`,
      icon: Codicon.terminalPowershell,
      isAutoDetected: true
    });
    detectedProfiles.set("Git Bash", {
      source: ProfileSource.GitBash,
      icon: Codicon.terminalGitBash,
      isAutoDetected: true
    });
    detectedProfiles.set("Command Prompt", {
      path: `${system32Path}\\cmd.exe`,
      icon: Codicon.terminalCmd,
      isAutoDetected: true
    });
    detectedProfiles.set("Cygwin", {
      path: [
        { path: `${process.env["HOMEDRIVE"]}\\cygwin64\\bin\\bash.exe`, isUnsafe: true },
        { path: `${process.env["HOMEDRIVE"]}\\cygwin\\bin\\bash.exe`, isUnsafe: true }
      ],
      args: ["--login"],
      isAutoDetected: true
    });
    detectedProfiles.set("bash (MSYS2)", {
      path: [
        { path: `${process.env["HOMEDRIVE"]}\\msys64\\usr\\bin\\bash.exe`, isUnsafe: true }
      ],
      args: ["--login", "-i"],
      // CHERE_INVOKING retains current working directory
      env: { CHERE_INVOKING: "1" },
      icon: Codicon.terminalBash,
      isAutoDetected: true
    });
    const cmderPath = `${process.env["CMDER_ROOT"] || `${process.env["HOMEDRIVE"]}\\cmder`}\\vendor\\bin\\vscode_init.cmd`;
    detectedProfiles.set("Cmder", {
      path: `${system32Path}\\cmd.exe`,
      args: ["/K", cmderPath],
      // The path is safe if it was derived from CMDER_ROOT
      requiresPath: process.env["CMDER_ROOT"] ? cmderPath : { path: cmderPath, isUnsafe: true },
      isAutoDetected: true
    });
  }
  applyConfigProfilesToMap(configProfiles, detectedProfiles);
  const resultProfiles = await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
  if (includeDetectedProfiles && useWslProfiles && allowWslDiscovery) {
    try {
      const result = await getWslProfiles(`${system32Path}\\wsl.exe`, defaultProfileName);
      for (const wslProfile of result) {
        if (!configProfiles || !Object.prototype.hasOwnProperty.call(configProfiles, wslProfile.profileName)) {
          resultProfiles.push(wslProfile);
        }
      }
    } catch (e) {
      if (logIfWslNotInstalled) {
        logService?.trace("WSL is not installed, so could not detect WSL profiles");
        logIfWslNotInstalled = false;
      }
    }
  }
  return resultProfiles;
}
async function transformToTerminalProfiles(entries, defaultProfileName, fsProvider, shellEnv = process.env, logService, variableResolver) {
  const promises = [];
  for (const [profileName, profile] of entries) {
    promises.push(getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv, logService, variableResolver));
  }
  return (await Promise.all(promises)).filter((e) => !!e);
}
async function getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv = process.env, logService, variableResolver) {
  if (profile === null) {
    return void 0;
  }
  let originalPaths;
  let args;
  let icon = void 0;
  if (hasKey(profile, { source: true })) {
    const source = profileSources?.get(profile.source);
    if (!source) {
      return void 0;
    }
    originalPaths = source.paths;
    args = profile.args || source.args;
    if (profile.icon) {
      icon = validateIcon(profile.icon);
    } else if (source.icon) {
      icon = source.icon;
    }
  } else {
    originalPaths = Array.isArray(profile.path) ? profile.path : [profile.path];
    args = isWindows ? profile.args : Array.isArray(profile.args) ? profile.args : void 0;
    icon = validateIcon(profile.icon);
  }
  let paths;
  if (variableResolver) {
    const mapped = originalPaths.map((e) => isString(e) ? e : e.path);
    const resolved = await variableResolver(mapped);
    paths = new Array(originalPaths.length);
    for (let i = 0; i < originalPaths.length; i++) {
      if (isString(originalPaths[i])) {
        paths[i] = resolved[i];
      } else {
        paths[i] = {
          path: resolved[i],
          isUnsafe: true
        };
      }
    }
  } else {
    paths = originalPaths.slice();
  }
  let requiresUnsafePath;
  if (profile.requiresPath) {
    let actualRequiredPath;
    if (isString(profile.requiresPath)) {
      actualRequiredPath = profile.requiresPath;
    } else {
      actualRequiredPath = profile.requiresPath.path;
      if (profile.requiresPath.isUnsafe) {
        requiresUnsafePath = actualRequiredPath;
      }
    }
    const result = await fsProvider.existsFile(actualRequiredPath);
    if (!result) {
      return;
    }
  }
  const validatedProfile = await validateProfilePaths(profileName, defaultProfileName, paths, fsProvider, shellEnv, args, profile.env, profile.overrideName, profile.isAutoDetected, requiresUnsafePath);
  if (!validatedProfile) {
    logService?.debug("Terminal profile not validated", profileName, originalPaths);
    return void 0;
  }
  validatedProfile.isAutoDetected = profile.isAutoDetected;
  validatedProfile.icon = icon;
  validatedProfile.color = profile.color;
  return validatedProfile;
}
function validateIcon(icon) {
  if (isString(icon)) {
    return { id: icon };
  }
  return icon;
}
async function initializeWindowsProfiles(testPwshSourcePaths) {
  if (profileSources && !testPwshSourcePaths) {
    return;
  }
  const [gitBashPaths, pwshPaths] = await Promise.all([getGitBashPaths(), testPwshSourcePaths || getPowershellPaths()]);
  profileSources = /* @__PURE__ */ new Map();
  profileSources.set(
    ProfileSource.GitBash,
    {
      profileName: "Git Bash",
      paths: gitBashPaths,
      args: ["--login", "-i"]
    }
  );
  profileSources.set(ProfileSource.Pwsh, {
    profileName: "PowerShell",
    paths: pwshPaths,
    icon: Codicon.terminalPowershell
  });
}
async function getGitBashPaths() {
  const gitDirs = /* @__PURE__ */ new Set();
  const gitExePath = await findExecutable("git.exe");
  if (gitExePath) {
    const gitExeDir = dirname(gitExePath);
    gitDirs.add(resolve(gitExeDir, "../.."));
  }
  function addTruthy(set, value) {
    if (value) {
      set.add(value);
    }
  }
  addTruthy(gitDirs, process.env["ProgramW6432"]);
  addTruthy(gitDirs, process.env["ProgramFiles"]);
  addTruthy(gitDirs, process.env["ProgramFiles(X86)"]);
  addTruthy(gitDirs, `${process.env["LocalAppData"]}\\Program`);
  const gitBashPaths = [];
  for (const gitDir of gitDirs) {
    gitBashPaths.push(
      `${gitDir}\\Git\\bin\\bash.exe`,
      `${gitDir}\\Git\\usr\\bin\\bash.exe`,
      `${gitDir}\\usr\\bin\\bash.exe`
      // using Git for Windows SDK
    );
  }
  gitBashPaths.push(`${process.env["UserProfile"]}\\scoop\\apps\\git\\current\\bin\\bash.exe`);
  gitBashPaths.push(`${process.env["UserProfile"]}\\scoop\\apps\\git-with-openssh\\current\\bin\\bash.exe`);
  return gitBashPaths;
}
async function getPowershellPaths() {
  const paths = [];
  for await (const pwshExe of enumeratePowerShellInstallations()) {
    paths.push(pwshExe.exePath);
  }
  return paths;
}
async function getWslProfiles(wslPath, defaultProfileName) {
  const profiles = [];
  const distroOutput = await new Promise((resolve2, reject) => {
    cp.exec("wsl.exe -l -q", { encoding: "utf16le", env: { ...process.env, WSL_UTF8: "0" }, timeout: 1e3 }, (err, stdout) => {
      if (err) {
        return reject("Problem occurred when getting wsl distros");
      }
      resolve2(stdout);
    });
  });
  if (!distroOutput) {
    return [];
  }
  const distroNames = distroOutput.split(/\r?\n/).filter((t) => t.trim().length > 0);
  for (const distroName of distroNames) {
    if (distroName === "") {
      continue;
    }
    if (distroName.startsWith("docker-desktop")) {
      continue;
    }
    const profileName = `${distroName} (WSL)`;
    const profile = {
      profileName,
      path: wslPath,
      args: [`-d`, `${distroName}`],
      isDefault: profileName === defaultProfileName,
      icon: getWslIcon(distroName),
      isAutoDetected: false
    };
    profiles.push(profile);
  }
  return profiles;
}
function getWslIcon(distroName) {
  if (distroName.includes("Ubuntu")) {
    return Codicon.terminalUbuntu;
  } else if (distroName.includes("Debian")) {
    return Codicon.terminalDebian;
  } else {
    return Codicon.terminalLinux;
  }
}
async function detectAvailableUnixProfiles(fsProvider, logService, includeDetectedProfiles, configProfiles, defaultProfileName, testPaths, variableResolver, shellEnv) {
  const detectedProfiles = /* @__PURE__ */ new Map();
  if (includeDetectedProfiles && await fsProvider.existsFile("/etc/shells" /* UnixShellsPath */)) {
    const contents = (await fsProvider.readFile("/etc/shells" /* UnixShellsPath */)).toString();
    const profiles = (testPaths || contents.split("\n")).map((e) => {
      const index = e.indexOf("#");
      return index === -1 ? e : e.substring(0, index);
    }).filter((e) => e.trim().length > 0);
    const counts = /* @__PURE__ */ new Map();
    for (const profile of profiles) {
      let profileName = basename(profile);
      let count = counts.get(profileName) || 0;
      count++;
      if (count > 1) {
        profileName = `${profileName} (${count})`;
      }
      counts.set(profileName, count);
      detectedProfiles.set(profileName, { path: profile, isAutoDetected: true });
    }
  }
  applyConfigProfilesToMap(configProfiles, detectedProfiles);
  return await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
}
function applyConfigProfilesToMap(configProfiles, profilesMap) {
  if (!configProfiles) {
    return;
  }
  for (const [profileName, value] of Object.entries(configProfiles)) {
    if (value === null || !isObject(value) || !hasKey(value, { path: true }) && !hasKey(value, { source: true })) {
      profilesMap.delete(profileName);
    } else {
      value.icon = value.icon || profilesMap.get(profileName)?.icon;
      profilesMap.set(profileName, value);
    }
  }
}
async function validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected, requiresUnsafePath) {
  if (potentialPaths.length === 0) {
    return Promise.resolve(void 0);
  }
  const path = potentialPaths.shift();
  if (path === "") {
    return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
  }
  const isUnsafePath = !isString(path) && path.isUnsafe;
  const actualPath = isString(path) ? path : path.path;
  const profile = {
    profileName,
    path: actualPath,
    args,
    env,
    overrideName,
    isAutoDetected,
    isDefault: profileName === defaultProfileName,
    isUnsafePath,
    requiresUnsafePath
  };
  if (basename(actualPath) === actualPath) {
    const envPaths = shellEnv.PATH ? shellEnv.PATH.split(delimiter) : void 0;
    const executable = await findExecutable(actualPath, void 0, envPaths, void 0, fsProvider.existsFile);
    if (!executable) {
      return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args);
    }
    profile.path = executable;
    profile.isFromPath = true;
    return profile;
  }
  const result = await fsProvider.existsFile(normalize(actualPath));
  if (result) {
    return profile;
  }
  return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
}
export {
  detectAvailableProfiles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvdGVybWluYWxQcm9maWxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkZWxpbWl0ZXIsIG5vcm1hbGl6ZSwgZGlybmFtZSwgcmVzb2x2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZmluZEV4ZWN1dGFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcHJvY2Vzc2VzLmpzJztcbmltcG9ydCB7IGhhc0tleSwgaXNPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIHBmcyBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGVudW1lcmF0ZVBvd2VyU2hlbGxJbnN0YWxsYXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bvd2Vyc2hlbGwuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEVudmlyb25tZW50LCBJVGVybWluYWxFeGVjdXRhYmxlLCBJVGVybWluYWxQcm9maWxlLCBJVGVybWluYWxQcm9maWxlU291cmNlLCBJVGVybWluYWxVbnNhZmVQYXRoLCBQcm9maWxlU291cmNlLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3dzQnVpbGROdW1iZXJBc3luYyB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS93aW5kb3dzVmVyc2lvbi5qcyc7XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0VW5peFNoZWxsc1BhdGggPSAnL2V0Yy9zaGVsbHMnXG59XG5cbmxldCBwcm9maWxlU291cmNlczogTWFwPHN0cmluZywgSVBvdGVudGlhbFRlcm1pbmFsUHJvZmlsZT4gfCB1bmRlZmluZWQ7XG5sZXQgbG9nSWZXc2xOb3RJbnN0YWxsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuXG5leHBvcnQgZnVuY3Rpb24gZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXMoXG5cdHByb2ZpbGVzOiB1bmtub3duLFxuXHRkZWZhdWx0UHJvZmlsZTogdW5rbm93bixcblx0aW5jbHVkZURldGVjdGVkUHJvZmlsZXM6IGJvb2xlYW4sXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdHNoZWxsRW52OiB0eXBlb2YgcHJvY2Vzcy5lbnYgPSBwcm9jZXNzLmVudixcblx0ZnNQcm92aWRlcj86IElGc1Byb3ZpZGVyLFxuXHRsb2dTZXJ2aWNlPzogSUxvZ1NlcnZpY2UsXG5cdHZhcmlhYmxlUmVzb2x2ZXI/OiAodGV4dDogc3RyaW5nW10pID0+IFByb21pc2U8c3RyaW5nW10+LFxuXHR0ZXN0UHdzaFNvdXJjZVBhdGhzPzogc3RyaW5nW11cbik6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdGZzUHJvdmlkZXIgPSBmc1Byb3ZpZGVyIHx8IHtcblx0XHRleGlzdHNGaWxlOiBwZnMuU3ltbGlua1N1cHBvcnQuZXhpc3RzRmlsZSxcblx0XHRyZWFkRmlsZTogZnMucHJvbWlzZXMucmVhZEZpbGVcblx0fTtcblx0aWYgKGlzV2luZG93cykge1xuXHRcdHJldHVybiBkZXRlY3RBdmFpbGFibGVXaW5kb3dzUHJvZmlsZXMoXG5cdFx0XHRpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlcyxcblx0XHRcdGZzUHJvdmlkZXIsXG5cdFx0XHRzaGVsbEVudixcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5Vc2VXc2xQcm9maWxlcykgIT09IGZhbHNlLFxuXHRcdFx0cHJvZmlsZXMgJiYgaXNPYmplY3QocHJvZmlsZXMpID8geyAuLi5wcm9maWxlcyB9IDogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBba2V5OiBzdHJpbmddOiBJVW5yZXNvbHZlZFRlcm1pbmFsUHJvZmlsZSB9PihUZXJtaW5hbFNldHRpbmdJZC5Qcm9maWxlc1dpbmRvd3MpLFxuXHRcdFx0aXNTdHJpbmcoZGVmYXVsdFByb2ZpbGUpID8gZGVmYXVsdFByb2ZpbGUgOiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KFRlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRQcm9maWxlV2luZG93cyksXG5cdFx0XHR0ZXN0UHdzaFNvdXJjZVBhdGhzLFxuXHRcdFx0dmFyaWFibGVSZXNvbHZlclxuXHRcdCk7XG5cdH1cblx0cmV0dXJuIGRldGVjdEF2YWlsYWJsZVVuaXhQcm9maWxlcyhcblx0XHRmc1Byb3ZpZGVyLFxuXHRcdGxvZ1NlcnZpY2UsXG5cdFx0aW5jbHVkZURldGVjdGVkUHJvZmlsZXMsXG5cdFx0cHJvZmlsZXMgJiYgaXNPYmplY3QocHJvZmlsZXMpID8geyAuLi5wcm9maWxlcyB9IDogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBba2V5OiBzdHJpbmddOiBJVW5yZXNvbHZlZFRlcm1pbmFsUHJvZmlsZSB9Pihpc0xpbnV4ID8gVGVybWluYWxTZXR0aW5nSWQuUHJvZmlsZXNMaW51eCA6IFRlcm1pbmFsU2V0dGluZ0lkLlByb2ZpbGVzTWFjT3MpLFxuXHRcdGlzU3RyaW5nKGRlZmF1bHRQcm9maWxlKSA/IGRlZmF1bHRQcm9maWxlIDogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihpc0xpbnV4ID8gVGVybWluYWxTZXR0aW5nSWQuRGVmYXVsdFByb2ZpbGVMaW51eCA6IFRlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRQcm9maWxlTWFjT3MpLFxuXHRcdHRlc3RQd3NoU291cmNlUGF0aHMsXG5cdFx0dmFyaWFibGVSZXNvbHZlcixcblx0XHRzaGVsbEVudlxuXHQpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZXRlY3RBdmFpbGFibGVXaW5kb3dzUHJvZmlsZXMoXG5cdGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzOiBib29sZWFuLFxuXHRmc1Byb3ZpZGVyOiBJRnNQcm92aWRlcixcblx0c2hlbGxFbnY6IHR5cGVvZiBwcm9jZXNzLmVudixcblx0bG9nU2VydmljZT86IElMb2dTZXJ2aWNlLFxuXHR1c2VXc2xQcm9maWxlcz86IGJvb2xlYW4sXG5cdGNvbmZpZ1Byb2ZpbGVzPzogeyBba2V5OiBzdHJpbmddOiBJVW5yZXNvbHZlZFRlcm1pbmFsUHJvZmlsZSB9LFxuXHRkZWZhdWx0UHJvZmlsZU5hbWU/OiBzdHJpbmcsXG5cdHRlc3RQd3NoU291cmNlUGF0aHM/OiBzdHJpbmdbXSxcblx0dmFyaWFibGVSZXNvbHZlcj86ICh0ZXh0OiBzdHJpbmdbXSkgPT4gUHJvbWlzZTxzdHJpbmdbXT5cbik6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdC8vIERldGVybWluZSB0aGUgY29ycmVjdCBTeXN0ZW0zMiBwYXRoLiBXZSB3YW50IHRvIHBvaW50IHRvIFN5c25hdGl2ZVxuXHQvLyB3aGVuIHRoZSAzMi1iaXQgdmVyc2lvbiBvZiBWUyBDb2RlIGlzIHJ1bm5pbmcgb24gYSA2NC1iaXQgbWFjaGluZS5cblx0Ly8gVGhlIHJlYXNvbiBmb3IgdGhpcyBpcyBiZWNhdXNlIFBvd2VyU2hlbGwncyBpbXBvcnRhbnQgUFNSZWFkbGluZVxuXHQvLyBtb2R1bGUgZG9lc24ndCB3b3JrIGlmIHRoaXMgaXMgbm90IHRoZSBjYXNlLiBTZWUgIzI3OTE1LlxuXHRjb25zdCBpczMyUHJvY2Vzc09uNjRXaW5kb3dzID0gcHJvY2Vzcy5lbnYuaGFzT3duUHJvcGVydHkoJ1BST0NFU1NPUl9BUkNISVRFVzY0MzInKTtcblx0Y29uc3Qgc3lzdGVtMzJQYXRoID0gYCR7cHJvY2Vzcy5lbnZbJ3dpbmRpciddfVxcXFwke2lzMzJQcm9jZXNzT242NFdpbmRvd3MgPyAnU3lzbmF0aXZlJyA6ICdTeXN0ZW0zMid9YDtcblxuXHQvLyBXU0wgMiByZWxlYXNlZCBpbiB0aGUgTWF5IDIwMjAgVXBkYXRlLCB0aGlzIGlzIHdoZXJlIHRoZSBgLWRgIGZsYWcgd2FzIGFkZGVkIHRoYXQgd2UgZGVwZW5kXG5cdC8vIHVwb25cblx0Y29uc3QgYWxsb3dXc2xEaXNjb3ZlcnkgPSBhd2FpdCBnZXRXaW5kb3dzQnVpbGROdW1iZXJBc3luYygpID49IDE5MDQxO1xuXG5cdGF3YWl0IGluaXRpYWxpemVXaW5kb3dzUHJvZmlsZXModGVzdFB3c2hTb3VyY2VQYXRocyk7XG5cblx0Y29uc3QgZGV0ZWN0ZWRQcm9maWxlczogTWFwPHN0cmluZywgSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGU+ID0gbmV3IE1hcCgpO1xuXG5cdC8vIEFkZCBhdXRvIGRldGVjdGVkIHByb2ZpbGVzXG5cdGlmIChpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlcykge1xuXHRcdGRldGVjdGVkUHJvZmlsZXMuc2V0KCdQb3dlclNoZWxsJywge1xuXHRcdFx0c291cmNlOiBQcm9maWxlU291cmNlLlB3c2gsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsUG93ZXJzaGVsbCxcblx0XHRcdGlzQXV0b0RldGVjdGVkOiB0cnVlXG5cdFx0fSk7XG5cdFx0ZGV0ZWN0ZWRQcm9maWxlcy5zZXQoJ1dpbmRvd3MgUG93ZXJTaGVsbCcsIHtcblx0XHRcdHBhdGg6IGAke3N5c3RlbTMyUGF0aH1cXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZWAsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsUG93ZXJzaGVsbCxcblx0XHRcdGlzQXV0b0RldGVjdGVkOiB0cnVlXG5cdFx0fSk7XG5cdFx0ZGV0ZWN0ZWRQcm9maWxlcy5zZXQoJ0dpdCBCYXNoJywge1xuXHRcdFx0c291cmNlOiBQcm9maWxlU291cmNlLkdpdEJhc2gsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsR2l0QmFzaCxcblx0XHRcdGlzQXV0b0RldGVjdGVkOiB0cnVlXG5cdFx0fSk7XG5cdFx0ZGV0ZWN0ZWRQcm9maWxlcy5zZXQoJ0NvbW1hbmQgUHJvbXB0Jywge1xuXHRcdFx0cGF0aDogYCR7c3lzdGVtMzJQYXRofVxcXFxjbWQuZXhlYCxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWxDbWQsXG5cdFx0XHRpc0F1dG9EZXRlY3RlZDogdHJ1ZVxuXHRcdH0pO1xuXHRcdGRldGVjdGVkUHJvZmlsZXMuc2V0KCdDeWd3aW4nLCB7XG5cdFx0XHRwYXRoOiBbXG5cdFx0XHRcdHsgcGF0aDogYCR7cHJvY2Vzcy5lbnZbJ0hPTUVEUklWRSddfVxcXFxjeWd3aW42NFxcXFxiaW5cXFxcYmFzaC5leGVgLCBpc1Vuc2FmZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHBhdGg6IGAke3Byb2Nlc3MuZW52WydIT01FRFJJVkUnXX1cXFxcY3lnd2luXFxcXGJpblxcXFxiYXNoLmV4ZWAsIGlzVW5zYWZlOiB0cnVlIH1cblx0XHRcdF0sXG5cdFx0XHRhcmdzOiBbJy0tbG9naW4nXSxcblx0XHRcdGlzQXV0b0RldGVjdGVkOiB0cnVlXG5cdFx0fSk7XG5cdFx0ZGV0ZWN0ZWRQcm9maWxlcy5zZXQoJ2Jhc2ggKE1TWVMyKScsIHtcblx0XHRcdHBhdGg6IFtcblx0XHRcdFx0eyBwYXRoOiBgJHtwcm9jZXNzLmVudlsnSE9NRURSSVZFJ119XFxcXG1zeXM2NFxcXFx1c3JcXFxcYmluXFxcXGJhc2guZXhlYCwgaXNVbnNhZmU6IHRydWUgfSxcblx0XHRcdF0sXG5cdFx0XHRhcmdzOiBbJy0tbG9naW4nLCAnLWknXSxcblx0XHRcdC8vIENIRVJFX0lOVk9LSU5HIHJldGFpbnMgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeVxuXHRcdFx0ZW52OiB7IENIRVJFX0lOVk9LSU5HOiAnMScgfSxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWxCYXNoLFxuXHRcdFx0aXNBdXRvRGV0ZWN0ZWQ6IHRydWVcblx0XHR9KTtcblx0XHRjb25zdCBjbWRlclBhdGggPSBgJHtwcm9jZXNzLmVudlsnQ01ERVJfUk9PVCddIHx8IGAke3Byb2Nlc3MuZW52WydIT01FRFJJVkUnXX1cXFxcY21kZXJgfVxcXFx2ZW5kb3JcXFxcYmluXFxcXHZzY29kZV9pbml0LmNtZGA7XG5cdFx0ZGV0ZWN0ZWRQcm9maWxlcy5zZXQoJ0NtZGVyJywge1xuXHRcdFx0cGF0aDogYCR7c3lzdGVtMzJQYXRofVxcXFxjbWQuZXhlYCxcblx0XHRcdGFyZ3M6IFsnL0snLCBjbWRlclBhdGhdLFxuXHRcdFx0Ly8gVGhlIHBhdGggaXMgc2FmZSBpZiBpdCB3YXMgZGVyaXZlZCBmcm9tIENNREVSX1JPT1Rcblx0XHRcdHJlcXVpcmVzUGF0aDogcHJvY2Vzcy5lbnZbJ0NNREVSX1JPT1QnXSA/IGNtZGVyUGF0aCA6IHsgcGF0aDogY21kZXJQYXRoLCBpc1Vuc2FmZTogdHJ1ZSB9LFxuXHRcdFx0aXNBdXRvRGV0ZWN0ZWQ6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFwcGx5Q29uZmlnUHJvZmlsZXNUb01hcChjb25maWdQcm9maWxlcywgZGV0ZWN0ZWRQcm9maWxlcyk7XG5cblx0Y29uc3QgcmVzdWx0UHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXSA9IGF3YWl0IHRyYW5zZm9ybVRvVGVybWluYWxQcm9maWxlcyhkZXRlY3RlZFByb2ZpbGVzLmVudHJpZXMoKSwgZGVmYXVsdFByb2ZpbGVOYW1lLCBmc1Byb3ZpZGVyLCBzaGVsbEVudiwgbG9nU2VydmljZSwgdmFyaWFibGVSZXNvbHZlcik7XG5cblx0aWYgKGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzICYmIHVzZVdzbFByb2ZpbGVzICYmIGFsbG93V3NsRGlzY292ZXJ5KSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFdzbFByb2ZpbGVzKGAke3N5c3RlbTMyUGF0aH1cXFxcd3NsLmV4ZWAsIGRlZmF1bHRQcm9maWxlTmFtZSk7XG5cdFx0XHRmb3IgKGNvbnN0IHdzbFByb2ZpbGUgb2YgcmVzdWx0KSB7XG5cdFx0XHRcdGlmICghY29uZmlnUHJvZmlsZXMgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjb25maWdQcm9maWxlcywgd3NsUHJvZmlsZS5wcm9maWxlTmFtZSkpIHtcblx0XHRcdFx0XHRyZXN1bHRQcm9maWxlcy5wdXNoKHdzbFByb2ZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKGxvZ0lmV3NsTm90SW5zdGFsbGVkKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2U/LnRyYWNlKCdXU0wgaXMgbm90IGluc3RhbGxlZCwgc28gY291bGQgbm90IGRldGVjdCBXU0wgcHJvZmlsZXMnKTtcblx0XHRcdFx0bG9nSWZXc2xOb3RJbnN0YWxsZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0UHJvZmlsZXM7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRyYW5zZm9ybVRvVGVybWluYWxQcm9maWxlcyhcblx0ZW50cmllczogSXRlcmFibGVJdGVyYXRvcjxbc3RyaW5nLCBJVW5yZXNvbHZlZFRlcm1pbmFsUHJvZmlsZV0+LFxuXHRkZWZhdWx0UHJvZmlsZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0ZnNQcm92aWRlcjogSUZzUHJvdmlkZXIsXG5cdHNoZWxsRW52OiB0eXBlb2YgcHJvY2Vzcy5lbnYgPSBwcm9jZXNzLmVudixcblx0bG9nU2VydmljZT86IElMb2dTZXJ2aWNlLFxuXHR2YXJpYWJsZVJlc29sdmVyPzogKHRleHQ6IHN0cmluZ1tdKSA9PiBQcm9taXNlPHN0cmluZ1tdPixcbik6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0Zm9yIChjb25zdCBbcHJvZmlsZU5hbWUsIHByb2ZpbGVdIG9mIGVudHJpZXMpIHtcblx0XHRwcm9taXNlcy5wdXNoKGdldFZhbGlkYXRlZFByb2ZpbGUocHJvZmlsZU5hbWUsIHByb2ZpbGUsIGRlZmF1bHRQcm9maWxlTmFtZSwgZnNQcm92aWRlciwgc2hlbGxFbnYsIGxvZ1NlcnZpY2UsIHZhcmlhYmxlUmVzb2x2ZXIpKTtcblx0fVxuXHRyZXR1cm4gKGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKSkuZmlsdGVyKGUgPT4gISFlKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0VmFsaWRhdGVkUHJvZmlsZShcblx0cHJvZmlsZU5hbWU6IHN0cmluZyxcblx0cHJvZmlsZTogSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGUsXG5cdGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRmc1Byb3ZpZGVyOiBJRnNQcm92aWRlcixcblx0c2hlbGxFbnY6IHR5cGVvZiBwcm9jZXNzLmVudiA9IHByb2Nlc3MuZW52LFxuXHRsb2dTZXJ2aWNlPzogSUxvZ1NlcnZpY2UsXG5cdHZhcmlhYmxlUmVzb2x2ZXI/OiAodGV4dDogc3RyaW5nW10pID0+IFByb21pc2U8c3RyaW5nW10+XG4pOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0aWYgKHByb2ZpbGUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBvcmlnaW5hbFBhdGhzOiAoc3RyaW5nIHwgSVRlcm1pbmFsVW5zYWZlUGF0aClbXTtcblx0bGV0IGFyZ3M6IHN0cmluZ1tdIHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgaWNvbjogVGhlbWVJY29uIHwgVVJJIHwgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Ly8gdXNlIGNhbGN1bGF0ZWQgdmFsdWVzIGlmIHBhdGggaXMgbm90IHNwZWNpZmllZFxuXHRpZiAoaGFzS2V5KHByb2ZpbGUsIHsgc291cmNlOiB0cnVlIH0pKSB7XG5cdFx0Y29uc3Qgc291cmNlID0gcHJvZmlsZVNvdXJjZXM/LmdldChwcm9maWxlLnNvdXJjZSk7XG5cdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdG9yaWdpbmFsUGF0aHMgPSBzb3VyY2UucGF0aHM7XG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgY29uZmlndXJlZCBhcmdzLCBvdmVycmlkZSB0aGUgZGVmYXVsdCBvbmVzXG5cdFx0YXJncyA9IHByb2ZpbGUuYXJncyB8fCBzb3VyY2UuYXJncztcblx0XHRpZiAocHJvZmlsZS5pY29uKSB7XG5cdFx0XHRpY29uID0gdmFsaWRhdGVJY29uKHByb2ZpbGUuaWNvbik7XG5cdFx0fSBlbHNlIGlmIChzb3VyY2UuaWNvbikge1xuXHRcdFx0aWNvbiA9IHNvdXJjZS5pY29uO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRvcmlnaW5hbFBhdGhzID0gQXJyYXkuaXNBcnJheShwcm9maWxlLnBhdGgpID8gcHJvZmlsZS5wYXRoIDogW3Byb2ZpbGUucGF0aF07XG5cdFx0YXJncyA9IGlzV2luZG93cyA/IHByb2ZpbGUuYXJncyA6IEFycmF5LmlzQXJyYXkocHJvZmlsZS5hcmdzKSA/IHByb2ZpbGUuYXJncyA6IHVuZGVmaW5lZDtcblx0XHRpY29uID0gdmFsaWRhdGVJY29uKHByb2ZpbGUuaWNvbik7XG5cdH1cblxuXHRsZXQgcGF0aHM6IChzdHJpbmcgfCBJVGVybWluYWxVbnNhZmVQYXRoKVtdO1xuXHRpZiAodmFyaWFibGVSZXNvbHZlcikge1xuXHRcdC8vIENvbnZlcnQgdG8gc3RyaW5nW10gZm9yIHJlc29sdmVcblx0XHRjb25zdCBtYXBwZWQgPSBvcmlnaW5hbFBhdGhzLm1hcChlID0+IGlzU3RyaW5nKGUpID8gZSA6IGUucGF0aCk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHZhcmlhYmxlUmVzb2x2ZXIobWFwcGVkKTtcblx0XHQvLyBDb252ZXJ0IHJlc29sdmVkIGJhY2sgdG8gKFQgfCBzdHJpbmcpW11cblx0XHRwYXRocyA9IG5ldyBBcnJheShvcmlnaW5hbFBhdGhzLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvcmlnaW5hbFBhdGhzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoaXNTdHJpbmcob3JpZ2luYWxQYXRoc1tpXSkpIHtcblx0XHRcdFx0cGF0aHNbaV0gPSByZXNvbHZlZFtpXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhdGhzW2ldID0ge1xuXHRcdFx0XHRcdHBhdGg6IHJlc29sdmVkW2ldLFxuXHRcdFx0XHRcdGlzVW5zYWZlOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHBhdGhzID0gb3JpZ2luYWxQYXRocy5zbGljZSgpO1xuXHR9XG5cblx0bGV0IHJlcXVpcmVzVW5zYWZlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpZiAocHJvZmlsZS5yZXF1aXJlc1BhdGgpIHtcblx0XHQvLyBWYWxpZGF0ZSByZXF1aXJlc1BhdGggZXhpc3RzXG5cdFx0bGV0IGFjdHVhbFJlcXVpcmVkUGF0aDogc3RyaW5nO1xuXHRcdGlmIChpc1N0cmluZyhwcm9maWxlLnJlcXVpcmVzUGF0aCkpIHtcblx0XHRcdGFjdHVhbFJlcXVpcmVkUGF0aCA9IHByb2ZpbGUucmVxdWlyZXNQYXRoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3R1YWxSZXF1aXJlZFBhdGggPSBwcm9maWxlLnJlcXVpcmVzUGF0aC5wYXRoO1xuXHRcdFx0aWYgKHByb2ZpbGUucmVxdWlyZXNQYXRoLmlzVW5zYWZlKSB7XG5cdFx0XHRcdHJlcXVpcmVzVW5zYWZlUGF0aCA9IGFjdHVhbFJlcXVpcmVkUGF0aDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZnNQcm92aWRlci5leGlzdHNGaWxlKGFjdHVhbFJlcXVpcmVkUGF0aCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRjb25zdCB2YWxpZGF0ZWRQcm9maWxlID0gYXdhaXQgdmFsaWRhdGVQcm9maWxlUGF0aHMocHJvZmlsZU5hbWUsIGRlZmF1bHRQcm9maWxlTmFtZSwgcGF0aHMsIGZzUHJvdmlkZXIsIHNoZWxsRW52LCBhcmdzLCBwcm9maWxlLmVudiwgcHJvZmlsZS5vdmVycmlkZU5hbWUsIHByb2ZpbGUuaXNBdXRvRGV0ZWN0ZWQsIHJlcXVpcmVzVW5zYWZlUGF0aCk7XG5cdGlmICghdmFsaWRhdGVkUHJvZmlsZSkge1xuXHRcdGxvZ1NlcnZpY2U/LmRlYnVnKCdUZXJtaW5hbCBwcm9maWxlIG5vdCB2YWxpZGF0ZWQnLCBwcm9maWxlTmFtZSwgb3JpZ2luYWxQYXRocyk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHZhbGlkYXRlZFByb2ZpbGUuaXNBdXRvRGV0ZWN0ZWQgPSBwcm9maWxlLmlzQXV0b0RldGVjdGVkO1xuXHR2YWxpZGF0ZWRQcm9maWxlLmljb24gPSBpY29uO1xuXHR2YWxpZGF0ZWRQcm9maWxlLmNvbG9yID0gcHJvZmlsZS5jb2xvcjtcblx0cmV0dXJuIHZhbGlkYXRlZFByb2ZpbGU7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlSWNvbihpY29uOiBzdHJpbmcgfCBUZXJtaW5hbEljb24gfCB1bmRlZmluZWQpOiBUZXJtaW5hbEljb24gfCB1bmRlZmluZWQge1xuXHRpZiAoaXNTdHJpbmcoaWNvbikpIHtcblx0XHRyZXR1cm4geyBpZDogaWNvbiB9O1xuXHR9XG5cdHJldHVybiBpY29uO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbml0aWFsaXplV2luZG93c1Byb2ZpbGVzKHRlc3RQd3NoU291cmNlUGF0aHM/OiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAocHJvZmlsZVNvdXJjZXMgJiYgIXRlc3RQd3NoU291cmNlUGF0aHMpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBbZ2l0QmFzaFBhdGhzLCBwd3NoUGF0aHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2dldEdpdEJhc2hQYXRocygpLCB0ZXN0UHdzaFNvdXJjZVBhdGhzIHx8IGdldFBvd2Vyc2hlbGxQYXRocygpXSk7XG5cblx0cHJvZmlsZVNvdXJjZXMgPSBuZXcgTWFwKCk7XG5cdHByb2ZpbGVTb3VyY2VzLnNldChcblx0XHRQcm9maWxlU291cmNlLkdpdEJhc2gsIHtcblx0XHRwcm9maWxlTmFtZTogJ0dpdCBCYXNoJyxcblx0XHRwYXRoczogZ2l0QmFzaFBhdGhzLFxuXHRcdGFyZ3M6IFsnLS1sb2dpbicsICctaSddXG5cdH0pO1xuXHRwcm9maWxlU291cmNlcy5zZXQoUHJvZmlsZVNvdXJjZS5Qd3NoLCB7XG5cdFx0cHJvZmlsZU5hbWU6ICdQb3dlclNoZWxsJyxcblx0XHRwYXRoczogcHdzaFBhdGhzLFxuXHRcdGljb246IENvZGljb24udGVybWluYWxQb3dlcnNoZWxsXG5cdH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRHaXRCYXNoUGF0aHMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRjb25zdCBnaXREaXJzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuXHQvLyBMb29rIGZvciBnaXQuZXhlIG9uIHRoZSBQQVRIIGFuZCB1c2UgdGhhdCBpZiBmb3VuZC4gZ2l0LmV4ZSBpcyBsb2NhdGVkIGF0XG5cdC8vIGA8aW5zdGFsbGRpcj4vY21kL2dpdC5leGVgLiBUaGlzIGlzIG5vdCBhbiB1bnNhZmUgbG9jYXRpb24gYmVjYXVzZSB0aGUgZ2l0IGV4ZWN1dGFibGUgaXNcblx0Ly8gbG9jYXRlZCBvbiB0aGUgUEFUSCB3aGljaCBpcyBvbmx5IGNvbnRyb2xsZWQgYnkgdGhlIHVzZXIvYWRtaW4uXG5cdGNvbnN0IGdpdEV4ZVBhdGggPSBhd2FpdCBmaW5kRXhlY3V0YWJsZSgnZ2l0LmV4ZScpO1xuXHRpZiAoZ2l0RXhlUGF0aCkge1xuXHRcdGNvbnN0IGdpdEV4ZURpciA9IGRpcm5hbWUoZ2l0RXhlUGF0aCk7XG5cdFx0Z2l0RGlycy5hZGQocmVzb2x2ZShnaXRFeGVEaXIsICcuLi8uLicpKTtcblx0fVxuXHRmdW5jdGlvbiBhZGRUcnV0aHk8VD4oc2V0OiBTZXQ8VD4sIHZhbHVlOiBUIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRzZXQuYWRkKHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBBZGQgY29tbW9uIGdpdCBpbnN0YWxsIGxvY2F0aW9uc1xuXHRhZGRUcnV0aHkoZ2l0RGlycywgcHJvY2Vzcy5lbnZbJ1Byb2dyYW1XNjQzMiddKTtcblx0YWRkVHJ1dGh5KGdpdERpcnMsIHByb2Nlc3MuZW52WydQcm9ncmFtRmlsZXMnXSk7XG5cdGFkZFRydXRoeShnaXREaXJzLCBwcm9jZXNzLmVudlsnUHJvZ3JhbUZpbGVzKFg4NiknXSk7XG5cdGFkZFRydXRoeShnaXREaXJzLCBgJHtwcm9jZXNzLmVudlsnTG9jYWxBcHBEYXRhJ119XFxcXFByb2dyYW1gKTtcblxuXHRjb25zdCBnaXRCYXNoUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgZ2l0RGlyIG9mIGdpdERpcnMpIHtcblx0XHRnaXRCYXNoUGF0aHMucHVzaChcblx0XHRcdGAke2dpdERpcn1cXFxcR2l0XFxcXGJpblxcXFxiYXNoLmV4ZWAsXG5cdFx0XHRgJHtnaXREaXJ9XFxcXEdpdFxcXFx1c3JcXFxcYmluXFxcXGJhc2guZXhlYCxcblx0XHRcdGAke2dpdERpcn1cXFxcdXNyXFxcXGJpblxcXFxiYXNoLmV4ZWAgLy8gdXNpbmcgR2l0IGZvciBXaW5kb3dzIFNES1xuXHRcdCk7XG5cdH1cblxuXHQvLyBBZGQgc3BlY2lhbCBpbnN0YWxscyB0aGF0IGRvbid0IGZvbGxvdyB0aGUgc3RhbmRhcmQgZGlyZWN0b3J5IHN0cnVjdHVyZVxuXHRnaXRCYXNoUGF0aHMucHVzaChgJHtwcm9jZXNzLmVudlsnVXNlclByb2ZpbGUnXX1cXFxcc2Nvb3BcXFxcYXBwc1xcXFxnaXRcXFxcY3VycmVudFxcXFxiaW5cXFxcYmFzaC5leGVgKTtcblx0Z2l0QmFzaFBhdGhzLnB1c2goYCR7cHJvY2Vzcy5lbnZbJ1VzZXJQcm9maWxlJ119XFxcXHNjb29wXFxcXGFwcHNcXFxcZ2l0LXdpdGgtb3BlbnNzaFxcXFxjdXJyZW50XFxcXGJpblxcXFxiYXNoLmV4ZWApO1xuXG5cdHJldHVybiBnaXRCYXNoUGF0aHM7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFBvd2Vyc2hlbGxQYXRocygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdGNvbnN0IHBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHQvLyBBZGQgYWxsIG9mIHRoZSBkaWZmZXJlbnQga2luZHMgb2YgUG93ZXJTaGVsbHNcblx0Zm9yIGF3YWl0IChjb25zdCBwd3NoRXhlIG9mIGVudW1lcmF0ZVBvd2VyU2hlbGxJbnN0YWxsYXRpb25zKCkpIHtcblx0XHRwYXRocy5wdXNoKHB3c2hFeGUuZXhlUGF0aCk7XG5cdH1cblx0cmV0dXJuIHBhdGhzO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRXc2xQcm9maWxlcyh3c2xQYXRoOiBzdHJpbmcsIGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlW10+IHtcblx0Y29uc3QgcHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXSA9IFtdO1xuXHRjb25zdCBkaXN0cm9PdXRwdXQgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHQvLyB3c2wuZXhlIG91dHB1dCBpcyBlbmNvZGVkIGluIHV0ZjE2bGUgKGllLiBBIC0+IDB4NDEwMCkgYnkgZGVmYXVsdCwgZm9yY2UgaXQgaW4gY2FzZSB0aGVcblx0XHQvLyB1c2VyIGNoYW5nZWQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3NjI1M1xuXHRcdGNwLmV4ZWMoJ3dzbC5leGUgLWwgLXEnLCB7IGVuY29kaW5nOiAndXRmMTZsZScsIGVudjogeyAuLi5wcm9jZXNzLmVudiwgV1NMX1VURjg6ICcwJyB9LCB0aW1lb3V0OiAxMDAwIH0sIChlcnIsIHN0ZG91dCkgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRyZXR1cm4gcmVqZWN0KCdQcm9ibGVtIG9jY3VycmVkIHdoZW4gZ2V0dGluZyB3c2wgZGlzdHJvcycpO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdH0pO1xuXHR9KTtcblx0aWYgKCFkaXN0cm9PdXRwdXQpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgZGlzdHJvTmFtZXMgPSBkaXN0cm9PdXRwdXQuc3BsaXQoL1xccj9cXG4vKS5maWx0ZXIodCA9PiB0LnRyaW0oKS5sZW5ndGggPiAwKTtcblx0Zm9yIChjb25zdCBkaXN0cm9OYW1lIG9mIGRpc3Ryb05hbWVzKSB7XG5cdFx0Ly8gU2tpcCBlbXB0eSBsaW5lc1xuXHRcdGlmIChkaXN0cm9OYW1lID09PSAnJykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gZG9ja2VyLWRlc2t0b3AgYW5kIGRvY2tlci1kZXNrdG9wLWRhdGEgYXJlIHRyZWF0ZWQgYXMgaW1wbGVtZW50YXRpb24gZGV0YWlscyBvZlxuXHRcdC8vIERvY2tlciBEZXNrdG9wIGZvciBXaW5kb3dzIGFuZCB0aGVyZWZvcmUgbm90IGV4cG9zZWRcblx0XHRpZiAoZGlzdHJvTmFtZS5zdGFydHNXaXRoKCdkb2NrZXItZGVza3RvcCcpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgdGhlIHByb2ZpbGUsIGFkZGluZyB0aGUgaWNvbiBkZXBlbmRpbmcgb24gdGhlIGRpc3Ryb1xuXHRcdGNvbnN0IHByb2ZpbGVOYW1lID0gYCR7ZGlzdHJvTmFtZX0gKFdTTClgO1xuXHRcdGNvbnN0IHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUgPSB7XG5cdFx0XHRwcm9maWxlTmFtZSxcblx0XHRcdHBhdGg6IHdzbFBhdGgsXG5cdFx0XHRhcmdzOiBbYC1kYCwgYCR7ZGlzdHJvTmFtZX1gXSxcblx0XHRcdGlzRGVmYXVsdDogcHJvZmlsZU5hbWUgPT09IGRlZmF1bHRQcm9maWxlTmFtZSxcblx0XHRcdGljb246IGdldFdzbEljb24oZGlzdHJvTmFtZSksXG5cdFx0XHRpc0F1dG9EZXRlY3RlZDogZmFsc2Vcblx0XHR9O1xuXHRcdC8vIEFkZCB0aGUgcHJvZmlsZVxuXHRcdHByb2ZpbGVzLnB1c2gocHJvZmlsZSk7XG5cdH1cblx0cmV0dXJuIHByb2ZpbGVzO1xufVxuXG5mdW5jdGlvbiBnZXRXc2xJY29uKGRpc3Ryb05hbWU6IHN0cmluZyk6IFRoZW1lSWNvbiB7XG5cdGlmIChkaXN0cm9OYW1lLmluY2x1ZGVzKCdVYnVudHUnKSkge1xuXHRcdHJldHVybiBDb2RpY29uLnRlcm1pbmFsVWJ1bnR1O1xuXHR9IGVsc2UgaWYgKGRpc3Ryb05hbWUuaW5jbHVkZXMoJ0RlYmlhbicpKSB7XG5cdFx0cmV0dXJuIENvZGljb24udGVybWluYWxEZWJpYW47XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIENvZGljb24udGVybWluYWxMaW51eDtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBkZXRlY3RBdmFpbGFibGVVbml4UHJvZmlsZXMoXG5cdGZzUHJvdmlkZXI6IElGc1Byb3ZpZGVyLFxuXHRsb2dTZXJ2aWNlPzogSUxvZ1NlcnZpY2UsXG5cdGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzPzogYm9vbGVhbixcblx0Y29uZmlnUHJvZmlsZXM/OiB7IFtrZXk6IHN0cmluZ106IElVbnJlc29sdmVkVGVybWluYWxQcm9maWxlIH0sXG5cdGRlZmF1bHRQcm9maWxlTmFtZT86IHN0cmluZyxcblx0dGVzdFBhdGhzPzogc3RyaW5nW10sXG5cdHZhcmlhYmxlUmVzb2x2ZXI/OiAodGV4dDogc3RyaW5nW10pID0+IFByb21pc2U8c3RyaW5nW10+LFxuXHRzaGVsbEVudj86IHR5cGVvZiBwcm9jZXNzLmVudlxuKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlW10+IHtcblx0Y29uc3QgZGV0ZWN0ZWRQcm9maWxlczogTWFwPHN0cmluZywgSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGU+ID0gbmV3IE1hcCgpO1xuXG5cdC8vIEFkZCBub24tcXVpY2sgbGF1bmNoIHByb2ZpbGVzXG5cdGlmIChpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlcyAmJiBhd2FpdCBmc1Byb3ZpZGVyLmV4aXN0c0ZpbGUoQ29uc3RhbnRzLlVuaXhTaGVsbHNQYXRoKSkge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gKGF3YWl0IGZzUHJvdmlkZXIucmVhZEZpbGUoQ29uc3RhbnRzLlVuaXhTaGVsbHNQYXRoKSkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwcm9maWxlcyA9IChcblx0XHRcdCh0ZXN0UGF0aHMgfHwgY29udGVudHMuc3BsaXQoJ1xcbicpKVxuXHRcdFx0XHQubWFwKGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gZS5pbmRleE9mKCcjJyk7XG5cdFx0XHRcdFx0cmV0dXJuIGluZGV4ID09PSAtMSA/IGUgOiBlLnN1YnN0cmluZygwLCBpbmRleCk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5maWx0ZXIoZSA9PiBlLnRyaW0oKS5sZW5ndGggPiAwKVxuXHRcdCk7XG5cdFx0Y29uc3QgY291bnRzOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiBwcm9maWxlcykge1xuXHRcdFx0bGV0IHByb2ZpbGVOYW1lID0gYmFzZW5hbWUocHJvZmlsZSk7XG5cdFx0XHRsZXQgY291bnQgPSBjb3VudHMuZ2V0KHByb2ZpbGVOYW1lKSB8fCAwO1xuXHRcdFx0Y291bnQrKztcblx0XHRcdGlmIChjb3VudCA+IDEpIHtcblx0XHRcdFx0cHJvZmlsZU5hbWUgPSBgJHtwcm9maWxlTmFtZX0gKCR7Y291bnR9KWA7XG5cdFx0XHR9XG5cdFx0XHRjb3VudHMuc2V0KHByb2ZpbGVOYW1lLCBjb3VudCk7XG5cdFx0XHRkZXRlY3RlZFByb2ZpbGVzLnNldChwcm9maWxlTmFtZSwgeyBwYXRoOiBwcm9maWxlLCBpc0F1dG9EZXRlY3RlZDogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRhcHBseUNvbmZpZ1Byb2ZpbGVzVG9NYXAoY29uZmlnUHJvZmlsZXMsIGRldGVjdGVkUHJvZmlsZXMpO1xuXG5cdHJldHVybiBhd2FpdCB0cmFuc2Zvcm1Ub1Rlcm1pbmFsUHJvZmlsZXMoZGV0ZWN0ZWRQcm9maWxlcy5lbnRyaWVzKCksIGRlZmF1bHRQcm9maWxlTmFtZSwgZnNQcm92aWRlciwgc2hlbGxFbnYsIGxvZ1NlcnZpY2UsIHZhcmlhYmxlUmVzb2x2ZXIpO1xufVxuXG5mdW5jdGlvbiBhcHBseUNvbmZpZ1Byb2ZpbGVzVG9NYXAoY29uZmlnUHJvZmlsZXM6IHsgW2tleTogc3RyaW5nXTogSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGUgfSB8IHVuZGVmaW5lZCwgcHJvZmlsZXNNYXA6IE1hcDxzdHJpbmcsIElVbnJlc29sdmVkVGVybWluYWxQcm9maWxlPikge1xuXHRpZiAoIWNvbmZpZ1Byb2ZpbGVzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGZvciAoY29uc3QgW3Byb2ZpbGVOYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnUHJvZmlsZXMpKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8ICFpc09iamVjdCh2YWx1ZSkgfHwgKCFoYXNLZXkodmFsdWUsIHsgcGF0aDogdHJ1ZSB9KSAmJiAhaGFzS2V5KHZhbHVlLCB7IHNvdXJjZTogdHJ1ZSB9KSkpIHtcblx0XHRcdHByb2ZpbGVzTWFwLmRlbGV0ZShwcm9maWxlTmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbHVlLmljb24gPSB2YWx1ZS5pY29uIHx8IHByb2ZpbGVzTWFwLmdldChwcm9maWxlTmFtZSk/Lmljb247XG5cdFx0XHRwcm9maWxlc01hcC5zZXQocHJvZmlsZU5hbWUsIHZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGVQcm9maWxlUGF0aHMocHJvZmlsZU5hbWU6IHN0cmluZywgZGVmYXVsdFByb2ZpbGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBvdGVudGlhbFBhdGhzOiAoc3RyaW5nIHwgSVRlcm1pbmFsVW5zYWZlUGF0aClbXSwgZnNQcm92aWRlcjogSUZzUHJvdmlkZXIsIHNoZWxsRW52OiB0eXBlb2YgcHJvY2Vzcy5lbnYsIGFyZ3M/OiBzdHJpbmdbXSB8IHN0cmluZywgZW52PzogSVRlcm1pbmFsRW52aXJvbm1lbnQsIG92ZXJyaWRlTmFtZT86IGJvb2xlYW4sIGlzQXV0b0RldGVjdGVkPzogYm9vbGVhbiwgcmVxdWlyZXNVbnNhZmVQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkPiB7XG5cdGlmIChwb3RlbnRpYWxQYXRocy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblx0Y29uc3QgcGF0aCA9IHBvdGVudGlhbFBhdGhzLnNoaWZ0KCkhO1xuXHRpZiAocGF0aCA9PT0gJycpIHtcblx0XHRyZXR1cm4gdmFsaWRhdGVQcm9maWxlUGF0aHMocHJvZmlsZU5hbWUsIGRlZmF1bHRQcm9maWxlTmFtZSwgcG90ZW50aWFsUGF0aHMsIGZzUHJvdmlkZXIsIHNoZWxsRW52LCBhcmdzLCBlbnYsIG92ZXJyaWRlTmFtZSwgaXNBdXRvRGV0ZWN0ZWQpO1xuXHR9XG5cdGNvbnN0IGlzVW5zYWZlUGF0aCA9ICFpc1N0cmluZyhwYXRoKSAmJiBwYXRoLmlzVW5zYWZlO1xuXHRjb25zdCBhY3R1YWxQYXRoID0gaXNTdHJpbmcocGF0aCkgPyBwYXRoIDogcGF0aC5wYXRoO1xuXG5cdGNvbnN0IHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUgPSB7XG5cdFx0cHJvZmlsZU5hbWUsXG5cdFx0cGF0aDogYWN0dWFsUGF0aCxcblx0XHRhcmdzLFxuXHRcdGVudixcblx0XHRvdmVycmlkZU5hbWUsXG5cdFx0aXNBdXRvRGV0ZWN0ZWQsXG5cdFx0aXNEZWZhdWx0OiBwcm9maWxlTmFtZSA9PT0gZGVmYXVsdFByb2ZpbGVOYW1lLFxuXHRcdGlzVW5zYWZlUGF0aCxcblx0XHRyZXF1aXJlc1Vuc2FmZVBhdGhcblx0fTtcblxuXHQvLyBGb3Igbm9uLWFic29sdXRlIHBhdGhzLCBjaGVjayBpZiBpdCdzIGF2YWlsYWJsZSBvbiAkUEFUSFxuXHRpZiAoYmFzZW5hbWUoYWN0dWFsUGF0aCkgPT09IGFjdHVhbFBhdGgpIHtcblx0XHQvLyBUaGUgZXhlY3V0YWJsZSBpc24ndCBhbiBhYnNvbHV0ZSBwYXRoLCB0cnkgZmluZCBpdCBvbiB0aGUgUEFUSFxuXHRcdGNvbnN0IGVudlBhdGhzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCA9IHNoZWxsRW52LlBBVEggPyBzaGVsbEVudi5QQVRILnNwbGl0KGRlbGltaXRlcikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXhlY3V0YWJsZSA9IGF3YWl0IGZpbmRFeGVjdXRhYmxlKGFjdHVhbFBhdGgsIHVuZGVmaW5lZCwgZW52UGF0aHMsIHVuZGVmaW5lZCwgZnNQcm92aWRlci5leGlzdHNGaWxlKTtcblx0XHRpZiAoIWV4ZWN1dGFibGUpIHtcblx0XHRcdHJldHVybiB2YWxpZGF0ZVByb2ZpbGVQYXRocyhwcm9maWxlTmFtZSwgZGVmYXVsdFByb2ZpbGVOYW1lLCBwb3RlbnRpYWxQYXRocywgZnNQcm92aWRlciwgc2hlbGxFbnYsIGFyZ3MpO1xuXHRcdH1cblx0XHRwcm9maWxlLnBhdGggPSBleGVjdXRhYmxlO1xuXHRcdHByb2ZpbGUuaXNGcm9tUGF0aCA9IHRydWU7XG5cdFx0cmV0dXJuIHByb2ZpbGU7XG5cdH1cblxuXHRjb25zdCByZXN1bHQgPSBhd2FpdCBmc1Byb3ZpZGVyLmV4aXN0c0ZpbGUobm9ybWFsaXplKGFjdHVhbFBhdGgpKTtcblx0aWYgKHJlc3VsdCkge1xuXHRcdHJldHVybiBwcm9maWxlO1xuXHR9XG5cblx0cmV0dXJuIHZhbGlkYXRlUHJvZmlsZVBhdGhzKHByb2ZpbGVOYW1lLCBkZWZhdWx0UHJvZmlsZU5hbWUsIHBvdGVudGlhbFBhdGhzLCBmc1Byb3ZpZGVyLCBzaGVsbEVudiwgYXJncywgZW52LCBvdmVycmlkZU5hbWUsIGlzQXV0b0RldGVjdGVkKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRnNQcm92aWRlciB7XG5cdGV4aXN0c0ZpbGUocGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcblx0cmVhZEZpbGUocGF0aDogc3RyaW5nKTogUHJvbWlzZTxCdWZmZXI+O1xufVxuXG5pbnRlcmZhY2UgSVBvdGVudGlhbFRlcm1pbmFsUHJvZmlsZSB7XG5cdHByb2ZpbGVOYW1lOiBzdHJpbmc7XG5cdHBhdGhzOiBzdHJpbmdbXTtcblx0YXJncz86IHN0cmluZ1tdO1xuXHRpY29uPzogVGhlbWVJY29uIHwgVVJJIHwgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfTtcbn1cblxuZXhwb3J0IHR5cGUgSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGUgPSBJVGVybWluYWxFeGVjdXRhYmxlIHwgSVRlcm1pbmFsUHJvZmlsZVNvdXJjZSB8IG51bGw7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsV0FBVyxXQUFXLFNBQVMsZUFBZTtBQUNqRSxTQUFTLFNBQVMsaUJBQWlCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsUUFBUSxVQUFVLGdCQUFnQjtBQUUzQyxZQUFZLFNBQVM7QUFDckIsU0FBUyx3Q0FBd0M7QUFHakQsU0FBbUgsZUFBNkIseUJBQXlCO0FBRXpLLFNBQVMsa0NBQWtDO0FBRTNDLElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUNDLEVBQUFBLFdBQUEsb0JBQWlCO0FBRFAsU0FBQUE7QUFBQSxHQUFBO0FBSVgsSUFBSTtBQUNKLElBQUksdUJBQWdDO0FBRTdCLFNBQVMsd0JBQ2YsVUFDQSxnQkFDQSx5QkFDQSxzQkFDQSxXQUErQixRQUFRLEtBQ3ZDLFlBQ0EsWUFDQSxrQkFDQSxxQkFDOEI7QUFDOUIsZUFBYSxjQUFjO0FBQUEsSUFDMUIsWUFBWSxJQUFJLGVBQWU7QUFBQSxJQUMvQixVQUFVLEdBQUcsU0FBUztBQUFBLEVBQ3ZCO0FBQ0EsTUFBSSxXQUFXO0FBQ2QsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNB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Y0FBYyxHQUFHO0FBQ2xFLFFBQUksVUFBVSxRQUFRLENBQUMsU0FBUyxLQUFLLEtBQU0sQ0FBQyxPQUFPLE9BQU8sRUFBRSxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUMsR0FBSTtBQUMvRyxrQkFBWSxPQUFPLFdBQVc7QUFBQSxJQUMvQixPQUFPO0FBQ04sWUFBTSxPQUFPLE1BQU0sUUFBUSxZQUFZLElBQUksV0FBVyxHQUFHO0FBQ3pELGtCQUFZLElBQUksYUFBYSxLQUFLO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxlQUFlLHFCQUFxQixhQUFxQixvQkFBd0MsZ0JBQWtELFlBQXlCLFVBQThCLE1BQTBCLEtBQTRCLGNBQXdCLGdCQUEwQixvQkFBb0U7QUFDclgsTUFBSSxlQUFlLFdBQVcsR0FBRztBQUNoQyxXQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsRUFDakM7QUFDQSxRQUFNLE9BQU8sZUFBZSxNQUFNO0FBQ2xDLE1BQUksU0FBUyxJQUFJO0FBQ2hCLFdBQU8scUJBQXFCLGFBQWEsb0JBQW9CLGdCQUFnQixZQUFZLFVBQVUsTUFBTSxLQUFLLGNBQWMsY0FBYztBQUFBLEVBQzNJO0FBQ0EsUUFBTSxlQUFlLENBQUMsU0FBUyxJQUFJLEtBQUssS0FBSztBQUM3QyxRQUFNLGFBQWEsU0FBUyxJQUFJLElBQUksT0FBTyxLQUFLO0FBRWhELFFBQU0sVUFBNEI7QUFBQSxJQUNqQztBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLFdBQVcsZ0JBQWdCO0FBQUEsSUFDM0I7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUdBLE1BQUksU0FBUyxVQUFVLE1BQU0sWUFBWTtBQUV4QyxVQUFNLFdBQWlDLFNBQVMsT0FBTyxTQUFTLEtBQUssTUFBTSxTQUFTLElBQUk7QUFDeEYsVUFBTSxhQUFhLE1BQU0sZUFBZSxZQUFZLFFBQVcsVUFBVSxRQUFXLFdBQVcsVUFBVTtBQUN6RyxRQUFJLENBQUMsWUFBWTtBQUNoQixhQUFPLHFCQUFxQixhQUFhLG9CQUFvQixnQkFBZ0IsWUFBWSxVQUFVLElBQUk7QUFBQSxJQUN4RztBQUNBLFlBQVEsT0FBTztBQUNmLFlBQVEsYUFBYTtBQUNyQixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sU0FBUyxNQUFNLFdBQVcsV0FBVyxVQUFVLFVBQVUsQ0FBQztBQUNoRSxNQUFJLFFBQVE7QUFDWCxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8scUJBQXFCLGFBQWEsb0JBQW9CLGdCQUFnQixZQUFZLFVBQVUsTUFBTSxLQUFLLGNBQWMsY0FBYztBQUMzSTsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIiwgInJlc29sdmUiXQp9Cg==
