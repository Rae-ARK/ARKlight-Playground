import * as cp from "child_process";
import { getDriveLetter } from "../../../../base/common/extpath.js";
import * as platform from "../../../../base/common/platform.js";
function spawnAsPromised(command, args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const child = cp.spawn(command, args);
    if (child.pid) {
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
    }
    child.on("error", (err) => {
      reject(err);
    });
    child.on("close", (code) => {
      resolve(stdout);
    });
  });
}
async function hasChildProcesses(processId) {
  if (processId) {
    if (platform.isWindows) {
      const windowsProcessTree = await import("@vscode/windows-process-tree");
      return new Promise((resolve) => {
        windowsProcessTree.getProcessTree(processId, (processTree) => {
          resolve(!!processTree && processTree.children.length > 0);
        });
      });
    } else {
      return spawnAsPromised("/usr/bin/pgrep", ["-lP", String(processId)]).then((stdout) => {
        const r = stdout.trim();
        if (r.length === 0 || r.indexOf(" tmux") >= 0) {
          return false;
        } else {
          return true;
        }
      }, (error) => {
        return true;
      });
    }
  }
  return Promise.resolve(true);
}
var ShellType = /* @__PURE__ */ ((ShellType2) => {
  ShellType2[ShellType2["cmd"] = 0] = "cmd";
  ShellType2[ShellType2["powershell"] = 1] = "powershell";
  ShellType2[ShellType2["bash"] = 2] = "bash";
  return ShellType2;
})(ShellType || {});
function prepareCommand(shell, args, argsCanBeInterpretedByShell, cwd, env) {
  shell = shell.trim().toLowerCase();
  let shellType;
  if (shell.indexOf("powershell") >= 0 || shell.indexOf("pwsh") >= 0) {
    shellType = 1 /* powershell */;
  } else if (shell.indexOf("cmd.exe") >= 0) {
    shellType = 0 /* cmd */;
  } else if (shell.indexOf("bash") >= 0) {
    shellType = 2 /* bash */;
  } else if (platform.isWindows) {
    shellType = 0 /* cmd */;
  } else {
    shellType = 2 /* bash */;
  }
  let quote;
  let command = " ";
  switch (shellType) {
    case 1 /* powershell */:
      quote = (s) => {
        s = s.replace(/\'/g, "''");
        if (s.length > 0 && s.charAt(s.length - 1) === "\\") {
          return `'${s}\\'`;
        }
        return `'${s}'`;
      };
      if (cwd) {
        const driveLetter = getDriveLetter(cwd);
        if (driveLetter) {
          command += `${driveLetter}:; `;
        }
        command += `cd ${quote(cwd)}; `;
      }
      if (env) {
        for (const key in env) {
          const value = env[key];
          if (value === null) {
            command += `Remove-Item env:${key}; `;
          } else {
            command += `\${env:${key}}='${value}'; `;
          }
        }
      }
      if (args.length > 0) {
        const arg = args.shift();
        const cmd = argsCanBeInterpretedByShell ? arg : quote(arg);
        command += cmd[0] === "'" ? `& ${cmd} ` : `${cmd} `;
        for (const a of args) {
          command += a === "<" || a === ">" || argsCanBeInterpretedByShell ? a : quote(a);
          command += " ";
        }
      }
      break;
    case 0 /* cmd */:
      quote = (s) => {
        s = s.replace(/\"/g, '""');
        s = s.replace(/([><!^&|])/g, "^$1");
        return ' "'.split("").some((char) => s.includes(char)) || s.length === 0 ? `"${s}"` : s;
      };
      if (cwd) {
        const driveLetter = getDriveLetter(cwd);
        if (driveLetter) {
          command += `${driveLetter}: && `;
        }
        command += `cd ${quote(cwd)} && `;
      }
      if (env) {
        command += 'cmd /C "';
        for (const key in env) {
          let value = env[key];
          if (value === null) {
            command += `set "${key}=" && `;
          } else {
            value = value.replace(/[&^|<>]/g, (s) => `^${s}`);
            command += `set "${key}=${value}" && `;
          }
        }
      }
      for (const a of args) {
        command += a === "<" || a === ">" || argsCanBeInterpretedByShell ? a : quote(a);
        command += " ";
      }
      if (env) {
        command += '"';
      }
      break;
    case 2 /* bash */: {
      quote = (s) => {
        s = s.replace(/(["'\\\$!><#()\[\]*&^| ;{}?`])/g, "\\$1");
        return s.length === 0 ? `""` : s;
      };
      const hardQuote = (s) => {
        return /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
      };
      if (cwd) {
        command += `cd ${quote(cwd)} ; `;
      }
      if (env) {
        command += "/usr/bin/env";
        for (const key in env) {
          const value = env[key];
          if (value === null) {
            command += ` -u ${hardQuote(key)}`;
          } else {
            command += ` ${hardQuote(`${key}=${value}`)}`;
          }
        }
        command += " ";
      }
      for (const a of args) {
        command += a === "<" || a === ">" || argsCanBeInterpretedByShell ? a : quote(a);
        command += " ";
      }
      break;
    }
  }
  return command;
}
export {
  hasChildProcesses,
  prepareCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL25vZGUvdGVybWluYWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBnZXREcml2ZUxldHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5mdW5jdGlvbiBzcGF3bkFzUHJvbWlzZWQoY29tbWFuZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0bGV0IHN0ZG91dCA9ICcnO1xuXHRcdGNvbnN0IGNoaWxkID0gY3Auc3Bhd24oY29tbWFuZCwgYXJncyk7XG5cdFx0aWYgKGNoaWxkLnBpZCkge1xuXHRcdFx0Y2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuXHRcdFx0XHRzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGNoaWxkLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRyZWplY3QoZXJyKTtcblx0XHR9KTtcblx0XHRjaGlsZC5vbignY2xvc2UnLCBjb2RlID0+IHtcblx0XHRcdHJlc29sdmUoc3Rkb3V0KTtcblx0XHR9KTtcblx0fSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYXNDaGlsZFByb2Nlc3Nlcyhwcm9jZXNzSWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRpZiAocHJvY2Vzc0lkKSB7XG5cblx0XHQvLyBpZiBzaGVsbCBoYXMgYXQgbGVhc3Qgb25lIGNoaWxkIHByb2Nlc3MsIGFzc3VtZSB0aGF0IHNoZWxsIGlzIGJ1c3lcblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCB3aW5kb3dzUHJvY2Vzc1RyZWUgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvd2luZG93cy1wcm9jZXNzLXRyZWUnKTtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdFx0d2luZG93c1Byb2Nlc3NUcmVlLmdldFByb2Nlc3NUcmVlKHByb2Nlc3NJZCwgcHJvY2Vzc1RyZWUgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmUoISFwcm9jZXNzVHJlZSAmJiBwcm9jZXNzVHJlZS5jaGlsZHJlbi5sZW5ndGggPiAwKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHNwYXduQXNQcm9taXNlZCgnL3Vzci9iaW4vcGdyZXAnLCBbJy1sUCcsIFN0cmluZyhwcm9jZXNzSWQpXSkudGhlbihzdGRvdXQgPT4ge1xuXHRcdFx0XHRjb25zdCByID0gc3Rkb3V0LnRyaW0oKTtcblx0XHRcdFx0aWYgKHIubGVuZ3RoID09PSAwIHx8IHIuaW5kZXhPZignIHRtdXgnKSA+PSAwKSB7IC8vIGlnbm9yZSAndG11eCc7IHNlZSAjNDM2ODNcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblx0Ly8gZmFsbCBiYWNrIHRvIHNhZmUgc2lkZVxuXHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xufVxuXG5jb25zdCBlbnVtIFNoZWxsVHlwZSB7IGNtZCwgcG93ZXJzaGVsbCwgYmFzaCB9XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVDb21tYW5kKHNoZWxsOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBhcmdzQ2FuQmVJbnRlcnByZXRlZEJ5U2hlbGw6IGJvb2xlYW4sIGN3ZD86IHN0cmluZywgZW52PzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCBudWxsIH0pOiBzdHJpbmcge1xuXG5cdHNoZWxsID0gc2hlbGwudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cblx0Ly8gdHJ5IHRvIGRldGVybWluZSB0aGUgc2hlbGwgdHlwZVxuXHRsZXQgc2hlbGxUeXBlO1xuXHRpZiAoc2hlbGwuaW5kZXhPZigncG93ZXJzaGVsbCcpID49IDAgfHwgc2hlbGwuaW5kZXhPZigncHdzaCcpID49IDApIHtcblx0XHRzaGVsbFR5cGUgPSBTaGVsbFR5cGUucG93ZXJzaGVsbDtcblx0fSBlbHNlIGlmIChzaGVsbC5pbmRleE9mKCdjbWQuZXhlJykgPj0gMCkge1xuXHRcdHNoZWxsVHlwZSA9IFNoZWxsVHlwZS5jbWQ7XG5cdH0gZWxzZSBpZiAoc2hlbGwuaW5kZXhPZignYmFzaCcpID49IDApIHtcblx0XHRzaGVsbFR5cGUgPSBTaGVsbFR5cGUuYmFzaDtcblx0fSBlbHNlIGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MpIHtcblx0XHRzaGVsbFR5cGUgPSBTaGVsbFR5cGUuY21kOyAvLyBwaWNrIGEgZ29vZCBkZWZhdWx0IGZvciBXaW5kb3dzXG5cdH0gZWxzZSB7XG5cdFx0c2hlbGxUeXBlID0gU2hlbGxUeXBlLmJhc2g7XHQvLyBwaWNrIGEgZ29vZCBkZWZhdWx0IGZvciBhbnl0aGluZyBlbHNlXG5cdH1cblxuXHRsZXQgcXVvdGU6IChzOiBzdHJpbmcpID0+IHN0cmluZztcblx0Ly8gYmVnaW4gY29tbWFuZCB3aXRoIGEgc3BhY2UgdG8gYXZvaWQgcG9sbHV0aW5nIHNoZWxsIGhpc3Rvcnlcblx0bGV0IGNvbW1hbmQgPSAnICc7XG5cblx0c3dpdGNoIChzaGVsbFR5cGUpIHtcblxuXHRcdGNhc2UgU2hlbGxUeXBlLnBvd2Vyc2hlbGw6XG5cblx0XHRcdHF1b3RlID0gKHM6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRzID0gcy5yZXBsYWNlKC9cXCcvZywgJ1xcJ1xcJycpO1xuXHRcdFx0XHRpZiAocy5sZW5ndGggPiAwICYmIHMuY2hhckF0KHMubGVuZ3RoIC0gMSkgPT09ICdcXFxcJykge1xuXHRcdFx0XHRcdHJldHVybiBgJyR7c31cXFxcJ2A7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGAnJHtzfSdgO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGN3ZCkge1xuXHRcdFx0XHRjb25zdCBkcml2ZUxldHRlciA9IGdldERyaXZlTGV0dGVyKGN3ZCk7XG5cdFx0XHRcdGlmIChkcml2ZUxldHRlcikge1xuXHRcdFx0XHRcdGNvbW1hbmQgKz0gYCR7ZHJpdmVMZXR0ZXJ9OjsgYDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb21tYW5kICs9IGBjZCAke3F1b3RlKGN3ZCl9OyBgO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVudikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBlbnYpIHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVudltrZXldO1xuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29tbWFuZCArPSBgUmVtb3ZlLUl0ZW0gZW52OiR7a2V5fTsgYDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29tbWFuZCArPSBgXFwke2Vudjoke2tleX19PScke3ZhbHVlfSc7IGA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXJncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGFyZyA9IGFyZ3Muc2hpZnQoKSE7XG5cdFx0XHRcdGNvbnN0IGNtZCA9IGFyZ3NDYW5CZUludGVycHJldGVkQnlTaGVsbCA/IGFyZyA6IHF1b3RlKGFyZyk7XG5cdFx0XHRcdGNvbW1hbmQgKz0gKGNtZFswXSA9PT0gJ1xcJycpID8gYCYgJHtjbWR9IGAgOiBgJHtjbWR9IGA7XG5cdFx0XHRcdGZvciAoY29uc3QgYSBvZiBhcmdzKSB7XG5cdFx0XHRcdFx0Y29tbWFuZCArPSAoYSA9PT0gJzwnIHx8IGEgPT09ICc+JyB8fCBhcmdzQ2FuQmVJbnRlcnByZXRlZEJ5U2hlbGwpID8gYSA6IHF1b3RlKGEpO1xuXHRcdFx0XHRcdGNvbW1hbmQgKz0gJyAnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgU2hlbGxUeXBlLmNtZDpcblxuXHRcdFx0cXVvdGUgPSAoczogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdC8vIE5vdGU6IFdyYXBwaW5nIGluIGNtZCAvQyBcIi4uLlwiIGNvbXBsaWNhdGVzIHRoZSBlc2NhcGluZy5cblx0XHRcdFx0Ly8gY21kIC9DIFwibm9kZSAtZSBcImNvbnNvbGUubG9nKHByb2Nlc3MuYXJndilcIiBcIlwiXCJBXj4wXCJcIlwiXCIgIyBwcmludHMgXCJBPjBcIlxuXHRcdFx0XHQvLyBjbWQgL0MgXCJub2RlIC1lIFwiY29uc29sZS5sb2cocHJvY2Vzcy5hcmd2KVwiIFwiZm9vXj4gYmFyXCJcIiAjIHByaW50cyBmb28+IGJhclxuXHRcdFx0XHQvLyBPdXRzaWRlIG9mIHRoZSBjbWQgL0MsIGl0IGNvdWxkIGJlIGEgc2ltcGxlIHF1b3RpbmcsIGJ1dCBoZXJlLCB0aGUgXiBpcyBuZWVkZWQgdG9vXG5cdFx0XHRcdHMgPSBzLnJlcGxhY2UoL1xcXCIvZywgJ1wiXCInKTtcblx0XHRcdFx0cyA9IHMucmVwbGFjZSgvKFs+PCFeJnxdKS9nLCAnXiQxJyk7XG5cdFx0XHRcdHJldHVybiAoJyBcIicuc3BsaXQoJycpLnNvbWUoY2hhciA9PiBzLmluY2x1ZGVzKGNoYXIpKSB8fCBzLmxlbmd0aCA9PT0gMCkgPyBgXCIke3N9XCJgIDogcztcblx0XHRcdH07XG5cblx0XHRcdGlmIChjd2QpIHtcblx0XHRcdFx0Y29uc3QgZHJpdmVMZXR0ZXIgPSBnZXREcml2ZUxldHRlcihjd2QpO1xuXHRcdFx0XHRpZiAoZHJpdmVMZXR0ZXIpIHtcblx0XHRcdFx0XHRjb21tYW5kICs9IGAke2RyaXZlTGV0dGVyfTogJiYgYDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb21tYW5kICs9IGBjZCAke3F1b3RlKGN3ZCl9ICYmIGA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW52KSB7XG5cdFx0XHRcdGNvbW1hbmQgKz0gJ2NtZCAvQyBcIic7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IGluIGVudikge1xuXHRcdFx0XHRcdGxldCB2YWx1ZSA9IGVudltrZXldO1xuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29tbWFuZCArPSBgc2V0IFwiJHtrZXl9PVwiICYmIGA7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZSgvWyZefDw+XS9nLCBzID0+IGBeJHtzfWApO1xuXHRcdFx0XHRcdFx0Y29tbWFuZCArPSBgc2V0IFwiJHtrZXl9PSR7dmFsdWV9XCIgJiYgYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYSBvZiBhcmdzKSB7XG5cdFx0XHRcdGNvbW1hbmQgKz0gKGEgPT09ICc8JyB8fCBhID09PSAnPicgfHwgYXJnc0NhbkJlSW50ZXJwcmV0ZWRCeVNoZWxsKSA/IGEgOiBxdW90ZShhKTtcblx0XHRcdFx0Y29tbWFuZCArPSAnICc7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW52KSB7XG5cdFx0XHRcdGNvbW1hbmQgKz0gJ1wiJztcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBTaGVsbFR5cGUuYmFzaDoge1xuXG5cdFx0XHRxdW90ZSA9IChzOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0cyA9IHMucmVwbGFjZSgvKFtcIidcXFxcXFwkIT48IygpXFxbXFxdKiZefCA7e30/YF0pL2csICdcXFxcJDEnKTtcblx0XHRcdFx0cmV0dXJuIHMubGVuZ3RoID09PSAwID8gYFwiXCJgIDogcztcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGhhcmRRdW90ZSA9IChzOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0cmV0dXJuIC9bXlxcd0AlXFwvKz0sLjpeLV0vLnRlc3QocykgPyBgJyR7cy5yZXBsYWNlKC8nL2csICdcXCdcXFxcXFwnXFwnJyl9J2AgOiBzO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGN3ZCkge1xuXHRcdFx0XHRjb21tYW5kICs9IGBjZCAke3F1b3RlKGN3ZCl9IDsgYDtcblx0XHRcdH1cblx0XHRcdGlmIChlbnYpIHtcblx0XHRcdFx0Y29tbWFuZCArPSAnL3Vzci9iaW4vZW52Jztcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZW52KSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBlbnZba2V5XTtcblx0XHRcdFx0XHRpZiAodmFsdWUgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdGNvbW1hbmQgKz0gYCAtdSAke2hhcmRRdW90ZShrZXkpfWA7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbW1hbmQgKz0gYCAke2hhcmRRdW90ZShgJHtrZXl9PSR7dmFsdWV9YCl9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29tbWFuZCArPSAnICc7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGEgb2YgYXJncykge1xuXHRcdFx0XHRjb21tYW5kICs9IChhID09PSAnPCcgfHwgYSA9PT0gJz4nIHx8IGFyZ3NDYW5CZUludGVycHJldGVkQnlTaGVsbCkgPyBhIDogcXVvdGUoYSk7XG5cdFx0XHRcdGNvbW1hbmQgKz0gJyAnO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNvbW1hbmQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxzQkFBc0I7QUFDL0IsWUFBWSxjQUFjO0FBRTFCLFNBQVMsZ0JBQWdCLFNBQWlCLE1BQWlDO0FBQzFFLFNBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3ZDLFFBQUksU0FBUztBQUNiLFVBQU0sUUFBUSxHQUFHLE1BQU0sU0FBUyxJQUFJO0FBQ3BDLFFBQUksTUFBTSxLQUFLO0FBQ2QsWUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLFNBQWlCO0FBQ3pDLGtCQUFVLEtBQUssU0FBUztBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGO0FBQ0EsVUFBTSxHQUFHLFNBQVMsU0FBTztBQUN4QixhQUFPLEdBQUc7QUFBQSxJQUNYLENBQUM7QUFDRCxVQUFNLEdBQUcsU0FBUyxVQUFRO0FBQ3pCLGNBQVEsTUFBTTtBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGO0FBRUEsZUFBc0Isa0JBQWtCLFdBQWlEO0FBQ3hGLE1BQUksV0FBVztBQUdkLFFBQUksU0FBUyxXQUFXO0FBQ3ZCLFlBQU0scUJBQXFCLE1BQU0sT0FBTyw4QkFBOEI7QUFDdEUsYUFBTyxJQUFJLFFBQWlCLGFBQVc7QUFDdEMsMkJBQW1CLGVBQWUsV0FBVyxpQkFBZTtBQUMzRCxrQkFBUSxDQUFDLENBQUMsZUFBZSxZQUFZLFNBQVMsU0FBUyxDQUFDO0FBQUEsUUFDekQsQ0FB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QWUsR0FBRztBQUN0QyxZQUFJLGFBQWE7QUFDaEIscUJBQVcsR0FBRyxXQUFXO0FBQUEsUUFDMUI7QUFDQSxtQkFBVyxNQUFNLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDNUI7QUFDQSxVQUFJLEtBQUs7QUFDUixtQkFBVztBQUNYLG1CQUFXLE9BQU8sS0FBSztBQUN0QixjQUFJLFFBQVEsSUFBSSxHQUFHO0FBQ25CLGNBQUksVUFBVSxNQUFNO0FBQ25CLHVCQUFXLFFBQVEsR0FBRztBQUFBLFVBQ3ZCLE9BQU87QUFDTixvQkFBUSxNQUFNLFFBQVEsWUFBWSxPQUFLLElBQUksQ0FBQyxFQUFFO0FBQzlDLHVCQUFXLFFBQVEsR0FBRyxJQUFJLEtBQUs7QUFBQSxVQUNoQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsS0FBSyxNQUFNO0FBQ3JCLG1CQUFZLE1BQU0sT0FBTyxNQUFNLE9BQU8sOEJBQStCLElBQUksTUFBTSxDQUFDO0FBQ2hGLG1CQUFXO0FBQUEsTUFDWjtBQUNBLFVBQUksS0FBSztBQUNSLG1CQUFXO0FBQUEsTUFDWjtBQUNBO0FBQUEsSUFFRCxLQUFLLGNBQWdCO0FBRXBCLGNBQVEsQ0FBQyxNQUFjO0FBQ3RCLFlBQUksRUFBRSxRQUFRLG1DQUFtQyxNQUFNO0FBQ3ZELGVBQU8sRUFBRSxXQUFXLElBQUksT0FBTztBQUFBLE1BQ2hDO0FBRUEsWUFBTSxZQUFZLENBQUMsTUFBYztBQUNoQyxlQUFPLG1CQUFtQixLQUFLLENBQUMsSUFBSSxJQUFJLEVBQUUsUUFBUSxNQUFNLE9BQVUsQ0FBQyxNQUFNO0FBQUEsTUFDMUU7QUFFQSxVQUFJLEtBQUs7QUFDUixtQkFBVyxNQUFNLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDNUI7QUFDQSxVQUFJLEtBQUs7QUFDUixtQkFBVztBQUNYLG1CQUFXLE9BQU8sS0FBSztBQUN0QixnQkFBTSxRQUFRLElBQUksR0FBRztBQUNyQixjQUFJLFVBQVUsTUFBTTtBQUNuQix1QkFBVyxPQUFPLFVBQVUsR0FBRyxDQUFDO0FBQUEsVUFDakMsT0FBTztBQUNOLHVCQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsSUFBSSxLQUFLLEVBQUUsQ0FBQztBQUFBLFVBQzVDO0FBQUEsUUFDRDtBQUNBLG1CQUFXO0FBQUEsTUFDWjtBQUNBLGlCQUFXLEtBQUssTUFBTTtBQUNyQixtQkFBWSxNQUFNLE9BQU8sTUFBTSxPQUFPLDhCQUErQixJQUFJLE1BQU0sQ0FBQztBQUNoRixtQkFBVztBQUFBLE1BQ1o7QUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJTaGVsbFR5cGUiXQp9Cg==
