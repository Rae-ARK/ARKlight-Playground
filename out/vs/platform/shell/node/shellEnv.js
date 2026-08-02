import { spawn } from "child_process";
import { basename } from "../../../base/common/path.js";
import { localize } from "../../../nls.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { CancellationError, isCancellationError } from "../../../base/common/errors.js";
import { isWindows, OS } from "../../../base/common/platform.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { isLaunchedFromCli } from "../../environment/node/argvHelper.js";
import { Promises } from "../../../base/common/async.js";
import { clamp } from "../../../base/common/numbers.js";
let unixShellEnvPromise = void 0;
async function getResolvedShellEnv(configurationService, logService, args, env) {
  if (args["force-disable-user-env"]) {
    logService.trace("resolveShellEnv(): skipped (--force-disable-user-env)");
    return {};
  } else if (isWindows) {
    logService.trace("resolveShellEnv(): skipped (Windows)");
    return {};
  } else if (isLaunchedFromCli(env) && !args["force-user-env"]) {
    logService.trace("resolveShellEnv(): skipped (VSCODE_CLI is set)");
    return {};
  } else {
    if (isLaunchedFromCli(env)) {
      logService.trace("resolveShellEnv(): running (--force-user-env)");
    } else {
      logService.trace("resolveShellEnv(): running (macOS/Linux)");
    }
    if (!unixShellEnvPromise) {
      unixShellEnvPromise = Promises.withAsyncBody(async (resolve, reject) => {
        const cts = new CancellationTokenSource();
        let timeoutValue = 1e4;
        const configuredTimeoutValue = configurationService.getValue("application.shellEnvironmentResolutionTimeout");
        if (typeof configuredTimeoutValue === "number") {
          timeoutValue = clamp(configuredTimeoutValue, 1, 120) * 1e3;
        }
        const timeout = setTimeout(() => {
          cts.dispose(true);
          reject(new Error(localize("resolveShellEnvTimeout", "Unable to resolve your shell environment in a reasonable time. Please review your shell configuration and restart.")));
        }, timeoutValue);
        try {
          resolve(await doResolveUnixShellEnv(logService, cts.token));
        } catch (error) {
          if (!isCancellationError(error) && !cts.token.isCancellationRequested) {
            reject(new Error(localize("resolveShellEnvError", "Unable to resolve your shell environment: {0}", toErrorMessage(error))));
          } else {
            resolve({});
          }
        } finally {
          clearTimeout(timeout);
          cts.dispose();
        }
      });
    }
    return unixShellEnvPromise;
  }
}
async function doResolveUnixShellEnv(logService, token) {
  const runAsNode = process.env["ELECTRON_RUN_AS_NODE"];
  logService.trace("getUnixShellEnvironment#runAsNode", runAsNode);
  const noAttach = process.env["ELECTRON_NO_ATTACH_CONSOLE"];
  logService.trace("getUnixShellEnvironment#noAttach", noAttach);
  const mark = generateUuid().replace(/-/g, "").substr(0, 12);
  const regex = new RegExp(mark + "({.*})" + mark);
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    ELECTRON_NO_ATTACH_CONSOLE: "1",
    VSCODE_RESOLVING_ENVIRONMENT: "1"
  };
  logService.trace("getUnixShellEnvironment#env", env);
  const systemShellUnix = await getSystemShell(OS, env);
  logService.trace("getUnixShellEnvironment#shell", systemShellUnix);
  return new Promise((resolve, reject) => {
    if (token.isCancellationRequested) {
      return reject(new CancellationError());
    }
    const name = basename(systemShellUnix);
    let command, shellArgs;
    const extraArgs = "";
    if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
      command = `& '${process.execPath}' ${extraArgs} -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`;
      shellArgs = ["-Login", "-Command"];
    } else if (name === "nu") {
      command = `^'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
      shellArgs = ["-i", "-l", "-c"];
    } else if (name === "xonsh") {
      command = `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`;
      shellArgs = ["-i", "-l", "-c"];
    } else {
      command = `'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
      if (name === "tcsh" || name === "csh") {
        shellArgs = ["-ic"];
      } else {
        shellArgs = ["-i", "-l", "-c"];
      }
    }
    logService.trace("getUnixShellEnvironment#spawn", JSON.stringify(shellArgs), command);
    const child = spawn(systemShellUnix, [...shellArgs, command], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env
    });
    token.onCancellationRequested(() => {
      child.kill();
      return reject(new CancellationError());
    });
    child.on("error", (err) => {
      logService.error("getUnixShellEnvironment#errorChildProcess", toErrorMessage(err));
      reject(err);
    });
    const buffers = [];
    child.stdout.on("data", (b) => buffers.push(b));
    const stderr = [];
    child.stderr.on("data", (b) => stderr.push(b));
    child.on("close", (code, signal) => {
      const raw = Buffer.concat(buffers).toString("utf8");
      logService.trace("getUnixShellEnvironment#raw", raw);
      const stderrStr = Buffer.concat(stderr).toString("utf8");
      if (stderrStr.trim()) {
        logService.trace("getUnixShellEnvironment#stderr", stderrStr);
      }
      if (code || signal) {
        return reject(new Error(localize("resolveShellEnvExitError", "Unexpected exit code from spawned shell (code {0}, signal {1})", code, signal)));
      }
      const match = regex.exec(raw);
      const rawStripped = match ? match[1] : "{}";
      try {
        const env2 = JSON.parse(rawStripped);
        if (runAsNode) {
          env2["ELECTRON_RUN_AS_NODE"] = runAsNode;
        } else {
          delete env2["ELECTRON_RUN_AS_NODE"];
        }
        if (noAttach) {
          env2["ELECTRON_NO_ATTACH_CONSOLE"] = noAttach;
        } else {
          delete env2["ELECTRON_NO_ATTACH_CONSOLE"];
        }
        delete env2["VSCODE_RESOLVING_ENVIRONMENT"];
        delete env2["XDG_RUNTIME_DIR"];
        logService.trace("getUnixShellEnvironment#result", env2);
        resolve(env2);
      } catch (err) {
        logService.error("getUnixShellEnvironment#errorCaught", toErrorMessage(err));
        reject(err);
      }
    });
  });
}
export {
  getResolvedShellEnv
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NoZWxsL25vZGUvc2hlbGxFbnYudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc1dpbmRvd3MsIE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBnZXRTeXN0ZW1TaGVsbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9zaGVsbC5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2FyZ3YuanMnO1xuaW1wb3J0IHsgaXNMYXVuY2hlZEZyb21DbGkgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9ub2RlL2FyZ3ZIZWxwZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcblxubGV0IHVuaXhTaGVsbEVudlByb21pc2U6IFByb21pc2U8dHlwZW9mIHByb2Nlc3MuZW52PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgc2hlbGwgZW52aXJvbm1lbnQgYnkgc3Bhd25pbmcgYSBzaGVsbC4gVGhpcyBjYWxsIHdpbGwgY2FjaGVcbiAqIHRoZSBzaGVsbCBzcGF3bmluZyBzbyB0aGF0IHN1YnNlcXVlbnQgaW52b2NhdGlvbnMgdXNlIHRoYXQgY2FjaGVkIHJlc3VsdC5cbiAqXG4gKiBXaWxsIHRocm93IGFuIGVycm9yIGlmOlxuICogLSB3ZSBoaXQgYSB0aW1lb3V0IG9mIGBNQVhfU0hFTExfUkVTT0xWRV9USU1FYFxuICogLSBhbnkgb3RoZXIgZXJyb3IgZnJvbSBzcGF3bmluZyBhIHNoZWxsIHRvIGZpZ3VyZSBvdXQgdGhlIGVudmlyb25tZW50XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRSZXNvbHZlZFNoZWxsRW52KGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBhcmdzOiBOYXRpdmVQYXJzZWRBcmdzLCBlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQpOiBQcm9taXNlPHR5cGVvZiBwcm9jZXNzLmVudj4ge1xuXG5cdC8vIFNraXAgaWYgLS1mb3JjZS1kaXNhYmxlLXVzZXItZW52XG5cdGlmIChhcmdzWydmb3JjZS1kaXNhYmxlLXVzZXItZW52J10pIHtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZXNvbHZlU2hlbGxFbnYoKTogc2tpcHBlZCAoLS1mb3JjZS1kaXNhYmxlLXVzZXItZW52KScpO1xuXG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0Ly8gU2tpcCBvbiB3aW5kb3dzXG5cdGVsc2UgaWYgKGlzV2luZG93cykge1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoJ3Jlc29sdmVTaGVsbEVudigpOiBza2lwcGVkIChXaW5kb3dzKScpO1xuXG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0Ly8gU2tpcCBpZiBydW5uaW5nIGZyb20gQ0xJIGFscmVhZHlcblx0ZWxzZSBpZiAoaXNMYXVuY2hlZEZyb21DbGkoZW52KSAmJiAhYXJnc1snZm9yY2UtdXNlci1lbnYnXSkge1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoJ3Jlc29sdmVTaGVsbEVudigpOiBza2lwcGVkIChWU0NPREVfQ0xJIGlzIHNldCknKTtcblxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdC8vIE90aGVyd2lzZSByZXNvbHZlIChtYWNPUywgTGludXgpXG5cdGVsc2Uge1xuXHRcdGlmIChpc0xhdW5jaGVkRnJvbUNsaShlbnYpKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZXNvbHZlU2hlbGxFbnYoKTogcnVubmluZyAoLS1mb3JjZS11c2VyLWVudiknKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVzb2x2ZVNoZWxsRW52KCk6IHJ1bm5pbmcgKG1hY09TL0xpbnV4KScpO1xuXHRcdH1cblxuXHRcdC8vIENhbGwgdGhpcyBvbmx5IG9uY2UgYW5kIGNhY2hlIHRoZSBwcm9taXNlIGZvclxuXHRcdC8vIHN1YnNlcXVlbnQgY2FsbHMgc2luY2UgdGhpcyBvcGVyYXRpb24gY2FuIGJlXG5cdFx0Ly8gZXhwZW5zaXZlIChzcGF3bnMgYSBwcm9jZXNzKS5cblx0XHRpZiAoIXVuaXhTaGVsbEVudlByb21pc2UpIHtcblx0XHRcdHVuaXhTaGVsbEVudlByb21pc2UgPSBQcm9taXNlcy53aXRoQXN5bmNCb2R5PE5vZGVKUy5Qcm9jZXNzRW52Pihhc3luYyAocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0XHRcdGxldCB0aW1lb3V0VmFsdWUgPSAxMDAwMDsgLy8gZGVmYXVsdCB0byAxMCBzZWNvbmRzXG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRUaW1lb3V0VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx1bmtub3duPignYXBwbGljYXRpb24uc2hlbGxFbnZpcm9ubWVudFJlc29sdXRpb25UaW1lb3V0Jyk7XG5cdFx0XHRcdGlmICh0eXBlb2YgY29uZmlndXJlZFRpbWVvdXRWYWx1ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHR0aW1lb3V0VmFsdWUgPSBjbGFtcChjb25maWd1cmVkVGltZW91dFZhbHVlLCAxLCAxMjApICogMTAwMCAvKiBjb252ZXJ0IGZyb20gc2Vjb25kcyAqLztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEdpdmUgdXAgcmVzb2x2aW5nIHNoZWxsIGVudiBhZnRlciBzb21lIHRpbWVcblx0XHRcdFx0Y29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IobG9jYWxpemUoJ3Jlc29sdmVTaGVsbEVudlRpbWVvdXQnLCBcIlVuYWJsZSB0byByZXNvbHZlIHlvdXIgc2hlbGwgZW52aXJvbm1lbnQgaW4gYSByZWFzb25hYmxlIHRpbWUuIFBsZWFzZSByZXZpZXcgeW91ciBzaGVsbCBjb25maWd1cmF0aW9uIGFuZCByZXN0YXJ0LlwiKSkpO1xuXHRcdFx0XHR9LCB0aW1lb3V0VmFsdWUpO1xuXG5cdFx0XHRcdC8vIFJlc29sdmUgc2hlbGwgZW52IGFuZCBoYW5kbGUgZXJyb3JzXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShhd2FpdCBkb1Jlc29sdmVVbml4U2hlbGxFbnYobG9nU2VydmljZSwgY3RzLnRva2VuKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSAmJiAhY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGxvY2FsaXplKCdyZXNvbHZlU2hlbGxFbnZFcnJvcicsIFwiVW5hYmxlIHRvIHJlc29sdmUgeW91ciBzaGVsbCBlbnZpcm9ubWVudDogezB9XCIsIHRvRXJyb3JNZXNzYWdlKGVycm9yKSkpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh7fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5peFNoZWxsRW52UHJvbWlzZTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBkb1Jlc29sdmVVbml4U2hlbGxFbnYobG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dHlwZW9mIHByb2Nlc3MuZW52PiB7XG5cdGNvbnN0IHJ1bkFzTm9kZSA9IHByb2Nlc3MuZW52WydFTEVDVFJPTl9SVU5fQVNfTk9ERSddO1xuXHRsb2dTZXJ2aWNlLnRyYWNlKCdnZXRVbml4U2hlbGxFbnZpcm9ubWVudCNydW5Bc05vZGUnLCBydW5Bc05vZGUpO1xuXG5cdGNvbnN0IG5vQXR0YWNoID0gcHJvY2Vzcy5lbnZbJ0VMRUNUUk9OX05PX0FUVEFDSF9DT05TT0xFJ107XG5cdGxvZ1NlcnZpY2UudHJhY2UoJ2dldFVuaXhTaGVsbEVudmlyb25tZW50I25vQXR0YWNoJywgbm9BdHRhY2gpO1xuXG5cdGNvbnN0IG1hcmsgPSBnZW5lcmF0ZVV1aWQoKS5yZXBsYWNlKC8tL2csICcnKS5zdWJzdHIoMCwgMTIpO1xuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAobWFyayArICcoey4qfSknICsgbWFyayk7XG5cblx0Y29uc3QgZW52ID0ge1xuXHRcdC4uLnByb2Nlc3MuZW52LFxuXHRcdEVMRUNUUk9OX1JVTl9BU19OT0RFOiAnMScsXG5cdFx0RUxFQ1RST05fTk9fQVRUQUNIX0NPTlNPTEU6ICcxJyxcblx0XHRWU0NPREVfUkVTT0xWSU5HX0VOVklST05NRU5UOiAnMSdcblx0fTtcblxuXHRsb2dTZXJ2aWNlLnRyYWNlKCdnZXRVbml4U2hlbGxFbnZpcm9ubWVudCNlbnYnLCBlbnYpO1xuXHRjb25zdCBzeXN0ZW1TaGVsbFVuaXggPSBhd2FpdCBnZXRTeXN0ZW1TaGVsbChPUywgZW52KTtcblx0bG9nU2VydmljZS50cmFjZSgnZ2V0VW5peFNoZWxsRW52aXJvbm1lbnQjc2hlbGwnLCBzeXN0ZW1TaGVsbFVuaXgpO1xuXG5cdHJldHVybiBuZXcgUHJvbWlzZTx0eXBlb2YgcHJvY2Vzcy5lbnY+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiByZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH1cblxuXHRcdC8vIGhhbmRsZSBwb3B1bGFyIG5vbi1QT1NJWCBzaGVsbHNcblx0XHRjb25zdCBuYW1lID0gYmFzZW5hbWUoc3lzdGVtU2hlbGxVbml4KTtcblx0XHRsZXQgY29tbWFuZDogc3RyaW5nLCBzaGVsbEFyZ3M6IEFycmF5PHN0cmluZz47XG5cdFx0Y29uc3QgZXh0cmFBcmdzID0gJyc7XG5cdFx0aWYgKC9eKD86cHdzaHxwb3dlcnNoZWxsKSg/Oi1wcmV2aWV3KT8kLy50ZXN0KG5hbWUpKSB7XG5cdFx0XHQvLyBPbGRlciB2ZXJzaW9ucyBvZiBQb3dlclNoZWxsIHJlbW92ZXMgZG91YmxlIHF1b3RlcyBzb21ldGltZXMgc28gd2UgdXNlIFwiZG91YmxlIHNpbmdsZSBxdW90ZXNcIiB3aGljaCBpcyBob3dcblx0XHRcdC8vIHlvdSBlc2NhcGUgc2luZ2xlIHF1b3RlcyBpbnNpZGUgb2YgYSBzaW5nbGUgcXVvdGVkIHN0cmluZy5cblx0XHRcdGNvbW1hbmQgPSBgJiAnJHtwcm9jZXNzLmV4ZWNQYXRofScgJHtleHRyYUFyZ3N9IC1wICcnJyR7bWFya30nJyArIEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52KSArICcnJHttYXJrfScnJ2A7XG5cdFx0XHRzaGVsbEFyZ3MgPSBbJy1Mb2dpbicsICctQ29tbWFuZCddO1xuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ251JykgeyAvLyBudXNoZWxsIHJlcXVpcmVzIF4gYmVmb3JlIHF1b3RlZCBwYXRoIHRvIHRyZWF0IGl0IGFzIGEgY29tbWFuZFxuXHRcdFx0Y29tbWFuZCA9IGBeJyR7cHJvY2Vzcy5leGVjUGF0aH0nICR7ZXh0cmFBcmdzfSAtcCAnXCIke21hcmt9XCIgKyBKU09OLnN0cmluZ2lmeShwcm9jZXNzLmVudikgKyBcIiR7bWFya31cIidgO1xuXHRcdFx0c2hlbGxBcmdzID0gWyctaScsICctbCcsICctYyddO1xuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ3hvbnNoJykgeyAvLyAjMjAwMzc0OiBuYXRpdmUgaW1wbGVtZW50YXRpb24gaXMgc2hvcnRlclxuXHRcdFx0Y29tbWFuZCA9IGBpbXBvcnQgb3MsIGpzb247IHByaW50KFwiJHttYXJrfVwiLCBqc29uLmR1bXBzKGRpY3Qob3MuZW52aXJvbikpLCBcIiR7bWFya31cIilgO1xuXHRcdFx0c2hlbGxBcmdzID0gWyctaScsICctbCcsICctYyddO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb21tYW5kID0gYCcke3Byb2Nlc3MuZXhlY1BhdGh9JyAke2V4dHJhQXJnc30gLXAgJ1wiJHttYXJrfVwiICsgSlNPTi5zdHJpbmdpZnkocHJvY2Vzcy5lbnYpICsgXCIke21hcmt9XCInYDtcblxuXHRcdFx0aWYgKG5hbWUgPT09ICd0Y3NoJyB8fCBuYW1lID09PSAnY3NoJykge1xuXHRcdFx0XHRzaGVsbEFyZ3MgPSBbJy1pYyddO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2hlbGxBcmdzID0gWyctaScsICctbCcsICctYyddO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxvZ1NlcnZpY2UudHJhY2UoJ2dldFVuaXhTaGVsbEVudmlyb25tZW50I3NwYXduJywgSlNPTi5zdHJpbmdpZnkoc2hlbGxBcmdzKSwgY29tbWFuZCk7XG5cblx0XHRjb25zdCBjaGlsZCA9IHNwYXduKHN5c3RlbVNoZWxsVW5peCwgWy4uLnNoZWxsQXJncywgY29tbWFuZF0sIHtcblx0XHRcdGRldGFjaGVkOiB0cnVlLFxuXHRcdFx0c3RkaW86IFsnaWdub3JlJywgJ3BpcGUnLCAncGlwZSddLFxuXHRcdFx0ZW52XG5cdFx0fSk7XG5cblx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRjaGlsZC5raWxsKCk7XG5cblx0XHRcdHJldHVybiByZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH0pO1xuXG5cdFx0Y2hpbGQub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ2dldFVuaXhTaGVsbEVudmlyb25tZW50I2Vycm9yQ2hpbGRQcm9jZXNzJywgdG9FcnJvck1lc3NhZ2UoZXJyKSk7XG5cdFx0XHRyZWplY3QoZXJyKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGJ1ZmZlcnM6IEJ1ZmZlcltdID0gW107XG5cdFx0Y2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgYiA9PiBidWZmZXJzLnB1c2goYikpO1xuXG5cdFx0Y29uc3Qgc3RkZXJyOiBCdWZmZXJbXSA9IFtdO1xuXHRcdGNoaWxkLnN0ZGVyci5vbignZGF0YScsIGIgPT4gc3RkZXJyLnB1c2goYikpO1xuXG5cdFx0Y2hpbGQub24oJ2Nsb3NlJywgKGNvZGUsIHNpZ25hbCkgPT4ge1xuXHRcdFx0Y29uc3QgcmF3ID0gQnVmZmVyLmNvbmNhdChidWZmZXJzKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0bG9nU2VydmljZS50cmFjZSgnZ2V0VW5peFNoZWxsRW52aXJvbm1lbnQjcmF3JywgcmF3KTtcblxuXHRcdFx0Y29uc3Qgc3RkZXJyU3RyID0gQnVmZmVyLmNvbmNhdChzdGRlcnIpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0XHRpZiAoc3RkZXJyU3RyLnRyaW0oKSkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdnZXRVbml4U2hlbGxFbnZpcm9ubWVudCNzdGRlcnInLCBzdGRlcnJTdHIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29kZSB8fCBzaWduYWwpIHtcblx0XHRcdFx0cmV0dXJuIHJlamVjdChuZXcgRXJyb3IobG9jYWxpemUoJ3Jlc29sdmVTaGVsbEVudkV4aXRFcnJvcicsIFwiVW5leHBlY3RlZCBleGl0IGNvZGUgZnJvbSBzcGF3bmVkIHNoZWxsIChjb2RlIHswfSwgc2lnbmFsIHsxfSlcIiwgY29kZSwgc2lnbmFsKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXRjaCA9IHJlZ2V4LmV4ZWMocmF3KTtcblx0XHRcdGNvbnN0IHJhd1N0cmlwcGVkID0gbWF0Y2ggPyBtYXRjaFsxXSA6ICd7fSc7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVudiA9IEpTT04ucGFyc2UocmF3U3RyaXBwZWQpO1xuXG5cdFx0XHRcdGlmIChydW5Bc05vZGUpIHtcblx0XHRcdFx0XHRlbnZbJ0VMRUNUUk9OX1JVTl9BU19OT0RFJ10gPSBydW5Bc05vZGU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGVudlsnRUxFQ1RST05fUlVOX0FTX05PREUnXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChub0F0dGFjaCkge1xuXHRcdFx0XHRcdGVudlsnRUxFQ1RST05fTk9fQVRUQUNIX0NPTlNPTEUnXSA9IG5vQXR0YWNoO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0VMRUNUUk9OX05PX0FUVEFDSF9DT05TT0xFJ107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkZWxldGUgZW52WydWU0NPREVfUkVTT0xWSU5HX0VOVklST05NRU5UJ107XG5cblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyNTkzI2lzc3VlY29tbWVudC0zMzYwNTA3NThcblx0XHRcdFx0ZGVsZXRlIGVudlsnWERHX1JVTlRJTUVfRElSJ107XG5cblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgnZ2V0VW5peFNoZWxsRW52aXJvbm1lbnQjcmVzdWx0JywgZW52KTtcblx0XHRcdFx0cmVzb2x2ZShlbnYpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ2dldFVuaXhTaGVsbEVudmlyb25tZW50I2Vycm9yQ2F1Z2h0JywgdG9FcnJvck1lc3NhZ2UoZXJyKSk7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQThCLFdBQVcsVUFBVTtBQUNuRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGFBQWE7QUFFdEIsSUFBSSxzQkFBK0Q7QUFVbkUsZUFBc0Isb0JBQW9CLHNCQUE2QyxZQUF5QixNQUF3QixLQUF1RDtBQUc5TCxNQUFJLEtBQUssd0JBQXdCLEdBQUc7QUFDbkMsZUFBVyxNQUFNLHVEQUF1RDtBQUV4RSxXQUFPLENBQUM7QUFBQSxFQUNULFdBR1MsV0FBVztBQUNuQixlQUFXLE1BQU0sc0NBQXNDO0FBRXZELFdBQU8sQ0FBQztBQUFBLEVBQ1QsV0FHUyxrQkFBa0IsR0FBRyxLQUFLLENBQUMsS0FBSyxnQkFBZ0IsR0FBRztBQUMzRCxlQUFXLE1BQU0sZ0RBQWdEO0FBRWpFLFdBQU8sQ0FBQztBQUFBLEVBQ1QsT0FHSztBQUNKLFFBQUksa0JBQWtCLEdBQUcsR0FBRztBQUMzQixpQkFBVyxNQUFNLCtDQUErQztBQUFBLElBQ2pFLE9BQU87QUFDTixpQkFBVyxNQUFNLDBDQUEwQztBQUFBLElBQzVEO0FBS0EsUUFBSSxDQUFDLHFCQUFxQjtBQUN6Qiw0QkFBc0IsU0FBUyxjQUFpQyxPQUFPLFNBQVMsV0FBVztBQUMxRixjQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFFeEMsWUFBSSxlQUFlO0FBQ25CLGNBQU0seUJBQXlCLHFCQUFxQixTQUFrQiwrQ0FBK0M7QUFDckgsWUFBSSxPQUFPLDJCQUEyQixVQUFVO0FBQy9DLHlCQUFlLE1BQU0sd0JBQXdCLEdBQUcsR0FB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
