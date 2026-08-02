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
import * as cp from "child_process";
import { memoize } from "../../../base/common/decorators.js";
import { FileAccess } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import * as env from "../../../base/common/platform.js";
import { sanitizeProcessEnvironment } from "../../../base/common/processes.js";
import * as pfs from "../../../base/node/pfs.js";
import * as processes from "../../../base/node/processes.js";
import * as nls from "../../../nls.js";
import { DEFAULT_TERMINAL_OSX } from "../common/externalTerminal.js";
const TERMINAL_TITLE = nls.localize("console.title", "VS Code Console");
class ExternalTerminalService {
  async getDefaultTerminalForPlatforms() {
    return {
      windows: WindowsExternalTerminalService.getDefaultTerminalWindows(),
      linux: await LinuxExternalTerminalService.getDefaultTerminalLinuxReady(),
      osx: DEFAULT_TERMINAL_OSX
    };
  }
}
const _WindowsExternalTerminalService = class _WindowsExternalTerminalService extends ExternalTerminalService {
  openTerminal(configuration, cwd) {
    return this.spawnTerminal(cp, configuration, processes.getWindowsShell(), cwd);
  }
  spawnTerminal(spawner, configuration, command, cwd) {
    const exec = configuration.windowsExec || _WindowsExternalTerminalService.getDefaultTerminalWindows();
    if (cwd && cwd[1] === ":") {
      cwd = cwd[0].toUpperCase() + cwd.substr(1);
    }
    const basename = path.basename(exec, ".exe").toLowerCase();
    if (basename === "cmder") {
      spawner.spawn(exec, cwd ? [cwd] : void 0);
      return Promise.resolve(void 0);
    }
    const cmdArgs = ["/c", "start", "/wait"];
    if (exec.indexOf(" ") >= 0) {
      cmdArgs.push(exec);
    }
    cmdArgs.push(exec);
    if (basename === "wt") {
      cmdArgs.push("-d .");
    }
    return new Promise((c, e) => {
      const env2 = getSanitizedEnvironment(process);
      const child = spawner.spawn(command, cmdArgs, { cwd, env: env2, detached: true });
      child.on("error", e);
      child.on("exit", () => c());
    });
  }
  async runInTerminal(title, dir, args, envVars, settings) {
    const exec = settings.windowsExec || _WindowsExternalTerminalService.getDefaultTerminalWindows();
    const wt = await _WindowsExternalTerminalService.getWtExePath();
    return new Promise((resolve, reject) => {
      const title2 = `"${dir} - ${TERMINAL_TITLE}"`;
      const command = `"${args.join('" "')}" & pause`;
      const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
      Object.keys(env2).filter((v) => env2[v] === null).forEach((key) => delete env2[key]);
      const options = {
        cwd: dir,
        env: env2,
        windowsVerbatimArguments: true
      };
      let spawnExec;
      let cmdArgs;
      if (path.basename(exec, ".exe") === "wt") {
        spawnExec = exec;
        cmdArgs = ["-d", ".", _WindowsExternalTerminalService.CMD, "/c", command];
      } else if (wt) {
        spawnExec = wt;
        cmdArgs = ["-d", ".", exec, "/c", command];
      } else {
        spawnExec = _WindowsExternalTerminalService.CMD;
        cmdArgs = ["/c", "start", title2, "/wait", exec, "/c", `"${command}"`];
      }
      const cmd = cp.spawn(spawnExec, cmdArgs, options);
      cmd.on("error", (err) => {
        reject(improveError(err));
      });
      resolve(void 0);
    });
  }
  static getDefaultTerminalWindows() {
    if (!_WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS) {
      const isWoW64 = !!process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432");
      _WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS = `${process.env.windir ? process.env.windir : "C:\\Windows"}\\${isWoW64 ? "Sysnative" : "System32"}\\cmd.exe`;
    }
    return _WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS;
  }
  static async getWtExePath() {
    try {
      return await processes.findExecutable("wt");
    } catch {
      return void 0;
    }
  }
};
_WindowsExternalTerminalService.CMD = "cmd.exe";
__decorateClass([
  memoize
], _WindowsExternalTerminalService, "getWtExePath", 1);
let WindowsExternalTerminalService = _WindowsExternalTerminalService;
const _MacExternalTerminalService = class _MacExternalTerminalService extends ExternalTerminalService {
  // osascript is the AppleScript interpreter on OS X
  openTerminal(configuration, cwd) {
    return this.spawnTerminal(cp, configuration, cwd);
  }
  runInTerminal(title, dir, args, envVars, settings) {
    const terminalApp = settings.osxExec || DEFAULT_TERMINAL_OSX;
    return new Promise((resolve, reject) => {
      if (terminalApp === DEFAULT_TERMINAL_OSX || terminalApp === "iTerm.app") {
        const script = terminalApp === DEFAULT_TERMINAL_OSX ? "TerminalHelper" : "iTermHelper";
        const scriptpath = FileAccess.asFileUri(`vs/workbench/contrib/externalTerminal/node/${script}.scpt`).fsPath;
        const osaArgs = [
          scriptpath,
          "-t",
          title || TERMINAL_TITLE,
          "-w",
          dir
        ];
        for (const a of args) {
          osaArgs.push("-a");
          osaArgs.push(a);
        }
        if (envVars) {
          const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
          for (const key in env2) {
            const value = env2[key];
            if (value === null) {
              osaArgs.push("-u");
              osaArgs.push(key);
            } else {
              osaArgs.push("-e");
              osaArgs.push(`${key}=${value}`);
            }
          }
        }
        const osa = cp.spawn(_MacExternalTerminalService.OSASCRIPT, osaArgs);
        setupSpawnErrorHandling(osa, resolve, reject, terminalApp);
      } else if (terminalApp === "Ghostty.app") {
        const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
        const openArgs = ["-na", "Ghostty.app", "--args"];
        openArgs.push("--working-directory=" + dir);
        openArgs.push("--wait-after-command=true");
        openArgs.push("-e", ...args);
        const cmd = cp.spawn("/usr/bin/open", openArgs, { env: env2 });
        setupSpawnErrorHandling(cmd, resolve, reject, terminalApp);
      } else {
        reject(new Error(nls.localize("mac.terminal.type.not.supported", "'{0}' not supported", terminalApp)));
      }
    });
  }
  spawnTerminal(spawner, configuration, cwd) {
    const terminalApp = configuration.osxExec || DEFAULT_TERMINAL_OSX;
    return new Promise((c, e) => {
      const args = ["-a", terminalApp];
      if (cwd) {
        args.push(cwd);
      }
      const env2 = getSanitizedEnvironment(process);
      const child = spawner.spawn("/usr/bin/open", args, { cwd, env: env2 });
      child.on("error", e);
      child.on("exit", () => c());
    });
  }
};
_MacExternalTerminalService.OSASCRIPT = "/usr/bin/osascript";
let MacExternalTerminalService = _MacExternalTerminalService;
const _LinuxExternalTerminalService = class _LinuxExternalTerminalService extends ExternalTerminalService {
  openTerminal(configuration, cwd) {
    return this.spawnTerminal(cp, configuration, cwd);
  }
  runInTerminal(title, dir, args, envVars, settings) {
    const execPromise = settings.linuxExec ? Promise.resolve(settings.linuxExec) : _LinuxExternalTerminalService.getDefaultTerminalLinuxReady();
    return new Promise((resolve, reject) => {
      execPromise.then((exec) => {
        const basename = path.basename(exec).toLowerCase();
        if (basename === "ghostty") {
          const ghosttyArgs = [];
          if (dir) {
            ghosttyArgs.push(`--working-directory=${dir}`);
          }
          ghosttyArgs.push("--wait-after-command=true");
          if (args.length) {
            ghosttyArgs.push("-e", ...args);
          }
          _LinuxExternalTerminalService.spawnTerminalWithEnv(exec, ghosttyArgs, dir, envVars, resolve, reject);
          return;
        }
        const termArgs = [];
        if (exec.indexOf("gnome-terminal") >= 0) {
          termArgs.push("-x");
        } else {
          termArgs.push("-e");
        }
        termArgs.push("bash");
        termArgs.push("-c");
        const bashCommand = `${quote(args)}; echo; read -p "${_LinuxExternalTerminalService.WAIT_MESSAGE}" -n1;`;
        termArgs.push(`''${bashCommand}''`);
        _LinuxExternalTerminalService.spawnTerminalWithEnv(exec, termArgs, dir, envVars, resolve, reject);
      });
    });
  }
  static spawnTerminalWithEnv(exec, args, dir, envVars, resolve, reject) {
    const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
    Object.keys(env2).filter((v) => env2[v] === null).forEach((key) => delete env2[key]);
    const cmd = cp.spawn(exec, args, { cwd: dir, env: env2 });
    setupSpawnErrorHandling(cmd, resolve, reject, exec);
  }
  static async getDefaultTerminalLinuxReady() {
    if (!_LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY) {
      if (!env.isLinux) {
        _LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = Promise.resolve("xterm");
      } else {
        const isDebian = await pfs.Promises.exists("/etc/debian_version");
        _LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = new Promise((r) => {
          if (isDebian) {
            r("x-terminal-emulator");
          } else if (process.env.DESKTOP_SESSION === "gnome" || process.env.DESKTOP_SESSION === "gnome-classic") {
            r("gnome-terminal");
          } else if (process.env.DESKTOP_SESSION === "kde-plasma") {
            r("konsole");
          } else if (process.env.COLORTERM) {
            r(process.env.COLORTERM);
          } else if (process.env.TERM) {
            r(process.env.TERM);
          } else {
            r("xterm");
          }
        });
      }
    }
    return _LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY;
  }
  spawnTerminal(spawner, configuration, cwd) {
    const execPromise = configuration.linuxExec ? Promise.resolve(configuration.linuxExec) : _LinuxExternalTerminalService.getDefaultTerminalLinuxReady();
    return new Promise((c, e) => {
      execPromise.then((exec) => {
        const env2 = getSanitizedEnvironment(process);
        const basename = path.basename(exec).toLowerCase();
        const args = basename === "ghostty" && cwd ? [`--working-directory=${cwd}`] : [];
        const child = spawner.spawn(exec, args, { cwd, env: env2 });
        child.on("error", e);
        child.on("exit", () => c());
      });
    });
  }
};
_LinuxExternalTerminalService.WAIT_MESSAGE = nls.localize("press.any.key", "Press any key to continue...");
let LinuxExternalTerminalService = _LinuxExternalTerminalService;
function getSanitizedEnvironment(process2) {
  const env2 = { ...process2.env };
  sanitizeProcessEnvironment(env2);
  return env2;
}
function improveError(err) {
  if (err.errno === "ENOENT" && err.path) {
    return new Error(nls.localize("ext.term.app.not.found", "can't find terminal application '{0}'", err.path));
  }
  return err;
}
function setupSpawnErrorHandling(cmd, resolve, reject, terminalApp) {
  let stderr = "";
  cmd.on("error", (err) => {
    reject(improveError(err));
  });
  cmd.stderr?.on("data", (data) => {
    stderr += data.toString();
  });
  cmd.on("exit", (code) => {
    if (code === 0) {
      resolve(void 0);
    } else {
      if (stderr) {
        const lines = stderr.split("\n", 1);
        reject(new Error(lines[0]));
      } else {
        reject(new Error(nls.localize("terminal.launch.failed", "Launching '{0}' failed with exit code {1}", terminalApp, code)));
      }
    }
  });
}
function quote(args) {
  let r = "";
  for (const a of args) {
    if (a.indexOf(" ") >= 0) {
      r += '"' + a + '"';
    } else {
      r += a;
    }
    r += " ";
  }
  return r;
}
export {
  LinuxExternalTerminalService,
  MacExternalTerminalService,
  WindowsExternalTerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVybmFsVGVybWluYWwvbm9kZS9leHRlcm5hbFRlcm1pbmFsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIGVudiBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBzYW5pdGl6ZVByb2Nlc3NFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgKiBhcyBwZnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgKiBhcyBwcm9jZXNzZXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERFRkFVTFRfVEVSTUlOQUxfT1NYLCBJRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UsIElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MsIElUZXJtaW5hbEZvclBsYXRmb3JtIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVybmFsVGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsRW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuXG5jb25zdCBURVJNSU5BTF9USVRMRSA9IG5scy5sb2NhbGl6ZSgnY29uc29sZS50aXRsZScsIFwiVlMgQ29kZSBDb25zb2xlXCIpO1xuXG5hYnN0cmFjdCBjbGFzcyBFeHRlcm5hbFRlcm1pbmFsU2VydmljZSB7XG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0YXN5bmMgZ2V0RGVmYXVsdFRlcm1pbmFsRm9yUGxhdGZvcm1zKCk6IFByb21pc2U8SVRlcm1pbmFsRm9yUGxhdGZvcm0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d2luZG93czogV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLmdldERlZmF1bHRUZXJtaW5hbFdpbmRvd3MoKSxcblx0XHRcdGxpbnV4OiBhd2FpdCBMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLmdldERlZmF1bHRUZXJtaW5hbExpbnV4UmVhZHkoKSxcblx0XHRcdG9zeDogREVGQVVMVF9URVJNSU5BTF9PU1hcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UgZXh0ZW5kcyBFeHRlcm5hbFRlcm1pbmFsU2VydmljZSBpbXBsZW1lbnRzIElFeHRlcm5hbFRlcm1pbmFsU2VydmljZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENNRCA9ICdjbWQuZXhlJztcblx0cHJpdmF0ZSBzdGF0aWMgX0RFRkFVTFRfVEVSTUlOQUxfV0lORE9XUzogc3RyaW5nO1xuXG5cdHB1YmxpYyBvcGVuVGVybWluYWwoY29uZmlndXJhdGlvbjogSUV4dGVybmFsVGVybWluYWxTZXR0aW5ncywgY3dkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc3Bhd25UZXJtaW5hbChjcCwgY29uZmlndXJhdGlvbiwgcHJvY2Vzc2VzLmdldFdpbmRvd3NTaGVsbCgpLCBjd2QpO1xuXHR9XG5cblx0cHVibGljIHNwYXduVGVybWluYWwoc3Bhd25lcjogdHlwZW9mIGNwLCBjb25maWd1cmF0aW9uOiBJRXh0ZXJuYWxUZXJtaW5hbFNldHRpbmdzLCBjb21tYW5kOiBzdHJpbmcsIGN3ZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4ZWMgPSBjb25maWd1cmF0aW9uLndpbmRvd3NFeGVjIHx8IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0VGVybWluYWxXaW5kb3dzKCk7XG5cblx0XHQvLyBNYWtlIHRoZSBkcml2ZSBsZXR0ZXIgdXBwZXJjYXNlIG9uIFdpbmRvd3MgKHNlZSAjOTQ0OClcblx0XHRpZiAoY3dkICYmIGN3ZFsxXSA9PT0gJzonKSB7XG5cdFx0XHRjd2QgPSBjd2RbMF0udG9VcHBlckNhc2UoKSArIGN3ZC5zdWJzdHIoMSk7XG5cdFx0fVxuXG5cdFx0Ly8gY21kZXIgaWdub3JlcyB0aGUgZW52aXJvbm1lbnQgY3dkIGFuZCBpbnN0ZWFkIG9wdHMgdG8gYWx3YXlzIG9wZW4gaW4gJVVTRVJQUk9GSUxFJVxuXHRcdC8vIHVubGVzcyBvdGhlcndpc2Ugc3BlY2lmaWVkXG5cdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGV4ZWMsICcuZXhlJykudG9Mb3dlckNhc2UoKTtcblx0XHRpZiAoYmFzZW5hbWUgPT09ICdjbWRlcicpIHtcblx0XHRcdHNwYXduZXIuc3Bhd24oZXhlYywgY3dkID8gW2N3ZF0gOiB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNtZEFyZ3MgPSBbJy9jJywgJ3N0YXJ0JywgJy93YWl0J107XG5cdFx0aWYgKGV4ZWMuaW5kZXhPZignICcpID49IDApIHtcblx0XHRcdC8vIFRoZSBcIlwiIGFyZ3VtZW50IGlzIHRoZSB3aW5kb3cgdGl0bGUuIFdpdGhvdXQgdGhpcywgZXhlYyBkb2Vzbid0IHdvcmsgd2hlbiB0aGUgcGF0aFxuXHRcdFx0Ly8gY29udGFpbnMgc3BhY2VzLiAjNjU5MFxuXHRcdFx0Ly8gVGl0bGUgaXMgRXhlY3V0aW9uIFBhdGguICMyMjAxMjlcblx0XHRcdGNtZEFyZ3MucHVzaChleGVjKTtcblx0XHR9XG5cdFx0Y21kQXJncy5wdXNoKGV4ZWMpO1xuXHRcdC8vIEFkZCBzdGFydGluZyBkaXJlY3RvcnkgcGFyYW1ldGVyIGZvciBXaW5kb3dzIFRlcm1pbmFsIChzZWUgIzkwNzM0KVxuXHRcdGlmIChiYXNlbmFtZSA9PT0gJ3d0Jykge1xuXHRcdFx0Y21kQXJncy5wdXNoKCctZCAuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChjLCBlKSA9PiB7XG5cdFx0XHRjb25zdCBlbnYgPSBnZXRTYW5pdGl6ZWRFbnZpcm9ubWVudChwcm9jZXNzKTtcblx0XHRcdGNvbnN0IGNoaWxkID0gc3Bhd25lci5zcGF3bihjb21tYW5kLCBjbWRBcmdzLCB7IGN3ZCwgZW52LCBkZXRhY2hlZDogdHJ1ZSB9KTtcblx0XHRcdGNoaWxkLm9uKCdlcnJvcicsIGUpO1xuXHRcdFx0Y2hpbGQub24oJ2V4aXQnLCAoKSA9PiBjKCkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bkluVGVybWluYWwodGl0bGU6IHN0cmluZywgZGlyOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBlbnZWYXJzOiBJVGVybWluYWxFbnZpcm9ubWVudCwgc2V0dGluZ3M6IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4ZWMgPSBzZXR0aW5ncy53aW5kb3dzRXhlYyB8fCBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuZ2V0RGVmYXVsdFRlcm1pbmFsV2luZG93cygpO1xuXHRcdGNvbnN0IHd0ID0gYXdhaXQgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLmdldFd0RXhlUGF0aCgpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRjb25zdCB0aXRsZSA9IGBcIiR7ZGlyfSAtICR7VEVSTUlOQUxfVElUTEV9XCJgO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBcIiR7YXJncy5qb2luKCdcIiBcIicpfVwiICYgcGF1c2VgOyAvLyB1c2UgJ3wnIHRvIG9ubHkgcGF1c2Ugb24gbm9uLXplcm8gZXhpdCBjb2RlXG5cblx0XHRcdC8vIG1lcmdlIGVudmlyb25tZW50IHZhcmlhYmxlcyBpbnRvIGEgY29weSBvZiB0aGUgcHJvY2Vzcy5lbnZcblx0XHRcdGNvbnN0IGVudiA9IE9iamVjdC5hc3NpZ24oe30sIGdldFNhbml0aXplZEVudmlyb25tZW50KHByb2Nlc3MpLCBlbnZWYXJzKTtcblxuXHRcdFx0Ly8gZGVsZXRlIGVudmlyb25tZW50IHZhcmlhYmxlcyB0aGF0IGhhdmUgYSBudWxsIHZhbHVlXG5cdFx0XHRPYmplY3Qua2V5cyhlbnYpLmZpbHRlcih2ID0+IGVudlt2XSA9PT0gbnVsbCkuZm9yRWFjaChrZXkgPT4gZGVsZXRlIGVudltrZXldKTtcblxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBkaXIsXG5cdFx0XHRcdGVudjogZW52LFxuXHRcdFx0XHR3aW5kb3dzVmVyYmF0aW1Bcmd1bWVudHM6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdGxldCBzcGF3bkV4ZWM6IHN0cmluZztcblx0XHRcdGxldCBjbWRBcmdzOiBzdHJpbmdbXTtcblxuXHRcdFx0aWYgKHBhdGguYmFzZW5hbWUoZXhlYywgJy5leGUnKSA9PT0gJ3d0Jykge1xuXHRcdFx0XHQvLyBIYW5kbGUgV2luZG93cyBUZXJtaW5hbCBzcGVjaWFsbHk7IC1kIHRvIHNldCB0aGUgY3dkIGFuZCBydW4gYSBjbWQuZXhlIGluc3RhbmNlXG5cdFx0XHRcdC8vIGluc2lkZSBpdFxuXHRcdFx0XHRzcGF3bkV4ZWMgPSBleGVjO1xuXHRcdFx0XHRjbWRBcmdzID0gWyctZCcsICcuJywgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLkNNRCwgJy9jJywgY29tbWFuZF07XG5cdFx0XHR9IGVsc2UgaWYgKHd0KSB7XG5cdFx0XHRcdC8vIHByZWZlciB0byB1c2UgdGhlIHdpbmRvdyB0ZXJtaW5hbCB0byBzcGF3biBpZiBpdCdzIGF2YWlsYWJsZSBpbnN0ZWFkXG5cdFx0XHRcdC8vIG9mIHN0YXJ0LCBzaW5jZSB0aGF0IGFsbG93cyBjdHJsK2MgaGFuZGxpbmcgKCM4MTMyMilcblx0XHRcdFx0c3Bhd25FeGVjID0gd3Q7XG5cdFx0XHRcdGNtZEFyZ3MgPSBbJy1kJywgJy4nLCBleGVjLCAnL2MnLCBjb21tYW5kXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNwYXduRXhlYyA9IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5DTUQ7XG5cdFx0XHRcdGNtZEFyZ3MgPSBbJy9jJywgJ3N0YXJ0JywgdGl0bGUsICcvd2FpdCcsIGV4ZWMsICcvYycsIGBcIiR7Y29tbWFuZH1cImBdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbWQgPSBjcC5zcGF3bihzcGF3bkV4ZWMsIGNtZEFyZ3MsIG9wdGlvbnMpO1xuXG5cdFx0XHRjbWQub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdFx0cmVqZWN0KGltcHJvdmVFcnJvcihlcnIpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldERlZmF1bHRUZXJtaW5hbFdpbmRvd3MoKTogc3RyaW5nIHtcblx0XHRpZiAoIVdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5fREVGQVVMVF9URVJNSU5BTF9XSU5ET1dTKSB7XG5cdFx0XHRjb25zdCBpc1dvVzY0ID0gISFwcm9jZXNzLmVudi5oYXNPd25Qcm9wZXJ0eSgnUFJPQ0VTU09SX0FSQ0hJVEVXNjQzMicpO1xuXHRcdFx0V2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLl9ERUZBVUxUX1RFUk1JTkFMX1dJTkRPV1MgPSBgJHtwcm9jZXNzLmVudi53aW5kaXIgPyBwcm9jZXNzLmVudi53aW5kaXIgOiAnQzpcXFxcV2luZG93cyd9XFxcXCR7aXNXb1c2NCA/ICdTeXNuYXRpdmUnIDogJ1N5c3RlbTMyJ31cXFxcY21kLmV4ZWA7XG5cdFx0fVxuXHRcdHJldHVybiBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuX0RFRkFVTFRfVEVSTUlOQUxfV0lORE9XUztcblx0fVxuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgc3RhdGljIGFzeW5jIGdldFd0RXhlUGF0aCgpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHByb2Nlc3Nlcy5maW5kRXhlY3V0YWJsZSgnd3QnKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYWNFeHRlcm5hbFRlcm1pbmFsU2VydmljZSBleHRlbmRzIEV4dGVybmFsVGVybWluYWxTZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVybmFsVGVybWluYWxTZXJ2aWNlIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgT1NBU0NSSVBUID0gJy91c3IvYmluL29zYXNjcmlwdCc7XHQvLyBvc2FzY3JpcHQgaXMgdGhlIEFwcGxlU2NyaXB0IGludGVycHJldGVyIG9uIE9TIFhcblxuXHRwdWJsaWMgb3BlblRlcm1pbmFsKGNvbmZpZ3VyYXRpb246IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MsIGN3ZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNwYXduVGVybWluYWwoY3AsIGNvbmZpZ3VyYXRpb24sIGN3ZCk7XG5cdH1cblxuXHRwdWJsaWMgcnVuSW5UZXJtaW5hbCh0aXRsZTogc3RyaW5nLCBkaXI6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGVudlZhcnM6IElUZXJtaW5hbEVudmlyb25tZW50LCBzZXR0aW5nczogSUV4dGVybmFsVGVybWluYWxTZXR0aW5ncyk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCB0ZXJtaW5hbEFwcCA9IHNldHRpbmdzLm9zeEV4ZWMgfHwgREVGQVVMVF9URVJNSU5BTF9PU1g7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cblx0XHRcdGlmICh0ZXJtaW5hbEFwcCA9PT0gREVGQVVMVF9URVJNSU5BTF9PU1ggfHwgdGVybWluYWxBcHAgPT09ICdpVGVybS5hcHAnKSB7XG5cblx0XHRcdFx0Ly8gT24gT1MgWCB3ZSBsYXVuY2ggYW4gQXBwbGVTY3JpcHQgdGhhdCBjcmVhdGVzIChvciByZXVzZXMpIGEgVGVybWluYWwgd2luZG93XG5cdFx0XHRcdC8vIGFuZCB0aGVuIGxhdW5jaGVzIHRoZSBwcm9ncmFtIGluc2lkZSB0aGF0IHdpbmRvdy5cblxuXHRcdFx0XHRjb25zdCBzY3JpcHQgPSB0ZXJtaW5hbEFwcCA9PT0gREVGQVVMVF9URVJNSU5BTF9PU1ggPyAnVGVybWluYWxIZWxwZXInIDogJ2lUZXJtSGVscGVyJztcblx0XHRcdFx0Y29uc3Qgc2NyaXB0cGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKGB2cy93b3JrYmVuY2gvY29udHJpYi9leHRlcm5hbFRlcm1pbmFsL25vZGUvJHtzY3JpcHR9LnNjcHRgKS5mc1BhdGg7XG5cblx0XHRcdFx0Y29uc3Qgb3NhQXJncyA9IFtcblx0XHRcdFx0XHRzY3JpcHRwYXRoLFxuXHRcdFx0XHRcdCctdCcsIHRpdGxlIHx8IFRFUk1JTkFMX1RJVExFLFxuXHRcdFx0XHRcdCctdycsIGRpcixcblx0XHRcdFx0XTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGEgb2YgYXJncykge1xuXHRcdFx0XHRcdG9zYUFyZ3MucHVzaCgnLWEnKTtcblx0XHRcdFx0XHRvc2FBcmdzLnB1c2goYSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZW52VmFycykge1xuXHRcdFx0XHRcdC8vIG1lcmdlIGVudmlyb25tZW50IHZhcmlhYmxlcyBpbnRvIGEgY29weSBvZiB0aGUgcHJvY2Vzcy5lbnZcblx0XHRcdFx0XHRjb25zdCBlbnYgPSBPYmplY3QuYXNzaWduKHt9LCBnZXRTYW5pdGl6ZWRFbnZpcm9ubWVudChwcm9jZXNzKSwgZW52VmFycyk7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBlbnYpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gZW52W2tleV07XG5cdFx0XHRcdFx0XHRpZiAodmFsdWUgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0b3NhQXJncy5wdXNoKCctdScpO1xuXHRcdFx0XHRcdFx0XHRvc2FBcmdzLnB1c2goa2V5KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG9zYUFyZ3MucHVzaCgnLWUnKTtcblx0XHRcdFx0XHRcdFx0b3NhQXJncy5wdXNoKGAke2tleX09JHt2YWx1ZX1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBvc2EgPSBjcC5zcGF3bihNYWNFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5PU0FTQ1JJUFQsIG9zYUFyZ3MpO1xuXHRcdFx0XHRzZXR1cFNwYXduRXJyb3JIYW5kbGluZyhvc2EsIHJlc29sdmUsIHJlamVjdCwgdGVybWluYWxBcHApO1xuXHRcdFx0fSBlbHNlIGlmICh0ZXJtaW5hbEFwcCA9PT0gJ0dob3N0dHkuYXBwJykge1xuXHRcdFx0XHQvLyBHaG9zdHR5IHVzZXMgQ0xJIGZsYWdzIGRpcmVjdGx5IGluc3RlYWQgb2YgQXBwbGVTY3JpcHQgbGlrZSBNYWMgVGVybWluYWwgYW5kIGlUZXJtXG5cdFx0XHRcdC8vIE5vdGU6IC1uYSBpcyByZXF1aXJlZCAobm90IGp1c3QgLWEpIGJlY2F1c2Ugd2UgbmVlZCB0byBzcGF3biBhIG5ldyBpbnN0YW5jZSB0aGF0XG5cdFx0XHRcdC8vIHJlY2VpdmVzIG91ciAtLWFyZ3MuIFdpdGgganVzdCAtYSwgaWYgR2hvc3R0eSBpcyBhbHJlYWR5IHJ1bm5pbmcsIG9wZW4gd2lsbFxuXHRcdFx0XHQvLyBhY3RpdmF0ZSB0aGUgZXhpc3RpbmcgaW5zdGFuY2UgYW5kIGlnbm9yZSAtLWFyZ3MgZW50aXJlbHkuXG5cdFx0XHRcdGNvbnN0IGVudiA9IE9iamVjdC5hc3NpZ24oe30sIGdldFNhbml0aXplZEVudmlyb25tZW50KHByb2Nlc3MpLCBlbnZWYXJzKTtcblx0XHRcdFx0Y29uc3Qgb3BlbkFyZ3MgPSBbJy1uYScsICdHaG9zdHR5LmFwcCcsICctLWFyZ3MnXTtcblx0XHRcdFx0b3BlbkFyZ3MucHVzaCgnLS13b3JraW5nLWRpcmVjdG9yeT0nICsgZGlyKTtcblx0XHRcdFx0b3BlbkFyZ3MucHVzaCgnLS13YWl0LWFmdGVyLWNvbW1hbmQ9dHJ1ZScpO1xuXHRcdFx0XHRvcGVuQXJncy5wdXNoKCctZScsIC4uLmFyZ3MpO1xuXG5cdFx0XHRcdGNvbnN0IGNtZCA9IGNwLnNwYXduKCcvdXNyL2Jpbi9vcGVuJywgb3BlbkFyZ3MsIHsgZW52IH0pO1xuXHRcdFx0XHRzZXR1cFNwYXduRXJyb3JIYW5kbGluZyhjbWQsIHJlc29sdmUsIHJlamVjdCwgdGVybWluYWxBcHApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ21hYy50ZXJtaW5hbC50eXBlLm5vdC5zdXBwb3J0ZWQnLCBcIid7MH0nIG5vdCBzdXBwb3J0ZWRcIiwgdGVybWluYWxBcHApKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzcGF3blRlcm1pbmFsKHNwYXduZXI6IHR5cGVvZiBjcCwgY29uZmlndXJhdGlvbjogSUV4dGVybmFsVGVybWluYWxTZXR0aW5ncywgY3dkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWxBcHAgPSBjb25maWd1cmF0aW9uLm9zeEV4ZWMgfHwgREVGQVVMVF9URVJNSU5BTF9PU1g7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBbJy1hJywgdGVybWluYWxBcHBdO1xuXHRcdFx0aWYgKGN3ZCkge1xuXHRcdFx0XHRhcmdzLnB1c2goY3dkKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudiA9IGdldFNhbml0aXplZEVudmlyb25tZW50KHByb2Nlc3MpO1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBzcGF3bmVyLnNwYXduKCcvdXNyL2Jpbi9vcGVuJywgYXJncywgeyBjd2QsIGVudiB9KTtcblx0XHRcdGNoaWxkLm9uKCdlcnJvcicsIGUpO1xuXHRcdFx0Y2hpbGQub24oJ2V4aXQnLCAoKSA9PiBjKCkpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlIGV4dGVuZHMgRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UgaW1wbGVtZW50cyBJRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2Uge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFdBSVRfTUVTU0FHRSA9IG5scy5sb2NhbGl6ZSgncHJlc3MuYW55LmtleScsIFwiUHJlc3MgYW55IGtleSB0byBjb250aW51ZS4uLlwiKTtcblxuXHRwdWJsaWMgb3BlblRlcm1pbmFsKGNvbmZpZ3VyYXRpb246IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MsIGN3ZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNwYXduVGVybWluYWwoY3AsIGNvbmZpZ3VyYXRpb24sIGN3ZCk7XG5cdH1cblxuXHRwdWJsaWMgcnVuSW5UZXJtaW5hbCh0aXRsZTogc3RyaW5nLCBkaXI6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGVudlZhcnM6IElUZXJtaW5hbEVudmlyb25tZW50LCBzZXR0aW5nczogSUV4dGVybmFsVGVybWluYWxTZXR0aW5ncyk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBleGVjUHJvbWlzZSA9IHNldHRpbmdzLmxpbnV4RXhlYyA/IFByb21pc2UucmVzb2x2ZShzZXR0aW5ncy5saW51eEV4ZWMpIDogTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0VGVybWluYWxMaW51eFJlYWR5KCk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRleGVjUHJvbWlzZS50aGVuKGV4ZWMgPT4ge1xuXHRcdFx0XHRjb25zdCBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWUoZXhlYykudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0aWYgKGJhc2VuYW1lID09PSAnZ2hvc3R0eScpIHtcblx0XHRcdFx0XHRjb25zdCBnaG9zdHR5QXJnczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRpZiAoZGlyKSB7XG5cdFx0XHRcdFx0XHRnaG9zdHR5QXJncy5wdXNoKGAtLXdvcmtpbmctZGlyZWN0b3J5PSR7ZGlyfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRnaG9zdHR5QXJncy5wdXNoKCctLXdhaXQtYWZ0ZXItY29tbWFuZD10cnVlJyk7XG5cdFx0XHRcdFx0aWYgKGFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRnaG9zdHR5QXJncy5wdXNoKCctZScsIC4uLmFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLnNwYXduVGVybWluYWxXaXRoRW52KGV4ZWMsIGdob3N0dHlBcmdzLCBkaXIsIGVudlZhcnMsIHJlc29sdmUsIHJlamVjdCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGVybUFyZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdC8vdGVybUFyZ3MucHVzaCgnLS10aXRsZScpO1xuXHRcdFx0XHQvL3Rlcm1BcmdzLnB1c2goYFwiJHtURVJNSU5BTF9USVRMRX1cImApO1xuXHRcdFx0XHRpZiAoZXhlYy5pbmRleE9mKCdnbm9tZS10ZXJtaW5hbCcpID49IDApIHtcblx0XHRcdFx0XHR0ZXJtQXJncy5wdXNoKCcteCcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRlcm1BcmdzLnB1c2goJy1lJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGVybUFyZ3MucHVzaCgnYmFzaCcpO1xuXHRcdFx0XHR0ZXJtQXJncy5wdXNoKCctYycpO1xuXG5cdFx0XHRcdGNvbnN0IGJhc2hDb21tYW5kID0gYCR7cXVvdGUoYXJncyl9OyBlY2hvOyByZWFkIC1wIFwiJHtMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLldBSVRfTUVTU0FHRX1cIiAtbjE7YDtcblx0XHRcdFx0dGVybUFyZ3MucHVzaChgJycke2Jhc2hDb21tYW5kfScnYCk7XHQvLyB3cmFwcGluZyBhcmd1bWVudCBpbiB0d28gc2V0cyBvZiAnIGJlY2F1c2Ugbm9kZSBpcyBzbyBcImZyaWVuZGx5XCIgdGhhdCBpdCByZW1vdmVzIG9uZSBzZXQuLi5cblxuXG5cdFx0XHRcdExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2Uuc3Bhd25UZXJtaW5hbFdpdGhFbnYoZXhlYywgdGVybUFyZ3MsIGRpciwgZW52VmFycywgcmVzb2x2ZSwgcmVqZWN0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgc3Bhd25UZXJtaW5hbFdpdGhFbnYoXG5cdFx0ZXhlYzogc3RyaW5nLFxuXHRcdGFyZ3M6IHN0cmluZ1tdLFxuXHRcdGRpcjogc3RyaW5nLFxuXHRcdGVudlZhcnM6IElUZXJtaW5hbEVudmlyb25tZW50LFxuXHRcdHJlc29sdmU6ICh2YWx1ZTogbnVtYmVyIHwgUHJvbWlzZUxpa2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCkgPT4gdm9pZCxcblx0XHRyZWplY3Q6IChyZWFzb24/OiB1bmtub3duKSA9PiB2b2lkXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudiA9IE9iamVjdC5hc3NpZ24oe30sIGdldFNhbml0aXplZEVudmlyb25tZW50KHByb2Nlc3MpLCBlbnZWYXJzKTtcblxuXHRcdC8vIGRlbGV0ZSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgdGhhdCBoYXZlIGEgbnVsbCB2YWx1ZVxuXHRcdE9iamVjdC5rZXlzKGVudikuZmlsdGVyKHYgPT4gZW52W3ZdID09PSBudWxsKS5mb3JFYWNoKGtleSA9PiBkZWxldGUgZW52W2tleV0pO1xuXG5cdFx0Y29uc3QgY21kID0gY3Auc3Bhd24oZXhlYywgYXJncywgeyBjd2Q6IGRpciwgZW52IH0pO1xuXHRcdHNldHVwU3Bhd25FcnJvckhhbmRsaW5nKGNtZCwgcmVzb2x2ZSwgcmVqZWN0LCBleGVjKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9ERUZBVUxUX1RFUk1JTkFMX0xJTlVYX1JFQURZOiBQcm9taXNlPHN0cmluZz47XG5cblx0cHVibGljIHN0YXRpYyBhc3luYyBnZXREZWZhdWx0VGVybWluYWxMaW51eFJlYWR5KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKCFMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLl9ERUZBVUxUX1RFUk1JTkFMX0xJTlVYX1JFQURZKSB7XG5cdFx0XHRpZiAoIWVudi5pc0xpbnV4KSB7XG5cdFx0XHRcdExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuX0RFRkFVTFRfVEVSTUlOQUxfTElOVVhfUkVBRFkgPSBQcm9taXNlLnJlc29sdmUoJ3h0ZXJtJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpc0RlYmlhbiA9IGF3YWl0IHBmcy5Qcm9taXNlcy5leGlzdHMoJy9ldGMvZGViaWFuX3ZlcnNpb24nKTtcblx0XHRcdFx0TGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5fREVGQVVMVF9URVJNSU5BTF9MSU5VWF9SRUFEWSA9IG5ldyBQcm9taXNlPHN0cmluZz4ociA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzRGViaWFuKSB7XG5cdFx0XHRcdFx0XHRyKCd4LXRlcm1pbmFsLWVtdWxhdG9yJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwcm9jZXNzLmVudi5ERVNLVE9QX1NFU1NJT04gPT09ICdnbm9tZScgfHwgcHJvY2Vzcy5lbnYuREVTS1RPUF9TRVNTSU9OID09PSAnZ25vbWUtY2xhc3NpYycpIHtcblx0XHRcdFx0XHRcdHIoJ2dub21lLXRlcm1pbmFsJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwcm9jZXNzLmVudi5ERVNLVE9QX1NFU1NJT04gPT09ICdrZGUtcGxhc21hJykge1xuXHRcdFx0XHRcdFx0cigna29uc29sZScpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuQ09MT1JURVJNKSB7XG5cdFx0XHRcdFx0XHRyKHByb2Nlc3MuZW52LkNPTE9SVEVSTSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwcm9jZXNzLmVudi5URVJNKSB7XG5cdFx0XHRcdFx0XHRyKHByb2Nlc3MuZW52LlRFUk0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyKCd4dGVybScpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLl9ERUZBVUxUX1RFUk1JTkFMX0xJTlVYX1JFQURZO1xuXHR9XG5cblx0c3Bhd25UZXJtaW5hbChzcGF3bmVyOiB0eXBlb2YgY3AsIGNvbmZpZ3VyYXRpb246IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MsIGN3ZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4ZWNQcm9taXNlID0gY29uZmlndXJhdGlvbi5saW51eEV4ZWMgPyBQcm9taXNlLnJlc29sdmUoY29uZmlndXJhdGlvbi5saW51eEV4ZWMpIDogTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0VGVybWluYWxMaW51eFJlYWR5KCk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdGV4ZWNQcm9taXNlLnRoZW4oZXhlYyA9PiB7XG5cdFx0XHRcdGNvbnN0IGVudiA9IGdldFNhbml0aXplZEVudmlyb25tZW50KHByb2Nlc3MpO1xuXHRcdFx0XHRjb25zdCBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWUoZXhlYykudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgYXJncyA9IGJhc2VuYW1lID09PSAnZ2hvc3R0eScgJiYgY3dkID8gW2AtLXdvcmtpbmctZGlyZWN0b3J5PSR7Y3dkfWBdIDogW107XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gc3Bhd25lci5zcGF3bihleGVjLCBhcmdzLCB7IGN3ZCwgZW52IH0pO1xuXHRcdFx0XHRjaGlsZC5vbignZXJyb3InLCBlKTtcblx0XHRcdFx0Y2hpbGQub24oJ2V4aXQnLCAoKSA9PiBjKCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U2FuaXRpemVkRW52aXJvbm1lbnQocHJvY2VzczogTm9kZUpTLlByb2Nlc3MpIHtcblx0Y29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiB9O1xuXHRzYW5pdGl6ZVByb2Nlc3NFbnZpcm9ubWVudChlbnYpO1xuXHRyZXR1cm4gZW52O1xufVxuXG4vKipcbiAqIHRyaWVzIHRvIHR1cm4gT1MgZXJyb3JzIGludG8gbW9yZSBtZWFuaW5nZnVsIGVycm9yIG1lc3NhZ2VzXG4gKi9cbmZ1bmN0aW9uIGltcHJvdmVFcnJvcihlcnI6IEVycm9yICYgeyBlcnJubz86IHN0cmluZzsgcGF0aD86IHN0cmluZyB9KTogRXJyb3Ige1xuXHRpZiAoZXJyLmVycm5vID09PSAnRU5PRU5UJyAmJiBlcnIucGF0aCkge1xuXHRcdHJldHVybiBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdleHQudGVybS5hcHAubm90LmZvdW5kJywgXCJjYW4ndCBmaW5kIHRlcm1pbmFsIGFwcGxpY2F0aW9uICd7MH0nXCIsIGVyci5wYXRoKSk7XG5cdH1cblx0cmV0dXJuIGVycjtcbn1cblxuLyoqXG4gKiBBdHRhY2hlcyBlcnJvciBoYW5kbGluZyB0byBhIHNwYXduZWQgY2hpbGQgcHJvY2VzcyBmb3IgdGVybWluYWwgbGF1bmNoaW5nLlxuICovXG5mdW5jdGlvbiBzZXR1cFNwYXduRXJyb3JIYW5kbGluZyhcblx0Y21kOiBjcC5DaGlsZFByb2Nlc3MsXG5cdHJlc29sdmU6ICh2YWx1ZTogbnVtYmVyIHwgUHJvbWlzZUxpa2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCkgPT4gdm9pZCxcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0cmVqZWN0OiAocmVhc29uPzogYW55KSA9PiB2b2lkLFxuXHR0ZXJtaW5hbEFwcDogc3RyaW5nXG4pOiB2b2lkIHtcblx0bGV0IHN0ZGVyciA9ICcnO1xuXHRjbWQub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRyZWplY3QoaW1wcm92ZUVycm9yKGVycikpO1xuXHR9KTtcblx0Y21kLnN0ZGVycj8ub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuXHRcdHN0ZGVyciArPSBkYXRhLnRvU3RyaW5nKCk7XG5cdH0pO1xuXHRjbWQub24oJ2V4aXQnLCAoY29kZTogbnVtYmVyKSA9PiB7XG5cdFx0aWYgKGNvZGUgPT09IDApIHtcblx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHN0ZGVycikge1xuXHRcdFx0XHRjb25zdCBsaW5lcyA9IHN0ZGVyci5zcGxpdCgnXFxuJywgMSk7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IobGluZXNbMF0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCd0ZXJtaW5hbC5sYXVuY2guZmFpbGVkJywgXCJMYXVuY2hpbmcgJ3swfScgZmFpbGVkIHdpdGggZXhpdCBjb2RlIHsxfVwiLCB0ZXJtaW5hbEFwcCwgY29kZSkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIFF1b3RlIGFyZ3MgaWYgbmVjZXNzYXJ5IGFuZCBjb21iaW5lIGludG8gYSBzcGFjZSBzZXBhcmF0ZWQgc3RyaW5nLlxuICovXG5mdW5jdGlvbiBxdW90ZShhcmdzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdGxldCByID0gJyc7XG5cdGZvciAoY29uc3QgYSBvZiBhcmdzKSB7XG5cdFx0aWYgKGEuaW5kZXhPZignICcpID49IDApIHtcblx0XHRcdHIgKz0gJ1wiJyArIGEgKyAnXCInO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyICs9IGE7XG5cdFx0fVxuXHRcdHIgKz0gJyAnO1xuXHR9XG5cdHJldHVybiByO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxVQUFVO0FBQ3RCLFlBQVksU0FBUztBQUNyQixTQUFTLGtDQUFrQztBQUMzQyxZQUFZLFNBQVM7QUFDckIsWUFBWSxlQUFlO0FBQzNCLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUF1RztBQUdoSCxNQUFNLGlC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
