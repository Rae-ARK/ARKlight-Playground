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
import * as cp from "child_process";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../base/common/strings.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { localize } from "../../../nls.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { redactToken, resolveRemotePlatform } from "./sshRemoteAgentHostHelpers.js";
import {
  composeAgentHostBootstrapScript,
  decodeWslOutput,
  extractAgentHostWebSocketURL,
  getWslExePath,
  isWSLSupported,
  parseRunningDistros,
  parseWslListVerbose,
  runWslCommand,
  validateDistroName
} from "./wslRemoteAgentHostHelpers.js";
const LOG_PREFIX = "[WSLRemoteAgentHost]";
const AGENT_HOST_READY_TIMEOUT_MS = 6e4;
const WEBSOCKET_OPEN_TIMEOUT_MS = 3e4;
const OUTPUT_BUFFER_LINES = 50;
let WSLRemoteAgentHostMainService = class extends Disposable {
  constructor(_logService, _productService) {
    super();
    this._logService = _logService;
    this._productService = _productService;
    this._onDidChangeConnections = this._register(new Emitter());
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._onDidCloseConnection = this._register(new Emitter());
    this.onDidCloseConnection = this._onDidCloseConnection.event;
    this._onDidReportConnectProgress = this._register(new Emitter());
    this.onDidReportConnectProgress = this._onDidReportConnectProgress.event;
    this._onDidRelayMessage = this._register(new Emitter());
    this.onDidRelayMessage = this._onDidRelayMessage.event;
    this._onDidRelayClose = this._register(new Emitter());
    this.onDidRelayClose = this._onDidRelayClose.event;
    this._connections = /* @__PURE__ */ new Map();
    this._distroToConnectionId = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => {
      for (const id of [...this._connections.keys()]) {
        this._closeConnection(id);
      }
    }));
  }
  get _quality() {
    return this._productService.quality || "insider";
  }
  get _serverDataFolderName() {
    const value = this._productService.serverDataFolderName;
    if (!value) {
      throw new Error(`${LOG_PREFIX} productService.serverDataFolderName is required`);
    }
    return value;
  }
  get _commit() {
    return this._productService.commit;
  }
  /** Lazily load `require` so the `ws` native module is only resolved at runtime. */
  async _getNativeRequire() {
    if (!this._nativeRequire) {
      const nodeModule = await import("node:module");
      this._nativeRequire = nodeModule.createRequire(import.meta.url);
    }
    return this._nativeRequire;
  }
  async isWSLAvailable() {
    return isWSLSupported();
  }
  async listDistros() {
    try {
      const [verbose, running] = await Promise.all([
        runWslCommand(["--list", "--verbose"]),
        runWslCommand(["--list", "--running", "--quiet"])
      ]);
      if (verbose.exitCode !== 0) {
        this._logService.info(`${LOG_PREFIX} wsl --list --verbose exited ${verbose.exitCode}: ${verbose.stderr.trim()}`);
        return [];
      }
      const parsed = parseWslListVerbose(verbose.stdout);
      if (running.exitCode !== 0) {
        return parsed;
      }
      const runningSet = new Set(parseRunningDistros(running.stdout));
      return parsed.map((d) => ({ ...d, isRunning: runningSet.has(d.name) }));
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} listDistros failed`, err);
      return [];
    }
  }
  async listRunningDistros() {
    try {
      const result = await runWslCommand(["--list", "--running", "--quiet"]);
      if (result.exitCode !== 0) {
        return [];
      }
      return parseRunningDistros(result.stdout);
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} listRunningDistros failed`, err);
      return [];
    }
  }
  async connect(config) {
    const distro = validateDistroName(config.distro);
    const existingId = this._distroToConnectionId.get(distro);
    if (existingId) {
      const existing = this._connections.get(existingId);
      if (existing) {
        return {
          connectionId: existing.connectionId,
          address: existing.address,
          distro: existing.distro,
          name: existing.name,
          connectionToken: existing.connectionToken
        };
      }
    }
    const connectionKey = `wsl:${distro}`;
    const reportProgress = (message) => {
      this._onDidReportConnectProgress.fire({ connectionKey, message });
    };
    reportProgress(localize("wslProgressDetectingPlatform", "Detecting platform in {0}...", distro));
    const { os: targetOs, arch: targetArch } = await this._resolvePlatform(distro);
    reportProgress(localize("wslProgressPreparingCLI", "Preparing CLI in {0}...", distro));
    const script = composeAgentHostBootstrapScript({
      serverDataFolderName: this._serverDataFolderName,
      quality: this._quality,
      commit: this._commit,
      os: targetOs,
      arch: targetArch,
      remoteAgentHostCommand: config.remoteAgentHostCommand
    });
    this._logService.info(`${LOG_PREFIX} Spawning agent host in WSL distro '${distro}'`);
    this._logService.trace(`${LOG_PREFIX} bootstrap script: ${script}`);
    const child = cp.spawn(getWslExePath(), ["-d", distro, "-e", "bash", "-lc", script], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let url;
    let urlResolve;
    let urlReject;
    const urlPromise = new Promise((res, rej) => {
      urlResolve = res;
      urlReject = rej;
    });
    const outputLines = [];
    const appendLine = (line) => {
      outputLines.push(redactToken(line));
      if (outputLines.length > OUTPUT_BUFFER_LINES) {
        outputLines.shift();
      }
    };
    const onStreamData = (data) => {
      const cleanText = removeAnsiEscapeCodes(decodeWslOutput(data));
      for (const rawLine of cleanText.split(/\r\n|\r|\n/)) {
        const line = rawLine.trimEnd();
        if (!line) {
          continue;
        }
        appendLine(line);
        this._logService.trace(`${LOG_PREFIX} [${distro}] ${redactToken(line)}`);
        if (!url) {
          const match = extractAgentHostWebSocketURL(line);
          if (match) {
            url = match.url;
            urlResolve?.({ url: match.url, token: match.token });
          }
        }
      }
    };
    child.stdout?.on("data", onStreamData);
    child.stderr?.on("data", onStreamData);
    const childExited = new Promise((res) => {
      child.once("exit", (code, signal) => res({ code, signal }));
    });
    const readyTimeoutHandle = setTimeout(() => {
      urlReject?.(new Error(`${LOG_PREFIX} Timed out waiting for agent host in '${distro}' to print its WebSocket URL after ${AGENT_HOST_READY_TIMEOUT_MS}ms.
Output: ${outputLines.join("\n")}`));
    }, AGENT_HOST_READY_TIMEOUT_MS);
    const earlyExitGuard = childExited.then(({ code, signal }) => {
      if (!url) {
        urlReject?.(new Error(`${LOG_PREFIX} Agent host in '${distro}' exited (code=${code}, signal=${signal}) before printing its WebSocket URL.
Output: ${outputLines.join("\n")}`));
      }
    });
    let resolvedUrl;
    try {
      resolvedUrl = await urlPromise;
    } catch (err) {
      clearTimeout(readyTimeoutHandle);
      this._killChild(child);
      await earlyExitGuard.catch(() => {
      });
      throw err;
    }
    clearTimeout(readyTimeoutHandle);
    reportProgress(localize("wslProgressConnecting", "Connecting to agent host in {0}...", distro));
    let ws;
    try {
      ws = await this._openWebSocket(resolvedUrl.url);
    } catch (err) {
      this._killChild(child);
      throw err;
    }
    const connectionId = generateUuid();
    const connection = {
      connectionId,
      distro,
      name: config.name,
      address: connectionKey,
      connectionToken: resolvedUrl.token,
      child,
      ws
    };
    ws.on("message", (data) => {
      let text;
      if (typeof data === "string") {
        text = data;
      } else if (Array.isArray(data)) {
        text = Buffer.concat(data).toString("utf8");
      } else if (data instanceof ArrayBuffer) {
        text = Buffer.from(new Uint8Array(data)).toString("utf8");
      } else {
        text = data.toString("utf8");
      }
      this._onDidRelayMessage.fire({ connectionId, data: text });
    });
    ws.on("close", () => {
      this._closeConnection(connectionId);
    });
    ws.on("error", (err) => {
      this._logService.warn(`${LOG_PREFIX} WebSocket error for ${connectionKey}: ${err instanceof Error ? err.message : String(err)}`);
    });
    this._connections.set(connectionId, connection);
    this._distroToConnectionId.set(distro, connectionId);
    this._onDidChangeConnections.fire();
    return {
      connectionId,
      address: connectionKey,
      distro,
      name: config.name,
      connectionToken: resolvedUrl.token
    };
  }
  async disconnect(distro) {
    const id = this._distroToConnectionId.get(distro);
    if (id) {
      this._closeConnection(id);
    }
  }
  async reconnect(distro, name, remoteAgentHostCommand) {
    const existingId = this._distroToConnectionId.get(distro);
    if (existingId) {
      this._closeConnection(existingId);
    }
    return this.connect({ distro, name, remoteAgentHostCommand });
  }
  async relaySend(connectionId, message) {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      this._logService.debug(`${LOG_PREFIX} relaySend: no connection ${connectionId}`);
      return;
    }
    try {
      conn.ws.send(message);
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} relaySend failed for ${connectionId}`, err);
    }
  }
  _closeConnection(connectionId) {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      return;
    }
    this._connections.delete(connectionId);
    if (this._distroToConnectionId.get(conn.distro) === connectionId) {
      this._distroToConnectionId.delete(conn.distro);
    }
    try {
      conn.ws.close();
    } catch {
    }
    this._killChild(conn.child);
    this._onDidRelayClose.fire(connectionId);
    this._onDidCloseConnection.fire(connectionId);
    this._onDidChangeConnections.fire();
  }
  _killChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      child.kill();
    } catch {
    }
    const escalate = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
        }
      }
    }, 2e3);
    escalate.unref();
    child.once("exit", () => clearTimeout(escalate));
  }
  async _resolvePlatform(distro) {
    const result = await runWslCommand(["-e", "uname", "-s", "-m"], { distro, timeout: 1e4 });
    if (result.exitCode !== 0) {
      throw new Error(`${LOG_PREFIX} Failed to detect platform in '${distro}' (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
    }
    const tokens = result.stdout.trim().split(/\s+/);
    if (tokens.length < 2) {
      throw new Error(`${LOG_PREFIX} Unexpected uname output from '${distro}': ${JSON.stringify(result.stdout)}`);
    }
    const resolved = resolveRemotePlatform(tokens[0], tokens.slice(1).join(" "));
    if (!resolved) {
      throw new Error(localize("wslUnsupportedPlatform", "Unsupported WSL distro platform: {0}", result.stdout.trim()));
    }
    return resolved;
  }
  async _openWebSocket(url) {
    const nativeRequire = await this._getNativeRequire();
    const WS = nativeRequire("ws");
    const deadline = Date.now() + WEBSOCKET_OPEN_TIMEOUT_MS;
    let lastError;
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`${LOG_PREFIX} Timed out opening WebSocket to ${redactToken(url)} after ${WEBSOCKET_OPEN_TIMEOUT_MS}ms${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ""}`);
      }
      try {
        return await this._tryOpenWebSocket(new WS(url), url, remaining);
      } catch (err) {
        lastError = err;
        if (!isConnectionRefused(err)) {
          throw err;
        }
        const delay = Math.min(100 + attempt * 100, 500);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  _tryOpenWebSocket(ws, url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        try {
          ws.close();
        } catch {
        }
        reject(new Error(`${LOG_PREFIX} Timed out opening WebSocket to ${redactToken(url)} after ${timeoutMs}ms`));
      }, timeoutMs);
      ws.once("open", () => {
        clearTimeout(timeoutHandle);
        resolve(ws);
      });
      ws.once("error", (err) => {
        clearTimeout(timeoutHandle);
        try {
          ws.close();
        } catch {
        }
        reject(err);
      });
    });
  }
};
WSLRemoteAgentHostMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProductService)
], WSLRemoteAgentHostMainService);
function isConnectionRefused(err) {
  if (!err || typeof err !== "object") {
    return false;
  }
  const code = err.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EADDRNOTAVAIL") {
    return true;
  }
  const errors = err.errors;
  if (Array.isArray(errors)) {
    return errors.some(isConnectionRefused);
  }
  return false;
}
export {
  WSLRemoteAgentHostMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3dzbFJlbW90ZUFnZW50SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSBXZWJTb2NrZXQgZnJvbSAnd3MnO1xuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZW1vdmVBbnNpRXNjYXBlQ29kZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZWxheU1lc3NhZ2UgfSBmcm9tICcuLi9jb21tb24vcmVsYXlUcmFuc3BvcnQuanMnO1xuaW1wb3J0IHtcblx0SVdTTFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLFxuXHR0eXBlIElXU0xBZ2VudEhvc3RDb25maWcsXG5cdHR5cGUgSVdTTENvbm5lY3RQcm9ncmVzcyxcblx0dHlwZSBJV1NMQ29ubmVjdFJlc3VsdCxcblx0dHlwZSBJV1NMRGlzdHJvLFxufSBmcm9tICcuLi9jb21tb24vd3NsUmVtb3RlQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IHJlZGFjdFRva2VuLCByZXNvbHZlUmVtb3RlUGxhdGZvcm0gfSBmcm9tICcuL3NzaFJlbW90ZUFnZW50SG9zdEhlbHBlcnMuanMnO1xuaW1wb3J0IHtcblx0Y29tcG9zZUFnZW50SG9zdEJvb3RzdHJhcFNjcmlwdCxcblx0ZGVjb2RlV3NsT3V0cHV0LFxuXHRleHRyYWN0QWdlbnRIb3N0V2ViU29ja2V0VVJMLFxuXHRnZXRXc2xFeGVQYXRoLFxuXHRpc1dTTFN1cHBvcnRlZCxcblx0cGFyc2VSdW5uaW5nRGlzdHJvcyxcblx0cGFyc2VXc2xMaXN0VmVyYm9zZSxcblx0cnVuV3NsQ29tbWFuZCxcblx0dmFsaWRhdGVEaXN0cm9OYW1lLFxufSBmcm9tICcuL3dzbFJlbW90ZUFnZW50SG9zdEhlbHBlcnMuanMnO1xuXG5jb25zdCBMT0dfUFJFRklYID0gJ1tXU0xSZW1vdGVBZ2VudEhvc3RdJztcblxuLyoqIE1heCB0aW1lIHRvIHdhaXQgZm9yIGBjb2RlIGFnZW50IGhvc3RgIGluc2lkZSB0aGUgZGlzdHJvIHRvIHByaW50IGl0cyBgd3M6Ly9gIFVSTC4gKi9cbmNvbnN0IEFHRU5UX0hPU1RfUkVBRFlfVElNRU9VVF9NUyA9IDYwXzAwMDtcblxuLyoqIE1heCB0aW1lIHRvIHdhaXQgZm9yIHRoZSBob3N0LXNpZGUgV2ViU29ja2V0IHRvIGNvbXBsZXRlIGl0cyBoYW5kc2hha2UuICovXG5jb25zdCBXRUJTT0NLRVRfT1BFTl9USU1FT1VUX01TID0gMzBfMDAwO1xuXG4vKiogTWF4IHN0ZG91dC9zdGRlcnIgbGluZXMga2VwdCBidWZmZXJlZCBmb3IgZGlhZ25vc3RpYyBjb250ZXh0IG9uIGZhaWx1cmUuICovXG5jb25zdCBPVVRQVVRfQlVGRkVSX0xJTkVTID0gNTA7XG5cbmludGVyZmFjZSBJV1NMQ29ubmVjdGlvbiB7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBkaXN0cm86IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjaGlsZDogY3AuQ2hpbGRQcm9jZXNzO1xuXHRyZWFkb25seSB3czogV2ViU29ja2V0O1xufVxuXG5leHBvcnQgY2xhc3MgV1NMUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdTTFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25uZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25zOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZUNvbm5lY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlQ29ubmVjdGlvbjogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdTTENvbm5lY3RQcm9ncmVzcz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBFdmVudDxJV1NMQ29ubmVjdFByb2dyZXNzPiA9IHRoaXMuX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVsYXlNZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlbGF5TWVzc2FnZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVsYXlNZXNzYWdlOiBFdmVudDxJUmVsYXlNZXNzYWdlPiA9IHRoaXMuX29uRGlkUmVsYXlNZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVsYXlDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVsYXlDbG9zZTogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkUmVsYXlDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJV1NMQ29ubmVjdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzdHJvVG9Db25uZWN0aW9uSWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdHByaXZhdGUgX25hdGl2ZVJlcXVpcmU6IE5vZGVKUy5SZXF1aXJlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgWy4uLnRoaXMuX2Nvbm5lY3Rpb25zLmtleXMoKV0pIHtcblx0XHRcdFx0dGhpcy5fY2xvc2VDb25uZWN0aW9uKGlkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfcXVhbGl0eSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9wcm9kdWN0U2VydmljZS5xdWFsaXR5IHx8ICdpbnNpZGVyJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9zZXJ2ZXJEYXRhRm9sZGVyTmFtZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fcHJvZHVjdFNlcnZpY2Uuc2VydmVyRGF0YUZvbGRlck5hbWU7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke0xPR19QUkVGSVh9IHByb2R1Y3RTZXJ2aWNlLnNlcnZlckRhdGFGb2xkZXJOYW1lIGlzIHJlcXVpcmVkYCk7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9jb21taXQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZHVjdFNlcnZpY2UuY29tbWl0O1xuXHR9XG5cblx0LyoqIExhemlseSBsb2FkIGByZXF1aXJlYCBzbyB0aGUgYHdzYCBuYXRpdmUgbW9kdWxlIGlzIG9ubHkgcmVzb2x2ZWQgYXQgcnVudGltZS4gKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0TmF0aXZlUmVxdWlyZSgpOiBQcm9taXNlPE5vZGVKUy5SZXF1aXJlPiB7XG5cdFx0aWYgKCF0aGlzLl9uYXRpdmVSZXF1aXJlKSB7XG5cdFx0XHRjb25zdCBub2RlTW9kdWxlID0gYXdhaXQgaW1wb3J0KCdub2RlOm1vZHVsZScpO1xuXHRcdFx0dGhpcy5fbmF0aXZlUmVxdWlyZSA9IG5vZGVNb2R1bGUuY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmF0aXZlUmVxdWlyZTtcblx0fVxuXG5cdGFzeW5jIGlzV1NMQXZhaWxhYmxlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBpc1dTTFN1cHBvcnRlZCgpO1xuXHR9XG5cblx0YXN5bmMgbGlzdERpc3Ryb3MoKTogUHJvbWlzZTxJV1NMRGlzdHJvW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gUnVuIGJvdGggcHJvYmVzIGluIHBhcmFsbGVsIHNvIHdlIGNhbiBvdmVybGF5IHRoZSBsb2NhbGUtZnJlZVxuXHRcdFx0Ly8gcnVubmluZyBzZXQgb24gdGhlIHZlcmJvc2UgcGFyc2UgKHRoZSBgU1RBVEVgIGNvbHVtbiBmcm9tXG5cdFx0XHQvLyBgLS12ZXJib3NlYCBpcyBsb2NhbGl6ZWQgYnkgV2luZG93cyBhbmQgcmVhZHMgXCJTdG9wcGVkXCIgZm9yXG5cdFx0XHQvLyBldmVyeSBkaXN0cm8gb24gbm9uLUVuZ2xpc2ggaG9zdHMpLlxuXHRcdFx0Y29uc3QgW3ZlcmJvc2UsIHJ1bm5pbmddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRydW5Xc2xDb21tYW5kKFsnLS1saXN0JywgJy0tdmVyYm9zZSddKSxcblx0XHRcdFx0cnVuV3NsQ29tbWFuZChbJy0tbGlzdCcsICctLXJ1bm5pbmcnLCAnLS1xdWlldCddKSxcblx0XHRcdF0pO1xuXHRcdFx0aWYgKHZlcmJvc2UuZXhpdENvZGUgIT09IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IHdzbCAtLWxpc3QgLS12ZXJib3NlIGV4aXRlZCAke3ZlcmJvc2UuZXhpdENvZGV9OiAke3ZlcmJvc2Uuc3RkZXJyLnRyaW0oKX1gKTtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VXc2xMaXN0VmVyYm9zZSh2ZXJib3NlLnN0ZG91dCk7XG5cdFx0XHRpZiAocnVubmluZy5leGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcnVubmluZ1NldCA9IG5ldyBTZXQocGFyc2VSdW5uaW5nRGlzdHJvcyhydW5uaW5nLnN0ZG91dCkpO1xuXHRcdFx0cmV0dXJuIHBhcnNlZC5tYXAoZCA9PiAoeyAuLi5kLCBpc1J1bm5pbmc6IHJ1bm5pbmdTZXQuaGFzKGQubmFtZSkgfSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IGxpc3REaXN0cm9zIGZhaWxlZGAsIGVycik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbGlzdFJ1bm5pbmdEaXN0cm9zKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuV3NsQ29tbWFuZChbJy0tbGlzdCcsICctLXJ1bm5pbmcnLCAnLS1xdWlldCddKTtcblx0XHRcdGlmIChyZXN1bHQuZXhpdENvZGUgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnNlUnVubmluZ0Rpc3Ryb3MocmVzdWx0LnN0ZG91dCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gbGlzdFJ1bm5pbmdEaXN0cm9zIGZhaWxlZGAsIGVycik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY29ubmVjdChjb25maWc6IElXU0xBZ2VudEhvc3RDb25maWcpOiBQcm9taXNlPElXU0xDb25uZWN0UmVzdWx0PiB7XG5cdFx0Y29uc3QgZGlzdHJvID0gdmFsaWRhdGVEaXN0cm9OYW1lKGNvbmZpZy5kaXN0cm8pO1xuXG5cdFx0Ly8gSWRlbXBvdGVudDogYSBzZWNvbmQgYGNvbm5lY3RgIGZvciBhbiBhbHJlYWR5LWxpdmUgZGlzdHJvIHJldHVybnNcblx0XHQvLyB0aGUgZXhpc3RpbmcgY29ubmVjdGlvbiBzbyB0aGUgcmVuZGVyZXItc2lkZSBgX3NldHVwQ29ubmVjdGlvbmBcblx0XHQvLyByZXVzZXMgaXRzIGhhbmRsZSAoaXQgZGVkdXBlcyBieSBgY29ubmVjdGlvbklkYCkuIFBpY2tpbmdcblx0XHQvLyBcIldTTC4uLlwiIFx1MjE5MiBzYW1lIGRpc3RybyBzaG91bGQgYmUgYSBuby1vcCwgbm90IGFuIGVycm9yLlxuXHRcdGNvbnN0IGV4aXN0aW5nSWQgPSB0aGlzLl9kaXN0cm9Ub0Nvbm5lY3Rpb25JZC5nZXQoZGlzdHJvKTtcblx0XHRpZiAoZXhpc3RpbmdJZCkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoZXhpc3RpbmdJZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb25uZWN0aW9uSWQ6IGV4aXN0aW5nLmNvbm5lY3Rpb25JZCxcblx0XHRcdFx0XHRhZGRyZXNzOiBleGlzdGluZy5hZGRyZXNzLFxuXHRcdFx0XHRcdGRpc3RybzogZXhpc3RpbmcuZGlzdHJvLFxuXHRcdFx0XHRcdG5hbWU6IGV4aXN0aW5nLm5hbWUsXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiBleGlzdGluZy5jb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbktleSA9IGB3c2w6JHtkaXN0cm99YDtcblx0XHRjb25zdCByZXBvcnRQcm9ncmVzcyA9IChtZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzLmZpcmUoeyBjb25uZWN0aW9uS2V5LCBtZXNzYWdlIH0pO1xuXHRcdH07XG5cblx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnd3NsUHJvZ3Jlc3NEZXRlY3RpbmdQbGF0Zm9ybScsIFwiRGV0ZWN0aW5nIHBsYXRmb3JtIGluIHswfS4uLlwiLCBkaXN0cm8pKTtcblx0XHRjb25zdCB7IG9zOiB0YXJnZXRPcywgYXJjaDogdGFyZ2V0QXJjaCB9ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVBsYXRmb3JtKGRpc3Rybyk7XG5cblx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnd3NsUHJvZ3Jlc3NQcmVwYXJpbmdDTEknLCBcIlByZXBhcmluZyBDTEkgaW4gezB9Li4uXCIsIGRpc3RybykpO1xuXHRcdGNvbnN0IHNjcmlwdCA9IGNvbXBvc2VBZ2VudEhvc3RCb290c3RyYXBTY3JpcHQoe1xuXHRcdFx0c2VydmVyRGF0YUZvbGRlck5hbWU6IHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLFxuXHRcdFx0cXVhbGl0eTogdGhpcy5fcXVhbGl0eSxcblx0XHRcdGNvbW1pdDogdGhpcy5fY29tbWl0LFxuXHRcdFx0b3M6IHRhcmdldE9zLFxuXHRcdFx0YXJjaDogdGFyZ2V0QXJjaCxcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6IGNvbmZpZy5yZW1vdGVBZ2VudEhvc3RDb21tYW5kLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNwYXduaW5nIGFnZW50IGhvc3QgaW4gV1NMIGRpc3RybyAnJHtkaXN0cm99J2ApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gYm9vdHN0cmFwIHNjcmlwdDogJHtzY3JpcHR9YCk7XG5cblx0XHQvLyBgLWUgYmFzaCAtbGMgPHNjcmlwdD5gIHJ1bnMgYSBsb2dpbiBzaGVsbCBzbyB0aGUgdXNlcidzIFBBVEgvcHJvZmlsZVxuXHRcdC8vIGlzIHNvdXJjZWQgYmVmb3JlIHRoZSBDTEkgbGF1bmNoZXMuIFdlIGRlbGliZXJhdGVseSBkbyBOT1Qgc2V0XG5cdFx0Ly8gYFdTTF9VVEY4YCBmb3IgdGhpcyBzcGF3bjogaXQgd291bGQgZm9yY2UgYHdzbC5leGVgIHRvIHJlY29kZSB0aGVcblx0XHQvLyBhZ2VudCBob3N0J3Mgc3Rkb3V0L3N0ZGVyciwgd2hpY2ggaXMgYWxyZWFkeSB2YWxpZCBVVEYtOCBmcm9tIGFcblx0XHQvLyBMaW51eCBwcm9jZXNzLiBLZWVwaW5nIHRoZSBieXRlcyB1bnRvdWNoZWQgYWxzbyBhdm9pZHMgc3VycHJpc2luZ1xuXHRcdC8vIHRoZSBVUkwvUElEIHJlZ2V4LlxuXHRcdGNvbnN0IGNoaWxkID0gY3Auc3Bhd24oZ2V0V3NsRXhlUGF0aCgpLCBbJy1kJywgZGlzdHJvLCAnLWUnLCAnYmFzaCcsICctbGMnLCBzY3JpcHRdLCB7XG5cdFx0XHR3aW5kb3dzSGlkZTogdHJ1ZSxcblx0XHRcdHN0ZGlvOiBbJ2lnbm9yZScsICdwaXBlJywgJ3BpcGUnXSxcblx0XHR9KTtcblxuXHRcdGxldCB1cmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdXJsUmVzb2x2ZTogKCh2YWx1ZTogeyB1cmw6IHN0cmluZzsgdG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCB9KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdXJsUmVqZWN0OiAoKGVycjogRXJyb3IpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHVybFByb21pc2UgPSBuZXcgUHJvbWlzZTx7IHVybDogc3RyaW5nOyB0b2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkIH0+KChyZXMsIHJlaikgPT4ge1xuXHRcdFx0dXJsUmVzb2x2ZSA9IHJlcztcblx0XHRcdHVybFJlamVjdCA9IHJlajtcblx0XHR9KTtcblxuXHRcdC8vIEJ1ZmZlciBob2xkcyBhbHJlYWR5LXJlZGFjdGVkIGxpbmVzOiBjb25uZWN0aW9uIHRva2VucyBuZXZlciBzaXRcblx0XHQvLyBpbiBzaGFyZWQtcHJvY2VzcyBtZW1vcnkgdW5yZWRhY3RlZCwgZXZlbiBvbiB0aGUgZGlhZ25vc3RpYyBwYXRoLlxuXHRcdGNvbnN0IG91dHB1dExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGFwcGVuZExpbmUgPSAobGluZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRvdXRwdXRMaW5lcy5wdXNoKHJlZGFjdFRva2VuKGxpbmUpKTtcblx0XHRcdGlmIChvdXRwdXRMaW5lcy5sZW5ndGggPiBPVVRQVVRfQlVGRkVSX0xJTkVTKSB7XG5cdFx0XHRcdG91dHB1dExpbmVzLnNoaWZ0KCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9uU3RyZWFtRGF0YSA9IChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdC8vIGBkZWNvZGVXc2xPdXRwdXRgIGhhbmRsZXMgYm90aCBVVEYtOCAodGhlIGFnZW50IGhvc3QncyBvd25cblx0XHRcdC8vIHN0ZG91dCB3aGVuIHJ1bm5pbmcgd2l0aCBgV1NMX1VURjhgIHVuc2V0LCB3aGljaCBpcyB3aGF0IHdlXG5cdFx0XHQvLyBzcGF3biB3aXRoKSBhbmQgVVRGLTE2TEUgKHdoaWNoIGlzIGhvdyBgd3NsLmV4ZWAncyBvd24gZXJyb3Jcblx0XHRcdC8vIG1lc3NhZ2VzIFx1MjAxNCBcIlRoZXJlIGlzIG5vIGRpc3RyaWJ1dGlvbiB3aXRoIHRoZSBzdXBwbGllZCBuYW1lXCJcblx0XHRcdC8vIGV0Yy4gXHUyMDE0IGFycml2ZSBvbiBzdGRlcnIgd2l0aG91dCBgV1NMX1VURjg9MWApLlxuXHRcdFx0Y29uc3QgY2xlYW5UZXh0ID0gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKGRlY29kZVdzbE91dHB1dChkYXRhKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHJhd0xpbmUgb2YgY2xlYW5UZXh0LnNwbGl0KC9cXHJcXG58XFxyfFxcbi8pKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSByYXdMaW5lLnRyaW1FbmQoKTtcblx0XHRcdFx0aWYgKCFsaW5lKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXBwZW5kTGluZShsaW5lKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBbJHtkaXN0cm99XSAke3JlZGFjdFRva2VuKGxpbmUpfWApO1xuXHRcdFx0XHRpZiAoIXVybCkge1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gZXh0cmFjdEFnZW50SG9zdFdlYlNvY2tldFVSTChsaW5lKTtcblx0XHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRcdHVybCA9IG1hdGNoLnVybDtcblx0XHRcdFx0XHRcdHVybFJlc29sdmU/Lih7IHVybDogbWF0Y2gudXJsLCB0b2tlbjogbWF0Y2gudG9rZW4gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNoaWxkLnN0ZG91dD8ub24oJ2RhdGEnLCBvblN0cmVhbURhdGEpO1xuXHRcdGNoaWxkLnN0ZGVycj8ub24oJ2RhdGEnLCBvblN0cmVhbURhdGEpO1xuXG5cdFx0Y29uc3QgY2hpbGRFeGl0ZWQgPSBuZXcgUHJvbWlzZTx7IGNvZGU6IG51bWJlciB8IG51bGw7IHNpZ25hbDogTm9kZUpTLlNpZ25hbHMgfCBudWxsIH0+KChyZXMpID0+IHtcblx0XHRcdGNoaWxkLm9uY2UoJ2V4aXQnLCAoY29kZSwgc2lnbmFsKSA9PiByZXMoeyBjb2RlLCBzaWduYWwgfSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmFjZSB0aGUgVVJMIHBhcnNlIGFnYWluc3QgdGhlIGNoaWxkIGR5aW5nIGFuZCB0aGUgZ2xvYmFsIHRpbWVvdXQuXG5cdFx0Ly8gYG91dHB1dExpbmVzYCBpcyBhbHJlYWR5IHJlZGFjdGVkIGluIGBhcHBlbmRMaW5lYCBcdTIwMTQgbm8gZXh0cmEgd3JhcCBuZWVkZWQuXG5cdFx0Y29uc3QgcmVhZHlUaW1lb3V0SGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR1cmxSZWplY3Q/LihuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gVGltZWQgb3V0IHdhaXRpbmcgZm9yIGFnZW50IGhvc3QgaW4gJyR7ZGlzdHJvfScgdG8gcHJpbnQgaXRzIFdlYlNvY2tldCBVUkwgYWZ0ZXIgJHtBR0VOVF9IT1NUX1JFQURZX1RJTUVPVVRfTVN9bXMuXFxuT3V0cHV0OiAke291dHB1dExpbmVzLmpvaW4oJ1xcbicpfWApKTtcblx0XHR9LCBBR0VOVF9IT1NUX1JFQURZX1RJTUVPVVRfTVMpO1xuXG5cdFx0Y29uc3QgZWFybHlFeGl0R3VhcmQgPSBjaGlsZEV4aXRlZC50aGVuKCh7IGNvZGUsIHNpZ25hbCB9KSA9PiB7XG5cdFx0XHRpZiAoIXVybCkge1xuXHRcdFx0XHR1cmxSZWplY3Q/LihuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gQWdlbnQgaG9zdCBpbiAnJHtkaXN0cm99JyBleGl0ZWQgKGNvZGU9JHtjb2RlfSwgc2lnbmFsPSR7c2lnbmFsfSkgYmVmb3JlIHByaW50aW5nIGl0cyBXZWJTb2NrZXQgVVJMLlxcbk91dHB1dDogJHtvdXRwdXRMaW5lcy5qb2luKCdcXG4nKX1gKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgcmVzb2x2ZWRVcmw6IHsgdXJsOiBzdHJpbmc7IHRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHR0cnkge1xuXHRcdFx0cmVzb2x2ZWRVcmwgPSBhd2FpdCB1cmxQcm9taXNlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHJlYWR5VGltZW91dEhhbmRsZSk7XG5cdFx0XHR0aGlzLl9raWxsQ2hpbGQoY2hpbGQpO1xuXHRcdFx0YXdhaXQgZWFybHlFeGl0R3VhcmQuY2F0Y2goKCkgPT4geyAvKiBhbHJlYWR5IHN1cmZhY2VkICovIH0pO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHRjbGVhclRpbWVvdXQocmVhZHlUaW1lb3V0SGFuZGxlKTtcblxuXHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCd3c2xQcm9ncmVzc0Nvbm5lY3RpbmcnLCBcIkNvbm5lY3RpbmcgdG8gYWdlbnQgaG9zdCBpbiB7MH0uLi5cIiwgZGlzdHJvKSk7XG5cdFx0bGV0IHdzOiBXZWJTb2NrZXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHdzID0gYXdhaXQgdGhpcy5fb3BlbldlYlNvY2tldChyZXNvbHZlZFVybC51cmwpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fa2lsbENoaWxkKGNoaWxkKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25uZWN0aW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjb25uZWN0aW9uOiBJV1NMQ29ubmVjdGlvbiA9IHtcblx0XHRcdGNvbm5lY3Rpb25JZCxcblx0XHRcdGRpc3Rybyxcblx0XHRcdG5hbWU6IGNvbmZpZy5uYW1lLFxuXHRcdFx0YWRkcmVzczogY29ubmVjdGlvbktleSxcblx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogcmVzb2x2ZWRVcmwudG9rZW4sXG5cdFx0XHRjaGlsZCxcblx0XHRcdHdzLFxuXHRcdH07XG5cblx0XHR3cy5vbignbWVzc2FnZScsIGRhdGEgPT4ge1xuXHRcdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRcdGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGV4dCA9IGRhdGE7XG5cdFx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRcdFx0dGV4dCA9IEJ1ZmZlci5jb25jYXQoZGF0YSkudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdH0gZWxzZSBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdHRleHQgPSBCdWZmZXIuZnJvbShuZXcgVWludDhBcnJheShkYXRhKSkudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRleHQgPSAoZGF0YSBhcyBCdWZmZXIpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZFJlbGF5TWVzc2FnZS5maXJlKHsgY29ubmVjdGlvbklkLCBkYXRhOiB0ZXh0IH0pO1xuXHRcdH0pO1xuXG5cdFx0d3Mub24oJ2Nsb3NlJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2xvc2VDb25uZWN0aW9uKGNvbm5lY3Rpb25JZCk7XG5cdFx0fSk7XG5cblx0XHR3cy5vbignZXJyb3InLCAoZXJyOiB1bmtub3duKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gV2ViU29ja2V0IGVycm9yIGZvciAke2Nvbm5lY3Rpb25LZXl9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zLnNldChjb25uZWN0aW9uSWQsIGNvbm5lY3Rpb24pO1xuXHRcdHRoaXMuX2Rpc3Ryb1RvQ29ubmVjdGlvbklkLnNldChkaXN0cm8sIGNvbm5lY3Rpb25JZCk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb25uZWN0aW9uSWQsXG5cdFx0XHRhZGRyZXNzOiBjb25uZWN0aW9uS2V5LFxuXHRcdFx0ZGlzdHJvLFxuXHRcdFx0bmFtZTogY29uZmlnLm5hbWUsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46IHJlc29sdmVkVXJsLnRva2VuLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBkaXNjb25uZWN0KGRpc3Rybzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9kaXN0cm9Ub0Nvbm5lY3Rpb25JZC5nZXQoZGlzdHJvKTtcblx0XHRpZiAoaWQpIHtcblx0XHRcdHRoaXMuX2Nsb3NlQ29ubmVjdGlvbihpZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVjb25uZWN0KGRpc3Rybzogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHJlbW90ZUFnZW50SG9zdENvbW1hbmQ/OiBzdHJpbmcpOiBQcm9taXNlPElXU0xDb25uZWN0UmVzdWx0PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdJZCA9IHRoaXMuX2Rpc3Ryb1RvQ29ubmVjdGlvbklkLmdldChkaXN0cm8pO1xuXHRcdGlmIChleGlzdGluZ0lkKSB7XG5cdFx0XHR0aGlzLl9jbG9zZUNvbm5lY3Rpb24oZXhpc3RpbmdJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNvbm5lY3QoeyBkaXN0cm8sIG5hbWUsIHJlbW90ZUFnZW50SG9zdENvbW1hbmQgfSk7XG5cdH1cblxuXHRhc3luYyByZWxheVNlbmQoY29ubmVjdGlvbklkOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbklkKTtcblx0XHRpZiAoIWNvbm4pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYCR7TE9HX1BSRUZJWH0gcmVsYXlTZW5kOiBubyBjb25uZWN0aW9uICR7Y29ubmVjdGlvbklkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29ubi53cy5zZW5kKG1lc3NhZ2UpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IHJlbGF5U2VuZCBmYWlsZWQgZm9yICR7Y29ubmVjdGlvbklkfWAsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xvc2VDb25uZWN0aW9uKGNvbm5lY3Rpb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29ubiA9IHRoaXMuX2Nvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uSWQpO1xuXHRcdGlmICghY29ubikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGUoY29ubmVjdGlvbklkKTtcblx0XHRpZiAodGhpcy5fZGlzdHJvVG9Db25uZWN0aW9uSWQuZ2V0KGNvbm4uZGlzdHJvKSA9PT0gY29ubmVjdGlvbklkKSB7XG5cdFx0XHR0aGlzLl9kaXN0cm9Ub0Nvbm5lY3Rpb25JZC5kZWxldGUoY29ubi5kaXN0cm8pO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29ubi53cy5jbG9zZSgpO1xuXHRcdH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdHRoaXMuX2tpbGxDaGlsZChjb25uLmNoaWxkKTtcblx0XHR0aGlzLl9vbkRpZFJlbGF5Q2xvc2UuZmlyZShjb25uZWN0aW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2tpbGxDaGlsZChjaGlsZDogY3AuQ2hpbGRQcm9jZXNzKTogdm9pZCB7XG5cdFx0aWYgKGNoaWxkLmV4aXRDb2RlICE9PSBudWxsIHx8IGNoaWxkLnNpZ25hbENvZGUgIT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNoaWxkLmtpbGwoKTtcblx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHQvLyBFc2NhbGF0ZSB0byBTSUdLSUxMIGlmIHRoZSBwcm9jZXNzIGlzIHN0aWxsIGFsaXZlIGFmdGVyIDJzLiBUaGVcblx0XHQvLyBgdW5yZWZgIGNhc3QgYXZvaWRzIHRoZSBkb20vbm9kZSBgc2V0VGltZW91dGAgdHlwaW5nIGNvbGxpc2lvbiBpblxuXHRcdC8vIHN0cmljdCBtb2RlIFx1MjAxNCB3ZSBvbmx5IGNhcmUgdGhhdCBlc2NhbGF0aW9uIG5ldmVyIGJsb2NrcyBwcm9jZXNzIGV4aXQuXG5cdFx0Y29uc3QgZXNjYWxhdGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmIChjaGlsZC5leGl0Q29kZSA9PT0gbnVsbCAmJiBjaGlsZC5zaWduYWxDb2RlID09PSBudWxsKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y2hpbGQua2lsbCgnU0lHS0lMTCcpO1xuXHRcdFx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdH1cblx0XHR9LCAyXzAwMCkgYXMgdW5rbm93biBhcyBOb2RlSlMuVGltZW91dDtcblx0XHRlc2NhbGF0ZS51bnJlZigpO1xuXHRcdGNoaWxkLm9uY2UoJ2V4aXQnLCAoKSA9PiBjbGVhclRpbWVvdXQoZXNjYWxhdGUpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVQbGF0Zm9ybShkaXN0cm86IHN0cmluZyk6IFByb21pc2U8eyBvczogc3RyaW5nOyBhcmNoOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bldzbENvbW1hbmQoWyctZScsICd1bmFtZScsICctcycsICctbSddLCB7IGRpc3RybywgdGltZW91dDogMTBfMDAwIH0pO1xuXHRcdGlmIChyZXN1bHQuZXhpdENvZGUgIT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBGYWlsZWQgdG8gZGV0ZWN0IHBsYXRmb3JtIGluICcke2Rpc3Ryb30nIChleGl0ICR7cmVzdWx0LmV4aXRDb2RlfSk6ICR7cmVzdWx0LnN0ZGVyci50cmltKCkgfHwgcmVzdWx0LnN0ZG91dC50cmltKCl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRva2VucyA9IHJlc3VsdC5zdGRvdXQudHJpbSgpLnNwbGl0KC9cXHMrLyk7XG5cdFx0aWYgKHRva2Vucy5sZW5ndGggPCAyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gVW5leHBlY3RlZCB1bmFtZSBvdXRwdXQgZnJvbSAnJHtkaXN0cm99JzogJHtKU09OLnN0cmluZ2lmeShyZXN1bHQuc3Rkb3V0KX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlUmVtb3RlUGxhdGZvcm0odG9rZW5zWzBdLCB0b2tlbnMuc2xpY2UoMSkuam9pbignICcpKTtcblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3dzbFVuc3VwcG9ydGVkUGxhdGZvcm0nLCBcIlVuc3VwcG9ydGVkIFdTTCBkaXN0cm8gcGxhdGZvcm06IHswfVwiLCByZXN1bHQuc3Rkb3V0LnRyaW0oKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuV2ViU29ja2V0KHVybDogc3RyaW5nKTogUHJvbWlzZTxXZWJTb2NrZXQ+IHtcblx0XHRjb25zdCBuYXRpdmVSZXF1aXJlID0gYXdhaXQgdGhpcy5fZ2V0TmF0aXZlUmVxdWlyZSgpO1xuXHRcdGNvbnN0IFdTID0gbmF0aXZlUmVxdWlyZSgnd3MnKSBhcyB0eXBlb2YgV2ViU29ja2V0O1xuXHRcdGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIFdFQlNPQ0tFVF9PUEVOX1RJTUVPVVRfTVM7XG5cdFx0bGV0IGxhc3RFcnJvcjogdW5rbm93bjtcblx0XHQvLyBPbiB0aGUgZmlyc3QgY29ubmVjdCB0byBhIGZyZXNobHktYm9vdGVkIGRpc3RybywgdGhlIGFnZW50IGhvc3Rcblx0XHQvLyBwcmludHMgaXRzIGB3czovLzEyNy4wLjAuMTpQT1JUYCBVUkwgdGhlIG1vbWVudCBpdCBiaW5kcyBpbnNpZGVcblx0XHQvLyBXU0wgXHUyMDE0IGJ1dCB0aGUgV2luZG93cy1zaWRlIGxvY2FsaG9zdCBmb3J3YXJkICh3c2xyZWxheSkgbmVlZHMgYVxuXHRcdC8vIGJyaWVmIG1vbWVudCBtb3JlIHRvIHNldCB1cCB0aGUgcG9ydCBmb3J3YXJkaW5nLiBXZSBzZWUgdGhpcyBhc1xuXHRcdC8vIGFuIGltbWVkaWF0ZSBFQ09OTlJFRlVTRUQgKHdyYXBwZWQgaW4gYW4gQWdncmVnYXRlRXJyb3IgYmVjYXVzZVxuXHRcdC8vIE5vZGUgdHJpZXMgSVB2NCBhbmQgSVB2NiBpbiBwYXJhbGxlbCkuIFJldHJ5IHVudGlsIHRoZSBvdmVyYWxsXG5cdFx0Ly8gZGVhZGxpbmUgZWxhcHNlczsgb25jZSB0aGUgZm9yd2FyZCBpcyB1cCB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bFxuXHRcdC8vIGBvcGVuYCByZXR1cm5zIGltbWVkaWF0ZWx5LlxuXHRcdGZvciAobGV0IGF0dGVtcHQgPSAwOyA7IGF0dGVtcHQrKykge1xuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gZGVhZGxpbmUgLSBEYXRlLm5vdygpO1xuXHRcdFx0aWYgKHJlbWFpbmluZyA8PSAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBUaW1lZCBvdXQgb3BlbmluZyBXZWJTb2NrZXQgdG8gJHtyZWRhY3RUb2tlbih1cmwpfSBhZnRlciAke1dFQlNPQ0tFVF9PUEVOX1RJTUVPVVRfTVN9bXMke2xhc3RFcnJvciA/IGA6ICR7bGFzdEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBsYXN0RXJyb3IubWVzc2FnZSA6IFN0cmluZyhsYXN0RXJyb3IpfWAgOiAnJ31gKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl90cnlPcGVuV2ViU29ja2V0KG5ldyBXUyh1cmwpLCB1cmwsIHJlbWFpbmluZyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0bGFzdEVycm9yID0gZXJyO1xuXHRcdFx0XHRpZiAoIWlzQ29ubmVjdGlvblJlZnVzZWQoZXJyKSkge1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBMaW5lYXIgYmFja29mZiBjYXBwZWQgYXQgNTAwbXM7IHRoZSBmb3J3YXJkIHVzdWFsbHkgY29tZXNcblx0XHRcdFx0Ly8gdXAgd2l0aGluIGEgZmV3IGh1bmRyZWQgbXMgYWZ0ZXIgdGhlIFVSTCBpcyBwcmludGVkLlxuXHRcdFx0XHRjb25zdCBkZWxheSA9IE1hdGgubWluKDEwMCArIGF0dGVtcHQgKiAxMDAsIDUwMCk7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlcyA9PiBzZXRUaW1lb3V0KHJlcywgZGVsYXkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cnlPcGVuV2ViU29ja2V0KHdzOiBXZWJTb2NrZXQsIHVybDogc3RyaW5nLCB0aW1lb3V0TXM6IG51bWJlcik6IFByb21pc2U8V2ViU29ja2V0PiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFdlYlNvY2tldD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgdGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHdzLmNsb3NlKCk7XG5cdFx0XHRcdH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGAke0xPR19QUkVGSVh9IFRpbWVkIG91dCBvcGVuaW5nIFdlYlNvY2tldCB0byAke3JlZGFjdFRva2VuKHVybCl9IGFmdGVyICR7dGltZW91dE1zfW1zYCkpO1xuXHRcdFx0fSwgdGltZW91dE1zKTtcblx0XHRcdHdzLm9uY2UoJ29wZW4nLCAoKSA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcblx0XHRcdFx0cmVzb2x2ZSh3cyk7XG5cdFx0XHR9KTtcblx0XHRcdHdzLm9uY2UoJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXRIYW5kbGUpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHdzLmNsb3NlKCk7XG5cdFx0XHRcdH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogVHJ1ZSBmb3IgdGhlIGBFQ09OTlJFRlVTRURgIHNoYXBlcyBOb2RlIHN1cmZhY2VzIGZvciBgd3M6Ly8xMjcuMC4wLjE6UE9SVGBcbiAqIGJlZm9yZSBXU0wncyBsb2NhbGhvc3QtZm9yd2FyZGluZyByZWxheSBoYXMgd2lyZWQgdXAgdGhlIGZvcndhcmQuIE5vZGUgMTgrXG4gKiB3cmFwcyB0aGUgcGFyYWxsZWwgSVB2NC9JUHY2IGF0dGVtcHRzIGluIGFuIGBBZ2dyZWdhdGVFcnJvcmAsIHNvIHdlIGhhdmVcbiAqIHRvIGluc3BlY3QgdGhlIGlubmVyIGVycm9ycyB0b28uXG4gKi9cbmZ1bmN0aW9uIGlzQ29ubmVjdGlvblJlZnVzZWQoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGlmICghZXJyIHx8IHR5cGVvZiBlcnIgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGNvZGUgPSAoZXJyIGFzIHsgY29kZT86IHN0cmluZyB9KS5jb2RlO1xuXHRpZiAoY29kZSA9PT0gJ0VDT05OUkVGVVNFRCcgfHwgY29kZSA9PT0gJ0VOT1RGT1VORCcgfHwgY29kZSA9PT0gJ0VBRERSTk9UQVZBSUwnKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3QgZXJyb3JzID0gKGVyciBhcyB7IGVycm9ycz86IHVua25vd25bXSB9KS5lcnJvcnM7XG5cdGlmIChBcnJheS5pc0FycmF5KGVycm9ycykpIHtcblx0XHRyZXR1cm4gZXJyb3JzLnNvbWUoaXNDb25uZWN0aW9uUmVmdXNlZCk7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBU2hDLFNBQVMsYUFBYSw2QkFBNkI7QUFDbkQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7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
