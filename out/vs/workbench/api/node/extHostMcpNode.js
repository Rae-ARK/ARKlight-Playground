import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { parseEnvFile } from "../../../base/common/envfile.js";
import { untildify } from "../../../base/common/labels.js";
import { Lazy } from "../../../base/common/lazy.js";
import { DisposableMap } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import { URI } from "../../../base/common/uri.js";
import { StreamSplitter } from "../../../base/node/nodeStreams.js";
import { findExecutable } from "../../../base/node/processes.js";
import { LogLevel } from "../../../platform/log/common/log.js";
import { McpConnectionState, McpServerTransportType } from "../../contrib/mcp/common/mcpTypes.js";
import { McpStdioStateHandler } from "../../contrib/mcp/node/mcpStdioStateHandler.js";
import { ExtHostMcpService, McpHTTPHandle } from "../common/extHostMcp.js";
class NodeExtHostMpcService extends ExtHostMcpService {
  constructor() {
    super(...arguments);
    this.nodeServers = this._register(new DisposableMap());
  }
  _startMcp(id, launch, defaultCwd, errorOnUserInteraction) {
    if (launch.type === McpServerTransportType.Stdio) {
      this.startNodeMpc(id, launch, defaultCwd);
    } else if (launch.type === McpServerTransportType.HTTP) {
      this._sseEventSources.set(id, new McpHTTPHandleNode(id, launch, this._proxy, this._logService, errorOnUserInteraction));
    } else {
      super._startMcp(id, launch, defaultCwd, errorOnUserInteraction);
    }
  }
  $stopMcp(id) {
    const nodeServer = this.nodeServers.get(id);
    if (nodeServer) {
      nodeServer.stop();
    } else {
      super.$stopMcp(id);
    }
  }
  $sendMessage(id, message) {
    const nodeServer = this.nodeServers.get(id);
    if (nodeServer) {
      nodeServer.write(message);
    } else {
      super.$sendMessage(id, message);
    }
  }
  async startNodeMpc(id, launch, defaultCwd) {
    const onError = (err) => this._proxy.$onDidChangeState(id, {
      state: McpConnectionState.Kind.Error,
      // eslint-disable-next-line local/code-no-any-casts
      code: err.hasOwnProperty("code") ? String(err.code) : void 0,
      message: typeof err === "string" ? err : err.message
    });
    const env = { ...process.env };
    if (launch.envFile) {
      try {
        for (const [key, value] of parseEnvFile(await readFile(launch.envFile, "utf-8"))) {
          env[key] = value;
        }
      } catch (e) {
        onError(`Failed to read envFile '${launch.envFile}': ${e.message}`);
        return;
      }
    }
    for (const [key, value] of Object.entries(launch.env)) {
      if (key.toUpperCase() === "PATH" && value !== null) {
        env[key] = env[key] ? `${env[key]}${path.delimiter}${String(value)}` : String(value);
        continue;
      }
      env[key] = value === null ? void 0 : String(value);
    }
    let child;
    try {
      const home = homedir();
      let cwd = launch.cwd ? untildify(launch.cwd, home) : defaultCwd?.fsPath || home;
      if (!path.isAbsolute(cwd)) {
        cwd = defaultCwd ? path.join(defaultCwd.fsPath, cwd) : path.join(home, cwd);
      }
      const { executable, args, shell } = await formatSubprocessArguments(
        untildify(launch.command, home),
        launch.args.map((a) => untildify(a, home)),
        cwd,
        env
      );
      this._proxy.$onDidPublishLog(id, LogLevel.Debug, `Server command line: ${executable} ${args.join(" ")}`);
      child = spawn(executable, args, {
        stdio: "pipe",
        cwd,
        env,
        shell
      });
    } catch (e) {
      onError(e);
      return;
    }
    const connectionManager = new McpStdioStateHandler(child);
    this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Starting });
    child.stdout.pipe(new StreamSplitter("\n")).on("data", (line) => this._proxy.$onDidReceiveMessage(id, line.toString()));
    child.stdin.on("error", onError);
    child.stdout.on("error", onError);
    child.stderr.pipe(new StreamSplitter("\n")).on("data", (line) => this._proxy.$onDidPublishLog(id, LogLevel.Warning, `[server stderr] ${line.toString().trimEnd()}`));
    child.on("spawn", () => this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Running }));
    child.on("error", (e) => {
      onError(e);
    });
    child.on("exit", (code) => {
      this.nodeServers.deleteAndDispose(id);
      if (code === 0 || connectionManager.stopped) {
        this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Stopped });
      } else {
        this._proxy.$onDidChangeState(id, {
          state: McpConnectionState.Kind.Error,
          message: `Process exited with code ${code}`
        });
      }
    });
    this.nodeServers.set(id, connectionManager);
  }
}
class McpHTTPHandleNode extends McpHTTPHandle {
  constructor() {
    super(...arguments);
    this._undici = new Lazy(() => import("undici"));
  }
  async _fetchInternal(url, init) {
    const { fetch, Agent } = await this._undici.value;
    const undiciInit = { ...init };
    let httpUrl = url;
    const uri = URI.parse(url);
    if (uri.scheme === "unix" || uri.scheme === "pipe") {
      undiciInit.dispatcher = new Agent({
        socketPath: uri.path
      });
      httpUrl = uri.with({
        scheme: "http",
        authority: "localhost",
        // HTTP always wants a host (not that we're using it), but if we're using a socket or pipe then localhost is sorta right anyway
        path: uri.fragment
      }).toString(true);
    } else {
      return super._fetchInternal(url, init);
    }
    const undiciResponse = await fetch(httpUrl, undiciInit);
    return {
      status: undiciResponse.status,
      statusText: undiciResponse.statusText,
      headers: undiciResponse.headers,
      // undici `Headers` class no longer overlaps with lib.dom `Headers` (`SpecIterableIterator` vs `HeadersIterator`)
      body: undiciResponse.body,
      // Way down in `ReadableStreamReadDoneResult<T>`, `value` is optional in the undici type but required (yet can be `undefined`) in the standard type
      url: undiciResponse.url,
      json: () => undiciResponse.json(),
      text: () => undiciResponse.text()
    };
  }
}
const windowsShellScriptRe = /\.(bat|cmd)$/i;
const escapeCmdArg = (s) => `"${s.replace(/"/g, '""')}"`;
const formatSubprocessArguments = async (executable, args, cwd, env) => {
  if (process.platform !== "win32") {
    return { executable, args, shell: false };
  }
  const found = await findExecutable(executable, cwd, void 0, env);
  if (found && windowsShellScriptRe.test(found)) {
    return {
      executable: escapeCmdArg(found),
      args: args.map(escapeCmdArg),
      shell: true
    };
  }
  return { executable, args, shell: false };
};
export {
  NodeExtHostMpcService,
  escapeCmdArg,
  formatSubprocessArguments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRIb3N0TWNwTm9kZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoaWxkUHJvY2Vzc1dpdGhvdXROdWxsU3RyZWFtcywgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHJlYWRGaWxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgaG9tZWRpciB9IGZyb20gJ29zJztcbmltcG9ydCB0eXBlIHsgUmVxdWVzdEluaXQgYXMgVW5kaWNpUmVxdWVzdEluaXQgfSBmcm9tICd1bmRpY2knO1xuaW1wb3J0IHsgcGFyc2VFbnZGaWxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZW52ZmlsZS5qcyc7XG5pbXBvcnQgeyB1bnRpbGRpZnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFN0cmVhbVNwbGl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL25vZGVTdHJlYW1zLmpzJztcbmltcG9ydCB7IGZpbmRFeGVjdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1jcENvbm5lY3Rpb25TdGF0ZSwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRTdGRpbywgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNY3BTdGRpb1N0YXRlSGFuZGxlciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL25vZGUvbWNwU3RkaW9TdGF0ZUhhbmRsZXIuanMnO1xuaW1wb3J0IHsgQ29tbW9uUmVxdWVzdEluaXQsIENvbW1vblJlc3BvbnNlLCBFeHRIb3N0TWNwU2VydmljZSwgTWNwSFRUUEhhbmRsZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0TWNwLmpzJztcblxuZXhwb3J0IGNsYXNzIE5vZGVFeHRIb3N0TXBjU2VydmljZSBleHRlbmRzIEV4dEhvc3RNY3BTZXJ2aWNlIHtcblx0cHJpdmF0ZSBub2RlU2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgTWNwU3RkaW9TdGF0ZUhhbmRsZXI+KCkpO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfc3RhcnRNY3AoaWQ6IG51bWJlciwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gsIGRlZmF1bHRDd2Q/OiBVUkksIGVycm9yT25Vc2VySW50ZXJhY3Rpb24/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGxhdW5jaC50eXBlID09PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvKSB7XG5cdFx0XHR0aGlzLnN0YXJ0Tm9kZU1wYyhpZCwgbGF1bmNoLCBkZWZhdWx0Q3dkKTtcblx0XHR9IGVsc2UgaWYgKGxhdW5jaC50eXBlID09PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFApIHtcblx0XHRcdHRoaXMuX3NzZUV2ZW50U291cmNlcy5zZXQoaWQsIG5ldyBNY3BIVFRQSGFuZGxlTm9kZShpZCwgbGF1bmNoLCB0aGlzLl9wcm94eSwgdGhpcy5fbG9nU2VydmljZSwgZXJyb3JPblVzZXJJbnRlcmFjdGlvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci5fc3RhcnRNY3AoaWQsIGxhdW5jaCwgZGVmYXVsdEN3ZCwgZXJyb3JPblVzZXJJbnRlcmFjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgJHN0b3BNY3AoaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGVTZXJ2ZXIgPSB0aGlzLm5vZGVTZXJ2ZXJzLmdldChpZCk7XG5cdFx0aWYgKG5vZGVTZXJ2ZXIpIHtcblx0XHRcdG5vZGVTZXJ2ZXIuc3RvcCgpOyAvLyB3aWxsIGdldCByZW1vdmVkIGZyb20gbWFwIHdoZW4gcHJvY2VzcyBpcyBmdWxseSBzdG9wcGVkXG5cdFx0fSBlbHNlIHtcblx0XHRcdHN1cGVyLiRzdG9wTWNwKGlkKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSAkc2VuZE1lc3NhZ2UoaWQ6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZVNlcnZlciA9IHRoaXMubm9kZVNlcnZlcnMuZ2V0KGlkKTtcblx0XHRpZiAobm9kZVNlcnZlcikge1xuXHRcdFx0bm9kZVNlcnZlci53cml0ZShtZXNzYWdlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3VwZXIuJHNlbmRNZXNzYWdlKGlkLCBtZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN0YXJ0Tm9kZU1wYyhpZDogbnVtYmVyLCBsYXVuY2g6IE1jcFNlcnZlclRyYW5zcG9ydFN0ZGlvLCBkZWZhdWx0Q3dkPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb25FcnJvciA9IChlcnI6IEVycm9yIHwgc3RyaW5nKSA9PiB0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZShpZCwge1xuXHRcdFx0c3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yLFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRjb2RlOiBlcnIuaGFzT3duUHJvcGVydHkoJ2NvZGUnKSA/IFN0cmluZygoZXJyIGFzIGFueSkuY29kZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRtZXNzYWdlOiB0eXBlb2YgZXJyID09PSAnc3RyaW5nJyA/IGVyciA6IGVyci5tZXNzYWdlLFxuXHRcdH0pO1xuXG5cdFx0Ly8gTUNQIHNlcnZlcnMgYXJlIHJ1biBvbiB0aGUgc2FtZSBhdXRob3JpdHkgd2hlcmUgdGhleSBhcmUgZGVmaW5lZCwgc29cblx0XHQvLyByZWFkaW5nIHRoZSBlbnZmaWxlIGJhc2VkIG9uIGl0cyBwYXRoIG9mZiB0aGUgZmlsZXN5c3RlbSBoZXJlIGlzIGZpbmUuXG5cdFx0Y29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiB9O1xuXHRcdGlmIChsYXVuY2guZW52RmlsZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgcGFyc2VFbnZGaWxlKGF3YWl0IHJlYWRGaWxlKGxhdW5jaC5lbnZGaWxlLCAndXRmLTgnKSkpIHtcblx0XHRcdFx0XHRlbnZba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdG9uRXJyb3IoYEZhaWxlZCB0byByZWFkIGVudkZpbGUgJyR7bGF1bmNoLmVudkZpbGV9JzogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobGF1bmNoLmVudikpIHtcblx0XHRcdC8vIEZvciBQQVRILCB3ZSB3YW50IHRvIGFwcGVuZCB0byB0aGUgZXhpc3RpbmcgUEFUSCBpbnN0ZWFkIG9mIG92ZXJ3cml0aW5nIGl0LlxuXHRcdFx0aWYgKGtleS50b1VwcGVyQ2FzZSgpID09PSAnUEFUSCcgJiYgdmFsdWUgIT09IG51bGwpIHtcblx0XHRcdFx0ZW52W2tleV0gPSBlbnZba2V5XSA/IGAke2VudltrZXldfSR7cGF0aC5kZWxpbWl0ZXJ9JHtTdHJpbmcodmFsdWUpfWAgOiBTdHJpbmcodmFsdWUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGVudltrZXldID0gdmFsdWUgPT09IG51bGwgPyB1bmRlZmluZWQgOiBTdHJpbmcodmFsdWUpO1xuXHRcdH1cblxuXHRcdGxldCBjaGlsZDogQ2hpbGRQcm9jZXNzV2l0aG91dE51bGxTdHJlYW1zO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBob21lID0gaG9tZWRpcigpO1xuXHRcdFx0bGV0IGN3ZCA9IGxhdW5jaC5jd2QgPyB1bnRpbGRpZnkobGF1bmNoLmN3ZCwgaG9tZSkgOiAoZGVmYXVsdEN3ZD8uZnNQYXRoIHx8IGhvbWUpO1xuXHRcdFx0aWYgKCFwYXRoLmlzQWJzb2x1dGUoY3dkKSkge1xuXHRcdFx0XHRjd2QgPSBkZWZhdWx0Q3dkID8gcGF0aC5qb2luKGRlZmF1bHRDd2QuZnNQYXRoLCBjd2QpIDogcGF0aC5qb2luKGhvbWUsIGN3ZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgZXhlY3V0YWJsZSwgYXJncywgc2hlbGwgfSA9IGF3YWl0IGZvcm1hdFN1YnByb2Nlc3NBcmd1bWVudHMoXG5cdFx0XHRcdHVudGlsZGlmeShsYXVuY2guY29tbWFuZCwgaG9tZSksXG5cdFx0XHRcdGxhdW5jaC5hcmdzLm1hcChhID0+IHVudGlsZGlmeShhLCBob21lKSksXG5cdFx0XHRcdGN3ZCxcblx0XHRcdFx0ZW52XG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRQdWJsaXNoTG9nKGlkLCBMb2dMZXZlbC5EZWJ1ZywgYFNlcnZlciBjb21tYW5kIGxpbmU6ICR7ZXhlY3V0YWJsZX0gJHthcmdzLmpvaW4oJyAnKX1gKTtcblx0XHRcdGNoaWxkID0gc3Bhd24oZXhlY3V0YWJsZSwgYXJncywge1xuXHRcdFx0XHRzdGRpbzogJ3BpcGUnLFxuXHRcdFx0XHRjd2QsXG5cdFx0XHRcdGVudixcblx0XHRcdFx0c2hlbGwsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvbkVycm9yKGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSB0aGUgY29ubmVjdGlvbiBtYW5hZ2VyIGZvciBncmFjZWZ1bCBzaHV0ZG93blxuXHRcdGNvbnN0IGNvbm5lY3Rpb25NYW5hZ2VyID0gbmV3IE1jcFN0ZGlvU3RhdGVIYW5kbGVyKGNoaWxkKTtcblxuXHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKGlkLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdGFydGluZyB9KTtcblxuXHRcdGNoaWxkLnN0ZG91dC5waXBlKG5ldyBTdHJlYW1TcGxpdHRlcignXFxuJykpLm9uKCdkYXRhJywgbGluZSA9PiB0aGlzLl9wcm94eS4kb25EaWRSZWNlaXZlTWVzc2FnZShpZCwgbGluZS50b1N0cmluZygpKSk7XG5cblx0XHRjaGlsZC5zdGRpbi5vbignZXJyb3InLCBvbkVycm9yKTtcblx0XHRjaGlsZC5zdGRvdXQub24oJ2Vycm9yJywgb25FcnJvcik7XG5cblx0XHQvLyBTdGRlcnIgaGFuZGxpbmcgaXMgbm90IGN1cnJlbnRseSBzcGVjaWZpZWQgaHR0cHM6Ly9naXRodWIuY29tL21vZGVsY29udGV4dHByb3RvY29sL3NwZWNpZmljYXRpb24vaXNzdWVzLzE3N1xuXHRcdC8vIEp1c3QgdHJlYXQgaXQgYXMgZ2VuZXJpYyBsb2cgZGF0YSBmb3Igbm93XG5cdFx0Y2hpbGQuc3RkZXJyLnBpcGUobmV3IFN0cmVhbVNwbGl0dGVyKCdcXG4nKSkub24oJ2RhdGEnLCBsaW5lID0+IHRoaXMuX3Byb3h5LiRvbkRpZFB1Ymxpc2hMb2coaWQsIExvZ0xldmVsLldhcm5pbmcsIGBbc2VydmVyIHN0ZGVycl0gJHtsaW5lLnRvU3RyaW5nKCkudHJpbUVuZCgpfWApKTtcblxuXHRcdGNoaWxkLm9uKCdzcGF3bicsICgpID0+IHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKGlkLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pKTtcblxuXHRcdGNoaWxkLm9uKCdlcnJvcicsIGUgPT4ge1xuXHRcdFx0b25FcnJvcihlKTtcblx0XHR9KTtcblx0XHRjaGlsZC5vbignZXhpdCcsIGNvZGUgPT4ge1xuXHRcdFx0dGhpcy5ub2RlU2VydmVycy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblxuXHRcdFx0aWYgKGNvZGUgPT09IDAgfHwgY29ubmVjdGlvbk1hbmFnZXIuc3RvcHBlZCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZShpZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKGlkLCB7XG5cdFx0XHRcdFx0c3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGBQcm9jZXNzIGV4aXRlZCB3aXRoIGNvZGUgJHtjb2RlfWAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5ub2RlU2VydmVycy5zZXQoaWQsIGNvbm5lY3Rpb25NYW5hZ2VyKTtcblx0fVxufVxuXG5jbGFzcyBNY3BIVFRQSGFuZGxlTm9kZSBleHRlbmRzIE1jcEhUVFBIYW5kbGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bmRpY2kgPSBuZXcgTGF6eSgoKSA9PiBpbXBvcnQoJ3VuZGljaScpKTtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX2ZldGNoSW50ZXJuYWwodXJsOiBzdHJpbmcsIGluaXQ/OiBDb21tb25SZXF1ZXN0SW5pdCk6IFByb21pc2U8Q29tbW9uUmVzcG9uc2U+IHtcblx0XHQvLyBOb3RlOiBpbXBvcnRlZCBhc3luYyBzbyB0aGF0IHdlIGNhbiBlbnN1cmUgd2UgbG9hZCB1bmRpY2kgYWZ0ZXIgcHJveHkgcGF0Y2hlcyBoYXZlIGJlZW4gYXBwbGllZFxuXHRcdGNvbnN0IHsgZmV0Y2gsIEFnZW50IH0gPSBhd2FpdCB0aGlzLl91bmRpY2kudmFsdWU7XG5cblx0XHRjb25zdCB1bmRpY2lJbml0OiBVbmRpY2lSZXF1ZXN0SW5pdCA9IHsgLi4uaW5pdCB9O1xuXG5cdFx0bGV0IGh0dHBVcmwgPSB1cmw7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHVybCk7XG5cblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gJ3VuaXgnIHx8IHVyaS5zY2hlbWUgPT09ICdwaXBlJykge1xuXHRcdFx0Ly8gQnkgY29udmVudGlvbiwgd2UgcHV0IHRoZSAqc29ja2V0IHBhdGgqIGFzIHRoZSBVUkkgcGF0aCwgYW5kIHRoZSAqcmVxdWVzdCBwYXRoKiBpbiB0aGUgZnJhZ21lbnRcblx0XHRcdC8vIFNvLCBzZXQgdGhlIGRpc3BhdGNoZXIgd2l0aCB0aGUgc29ja2V0IHBhdGhcblx0XHRcdHVuZGljaUluaXQuZGlzcGF0Y2hlciA9IG5ldyBBZ2VudCh7XG5cdFx0XHRcdHNvY2tldFBhdGg6IHVyaS5wYXRoLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFuZCB0aGVuIHJld3JpdGUgdGhlIFVSTCB0byBiZSBodHRwOi8vbG9jYWxob3N0LzxmcmFnbWVudD5cblx0XHRcdGh0dHBVcmwgPSB1cmkud2l0aCh7XG5cdFx0XHRcdHNjaGVtZTogJ2h0dHAnLFxuXHRcdFx0XHRhdXRob3JpdHk6ICdsb2NhbGhvc3QnLCAvLyBIVFRQIGFsd2F5cyB3YW50cyBhIGhvc3QgKG5vdCB0aGF0IHdlJ3JlIHVzaW5nIGl0KSwgYnV0IGlmIHdlJ3JlIHVzaW5nIGEgc29ja2V0IG9yIHBpcGUgdGhlbiBsb2NhbGhvc3QgaXMgc29ydGEgcmlnaHQgYW55d2F5XG5cdFx0XHRcdHBhdGg6IHVyaS5mcmFnbWVudCxcblx0XHRcdH0pLnRvU3RyaW5nKHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuX2ZldGNoSW50ZXJuYWwodXJsLCBpbml0KTtcblx0XHR9XG5cblx0XHRjb25zdCB1bmRpY2lSZXNwb25zZSA9IGF3YWl0IGZldGNoKGh0dHBVcmwsIHVuZGljaUluaXQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXR1czogdW5kaWNpUmVzcG9uc2Uuc3RhdHVzLFxuXHRcdFx0c3RhdHVzVGV4dDogdW5kaWNpUmVzcG9uc2Uuc3RhdHVzVGV4dCxcblx0XHRcdGhlYWRlcnM6IHVuZGljaVJlc3BvbnNlLmhlYWRlcnMgYXMgdW5rbm93biBhcyBIZWFkZXJzLCAvLyB1bmRpY2kgYEhlYWRlcnNgIGNsYXNzIG5vIGxvbmdlciBvdmVybGFwcyB3aXRoIGxpYi5kb20gYEhlYWRlcnNgIChgU3BlY0l0ZXJhYmxlSXRlcmF0b3JgIHZzIGBIZWFkZXJzSXRlcmF0b3JgKVxuXHRcdFx0Ym9keTogdW5kaWNpUmVzcG9uc2UuYm9keSBhcyBSZWFkYWJsZVN0cmVhbSwgLy8gV2F5IGRvd24gaW4gYFJlYWRhYmxlU3RyZWFtUmVhZERvbmVSZXN1bHQ8VD5gLCBgdmFsdWVgIGlzIG9wdGlvbmFsIGluIHRoZSB1bmRpY2kgdHlwZSBidXQgcmVxdWlyZWQgKHlldCBjYW4gYmUgYHVuZGVmaW5lZGApIGluIHRoZSBzdGFuZGFyZCB0eXBlXG5cdFx0XHR1cmw6IHVuZGljaVJlc3BvbnNlLnVybCxcblx0XHRcdGpzb246ICgpID0+IHVuZGljaVJlc3BvbnNlLmpzb24oKSxcblx0XHRcdHRleHQ6ICgpID0+IHVuZGljaVJlc3BvbnNlLnRleHQoKSxcblx0XHR9O1xuXHR9XG59XG5cbmNvbnN0IHdpbmRvd3NTaGVsbFNjcmlwdFJlID0gL1xcLihiYXR8Y21kKSQvaTtcblxuZXhwb3J0IGNvbnN0IGVzY2FwZUNtZEFyZyA9IChzOiBzdHJpbmcpOiBzdHJpbmcgPT4gYFwiJHtzLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgO1xuXG4vKipcbiAqIEZvcm1hdHMgYXJndW1lbnRzIHRvIGF2b2lkIGlzc3VlcyBvbiBXaW5kb3dzIGZvciBDVkUtMjAyNC0yNzk4MC5cbiAqL1xuZXhwb3J0IGNvbnN0IGZvcm1hdFN1YnByb2Nlc3NBcmd1bWVudHMgPSBhc3luYyAoXG5cdGV4ZWN1dGFibGU6IHN0cmluZyxcblx0YXJnczogUmVhZG9ubHlBcnJheTxzdHJpbmc+LFxuXHRjd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0ZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+LFxuKSA9PiB7XG5cdGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnd2luMzInKSB7XG5cdFx0cmV0dXJuIHsgZXhlY3V0YWJsZSwgYXJncywgc2hlbGw6IGZhbHNlIH07XG5cdH1cblxuXHRjb25zdCBmb3VuZCA9IGF3YWl0IGZpbmRFeGVjdXRhYmxlKGV4ZWN1dGFibGUsIGN3ZCwgdW5kZWZpbmVkLCBlbnYpO1xuXHRpZiAoZm91bmQgJiYgd2luZG93c1NoZWxsU2NyaXB0UmUudGVzdChmb3VuZCkpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXhlY3V0YWJsZTogZXNjYXBlQ21kQXJnKGZvdW5kKSxcblx0XHRcdGFyZ3M6IGFyZ3MubWFwKGVzY2FwZUNtZEFyZyksXG5cdFx0XHRzaGVsbDogdHJ1ZSxcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHsgZXhlY3V0YWJsZSwgYXJncywgc2hlbGw6IGZhbHNlIH07XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBeUMsYUFBYTtBQUN0RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMscUJBQXFCO0FBQzlCLFlBQVksVUFBVTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBOEQsOEJBQThCO0FBQ3JHLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQTRDLG1CQUFtQixxQkFBcUI7QUFFN0UsTUFBTSw4QkFBOEIsa0JBQWtCO0FBQUEsRUFBdEQ7QUFBQTtBQUNOLFNBQVEsY0FBYyxLQUFLLFVBQVUsSUFBSSxjQUE0QyxDQUFDO0FBQUE7QUFBQSxFQUVuRSxVQUFVLElBQVksUUFBeUIsWUFBa0Isd0JBQXdDO0FBQzNILFFBQUksT0FBTyxTQUFTLHVCQUF1QixPQUFPO0FBQ2pELFdBQUssYUFBYSxJQUFJLFFBQVEsVUFBVTtBQUFBLElBQ3pDLFdBQVcsT0FBTyxTQUFTLHVCQUF1QixNQUFNO0FBQ3ZELFdBQUssaUJBQWlCLElBQUksSUFBSSxJQUFJLGtCQUFrQixJQUFJLFFBQVEsS0FBSyxRQUFRLEtBQUssYUFBYSxzQkFBc0IsQ0FBQztBQUFBLElBQ3ZILE9BQU87QUFDTixZQUFNLFVBQVUsSUFBSSxRQUFRLFlBQVksc0JBQXNCO0FBQUEsSUFDL0Q7QUFBQSxFQUNEO0FBQUEsRUFFUyxTQUFTLElBQWtCO0FBQ25DLFVBQU0sYUFBYSxLQUFLLFlBQVksSUFBSSxFQUFFO0FBQzFDLFFBQUksWUFBWTtBQUNmLGlCQUFXLEtBQUs7QUFBQSxJQUNqQixPQUFPO0FBQ04sWUFBTSxTQUFTLEVBQUU7QUFBQSxJ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
