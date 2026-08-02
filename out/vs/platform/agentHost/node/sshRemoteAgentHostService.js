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
import { promises as fsp } from "fs";
import * as os from "os";
import * as cp from "child_process";
import { dirname, join, isAbsolute, basename } from "../../../base/common/path.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap, toDisposable } from "../../../base/common/lifecycle.js";
import { raceTimeout } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import {
  SSHAuthMethod
} from "../common/sshRemoteAgentHost.js";
import {
  buildAgentHostBaseCommand,
  buildCLIDownloadUrl,
  buildCleanupOldCLIsCommand,
  buildFindFallbackCLICommand,
  cleanupRemoteAgentHost,
  extractAgentHostWebSocketURL,
  findRunningAgentHost,
  getRemoteCLIBin,
  getRemoteCLIDataDir,
  getRemoteCLIInstallRoot,
  isValidFallbackCLIPath,
  redactToken,
  resolveRemotePlatform,
  shellEscape,
  writeAgentHostState
} from "./sshRemoteAgentHostHelpers.js";
import { parseSSHConfigHostEntries, parseSSHGOutput, stripSSHComment } from "../common/sshConfigParsing.js";
import { removeAnsiEscapeCodes } from "../../../base/common/strings.js";
const LOG_PREFIX = "[SSHRemoteAgentHost]";
const RECONNECT_RELAY_TIMEOUT_MS = 6e4;
function describeAuthAttempt(attempt) {
  switch (attempt.type) {
    case "publickey":
      return `publickey ${attempt.keyPath}`;
    case "agent":
      return "agent";
    case "password":
      return "password";
    case "keyboard-interactive":
      return "keyboard-interactive";
  }
}
function toAuthMethod(attempt, kbiHandler, keyPassphraseHandler, callback) {
  switch (attempt.type) {
    case "publickey": {
      const { keyPath: _kp, encrypted: _encrypted, ...payload } = attempt;
      if (attempt.encrypted) {
        if (!keyPassphraseHandler) {
          return void 0;
        }
        keyPassphraseHandler(attempt.keyPath, (passphrase) => {
          if (passphrase === void 0) {
            callback(false);
            return;
          }
          callback({ ...payload, passphrase });
        });
        return void 0;
      }
      return payload;
    }
    case "agent":
    case "password":
      return attempt;
    case "keyboard-interactive": {
      if (!kbiHandler) {
        return void 0;
      }
      return {
        type: "keyboard-interactive",
        username: attempt.username,
        prompt: (name, instructions, _lang, prompts, finish) => {
          const normalized = prompts.map((p) => ({ prompt: p.prompt, echo: p.echo ?? true }));
          kbiHandler(name, instructions, normalized, (responses) => finish([...responses]));
        }
      };
    }
  }
}
function isMethodAllowedByServer(attempt, methodsLeft) {
  if (!methodsLeft) {
    return true;
  }
  const protocolMethod = attempt.type === "agent" ? "publickey" : attempt.type;
  return methodsLeft.includes(protocolMethod);
}
function makeAuthHandler(attempts, logService, kbiHandler, keyPassphraseHandler) {
  let index = 0;
  return (methodsLeft, _partialSuccess, callback) => {
    while (index < attempts.length) {
      const attempt = attempts[index++];
      if (!isMethodAllowedByServer(attempt, methodsLeft)) {
        logService.info(`${LOG_PREFIX} Skipping ${describeAuthAttempt(attempt)} \u2014 server only allows ${methodsLeft.join(", ")}`);
        continue;
      }
      const method = toAuthMethod(attempt, kbiHandler, keyPassphraseHandler, callback);
      if (!method) {
        if (attempt.type === "publickey" && attempt.encrypted && keyPassphraseHandler) {
          logService.info(`${LOG_PREFIX} Trying auth: ${describeAuthAttempt(attempt)}`);
          return;
        }
        logService.warn(`${LOG_PREFIX} ${describeAuthAttempt(attempt)} skipped: no prompt handler available`);
        continue;
      }
      logService.info(`${LOG_PREFIX} Trying auth: ${describeAuthAttempt(attempt)}`);
      callback(method);
      return;
    }
    logService.info(`${LOG_PREFIX} No more auth methods to try; giving up`);
    callback(false);
  };
}
function readSSHString(buffer, offset) {
  if (offset + 4 > buffer.length) {
    return void 0;
  }
  const length = buffer.readUInt32BE(offset);
  const valueOffset = offset + 4;
  const nextOffset = valueOffset + length;
  if (nextOffset > buffer.length) {
    return void 0;
  }
  return { value: buffer.toString("utf8", valueOffset, nextOffset), offset: nextOffset };
}
function isEncryptedPrivateKey(key) {
  const text = key.toString("utf8");
  if (/-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text) || /Proc-Type:\s*4,ENCRYPTED/i.test(text)) {
    return true;
  }
  const openSSHKey = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]+?)-----END OPENSSH PRIVATE KEY-----/.exec(text);
  if (!openSSHKey) {
    return false;
  }
  const data = Buffer.from(openSSHKey[1].replace(/\s+/g, ""), "base64");
  const magic = Buffer.from("openssh-key-v1\0", "utf8");
  if (data.length < magic.length || !data.subarray(0, magic.length).equals(magic)) {
    return false;
  }
  const cipher = readSSHString(data, magic.length);
  return !!cipher && cipher.value !== "none";
}
function sshExec(client, command, opts) {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (error, code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        if (code !== 0 && !opts?.ignoreExitCode) {
          reject(new Error(`SSH command failed (exit ${code}): ${command}
stderr: ${stderr}`));
        } else {
          resolve({ stdout, stderr, code: code ?? 0 });
        }
      };
      stream.on("data", (data) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      stream.on("error", (streamErr) => finish(streamErr, void 0));
      stream.on("close", (code) => finish(void 0, code));
    });
  });
}
function bindSshExec(client) {
  return (command, opts) => sshExec(client, command, opts);
}
function startRemoteAgentHost(client, logService, cliBin, cliDataDir, commandOverride) {
  return new Promise((resolve, reject) => {
    if (!commandOverride && (!cliBin || !cliDataDir)) {
      reject(new Error(`${LOG_PREFIX} startRemoteAgentHost requires either a cliBin+cliDataDir pair or a commandOverride`));
      return;
    }
    const baseCmd = commandOverride ?? buildAgentHostBaseCommand(cliBin, cliDataDir);
    const cmd = `bash -l -c ${shellEscape(`echo VSCODE_PID=$$ && exec ${baseCmd}`)}`;
    logService.info(`${LOG_PREFIX} Starting remote agent host: ${cmd}`);
    client.exec(cmd, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let resolved = false;
      let outputBuf = "";
      let pid;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`${LOG_PREFIX} Timed out waiting for agent host to start.
output so far: ${redactToken(outputBuf)}`));
        }
      }, 6e4);
      const checkForOutput = () => {
        const clean = removeAnsiEscapeCodes(outputBuf);
        if (pid === void 0) {
          const pidMatch = clean.match(/VSCODE_PID=(\d+)/);
          if (pidMatch) {
            pid = parseInt(pidMatch[1], 10);
            logService.info(`${LOG_PREFIX} Remote agent host PID: ${pid}`);
          }
        }
        if (!resolved) {
          const match = extractAgentHostWebSocketURL(clean);
          if (match) {
            resolved = true;
            clearTimeout(timeout);
            logService.info(`${LOG_PREFIX} Remote agent host listening on port ${match.port}`);
            resolve({ port: match.port, connectionToken: match.token, pid, stream });
          }
        }
      };
      stream.stderr.on("data", (data) => {
        const text = data.toString();
        outputBuf += text;
        logService.trace(`${LOG_PREFIX} remote stderr: ${redactToken(text.trimEnd())}`);
        checkForOutput();
      });
      stream.on("data", (data) => {
        const text = data.toString();
        outputBuf += text;
        logService.trace(`${LOG_PREFIX} remote stdout: ${redactToken(text.trimEnd())}`);
        checkForOutput();
      });
      stream.on("error", (streamErr) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(streamErr);
        }
      });
      stream.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`${LOG_PREFIX} Agent host process exited with code ${code} before becoming ready.
output: ${redactToken(outputBuf)}`));
        }
      });
    });
  });
}
function createWebSocketRelay(nativeRequire, client, dstHost, dstPort, connectionToken, logService, onMessage, onClose) {
  return new Promise((resolve, reject) => {
    client.forwardOut("127.0.0.1", 0, dstHost, dstPort, (err, channel) => {
      if (err) {
        reject(err);
        return;
      }
      const WS = nativeRequire("ws");
      let url = `ws://${dstHost}:${dstPort}`;
      if (connectionToken) {
        url += `?tkn=${encodeURIComponent(connectionToken)}`;
      }
      const ws = new WS(url, { createConnection: (() => channel) });
      ws.on("open", () => {
        logService.info(`${LOG_PREFIX} WebSocket relay connected to remote agent host`);
        resolve({
          send: (data) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(data);
            }
          },
          close: () => ws.close()
        });
      });
      ws.on("message", (data) => {
        if (Array.isArray(data)) {
          onMessage(Buffer.concat(data).toString());
        } else if (data instanceof ArrayBuffer) {
          onMessage(Buffer.from(new Uint8Array(data)).toString());
        } else {
          onMessage(data.toString());
        }
      });
      ws.on("close", onClose);
      ws.on("error", (wsErr) => {
        logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
        reject(wsErr);
      });
    });
  });
}
function sanitizeConfig(config) {
  const { password: _p, privateKeyPath: _k, ...sanitized } = config;
  return sanitized;
}
class SSHConnection extends Disposable {
  constructor(fullConfig, connectionId, address, name, connectionToken, remotePort, sshClient, _relay, _remoteStream, _logService) {
    super();
    this.connectionId = connectionId;
    this.address = address;
    this.name = name;
    this.connectionToken = connectionToken;
    this.remotePort = remotePort;
    this.sshClient = sshClient;
    this._relay = _relay;
    this._remoteStream = _remoteStream;
    this._logService = _logService;
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._closed = false;
    this._sshClientDetached = false;
    this._sshCloseListener = () => {
      this._logService.info(`${LOG_PREFIX} SSH client closed for connection ${this.connectionId} (address ${this.address}); disposing connection`);
      this.dispose();
    };
    this._sshErrorListener = (err) => {
      this._logService.info(`${LOG_PREFIX} SSH client error for connection ${this.connectionId} (address ${this.address}): ${err instanceof Error ? err.message : String(err)}; disposing connection`);
      this.dispose();
    };
    this.config = sanitizeConfig(fullConfig);
    this._register(toDisposable(() => {
      if (this._closed) {
        return;
      }
      this._closed = true;
      this._relay.close();
      if (!this._sshClientDetached) {
        this._remoteStream?.close();
        sshClient.end();
      }
      this._onDidClose.fire();
    }));
    this._register(this._onDidClose);
    sshClient.on("close", this._sshCloseListener);
    sshClient.on("error", this._sshErrorListener);
  }
  /**
   * Detach the SSH client from this connection so that `dispose()`
   * only closes the WebSocket relay without ending the SSH session.
   * Also removes event listeners from the SSH client so the old
   * connection object is not retained by the shared client.
   */
  detachSshClient() {
    this._sshClientDetached = true;
    this.sshClient.removeListener("close", this._sshCloseListener);
    this.sshClient.removeListener("error", this._sshErrorListener);
  }
  relaySend(data) {
    this._relay.send(data);
  }
}
let SSHRemoteAgentHostMainService = class extends Disposable {
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
    this._onDidRequestKeyboardInteractive = this._register(new Emitter());
    this.onDidRequestKeyboardInteractive = this._onDidRequestKeyboardInteractive.event;
    this._onDidCancelKeyboardInteractive = this._register(new Emitter());
    this.onDidCancelKeyboardInteractive = this._onDidCancelKeyboardInteractive.event;
    /**
     * Pending keyboard-interactive prompts awaiting a response from the renderer.
     * Keyed by `requestId`. Each entry can either finish the ssh2 prompt with
     * responses or cancel the owning connect attempt when the user dismisses it.
     */
    this._pendingKbiRequests = /* @__PURE__ */ new Map();
    this._kbiRequestCounter = 0;
    this._connections = this._register(new DisposableMap());
    /**
     * Override hook for tests to shorten the relay-creation timeout used on
     * the `replaceRelay` reconnect path. See {@link RECONNECT_RELAY_TIMEOUT_MS}.
     */
    this.relayCreationTimeoutMs = RECONNECT_RELAY_TIMEOUT_MS;
  }
  /**
   * Lazily load a `require` function for native modules (`ssh2`, `ws`).
   * Uses a dynamic `import('node:module')` so the module is only resolved
   * when actually needed at runtime — not at file-load time. This matters
   * because tests override the methods that call this and never trigger
   * the import, avoiding issues with Electron's ESM loader which cannot
   * resolve `node:` specifiers.
   */
  async _getNativeRequire() {
    if (!this._nativeRequire) {
      const nodeModule = await import("node:module");
      this._nativeRequire = nodeModule.createRequire(import.meta.url);
    }
    return this._nativeRequire;
  }
  async connect(config, replaceRelay) {
    const connectionKey = config.sshConfigHost ? `ssh:${config.sshConfigHost}` : `${config.username}@${config.host}:${config.port ?? 22}`;
    const existing = this._connections.get(connectionKey);
    if (existing) {
      if (replaceRelay) {
        this._logService.info(`${LOG_PREFIX} Reconnecting relay for existing SSH tunnel ${connectionKey}`);
        const { sshClient: sshClient2, remotePort, connectionToken } = existing;
        this._connections.deleteAndLeak(connectionKey);
        existing.detachSshClient();
        existing.dispose();
        const connectionId = connectionKey;
        try {
          let conn;
          const timeoutMs = this.relayCreationTimeoutMs;
          const relay = await raceTimeout(
            this._createWebSocketRelay(
              sshClient2,
              "127.0.0.1",
              remotePort,
              connectionToken,
              (data) => this._onDidRelayMessage.fire({ connectionId, data }),
              () => {
                conn?.dispose();
              }
            ),
            timeoutMs
          );
          if (!relay) {
            throw new Error(`SSH relay creation timed out after ${timeoutMs}ms (SSH client appears unresponsive)`);
          }
          conn = new SSHConnection(
            config,
            connectionId,
            connectionKey,
            config.name,
            connectionToken,
            remotePort,
            sshClient2,
            relay,
            void 0,
            this._logService
          );
          Event.once(conn.onDidClose)(() => {
            if (this._connections.get(connectionKey) === conn) {
              this._connections.deleteAndDispose(connectionKey);
              this._onDidRelayClose.fire(connectionId);
              this._onDidCloseConnection.fire(connectionId);
              this._onDidChangeConnections.fire();
            }
          });
          this._connections.set(connectionKey, conn);
          return {
            connectionId: conn.connectionId,
            address: conn.address,
            name: conn.name,
            connectionToken: conn.connectionToken,
            config: conn.config,
            sshConfigHost: config.sshConfigHost
          };
        } catch (err) {
          sshClient2.end();
          this._onDidRelayClose.fire(connectionId);
          this._onDidCloseConnection.fire(connectionId);
          this._onDidChangeConnections.fire();
          throw err;
        }
      }
      return {
        connectionId: existing.connectionId,
        address: existing.address,
        name: existing.name,
        connectionToken: existing.connectionToken,
        config: existing.config,
        sshConfigHost: config.sshConfigHost
      };
    }
    this._logService.info(`${LOG_PREFIX} ${replaceRelay ? "Reconnecting" : "Connecting"} to ${connectionKey}`);
    let sshClient;
    try {
      const reportProgress = (message) => {
        this._onDidReportConnectProgress.fire({ connectionKey, message });
      };
      reportProgress(localize("sshProgressConnecting", "Establishing SSH connection..."));
      sshClient = await this._connectSSH(config, connectionKey);
      let cliBin;
      let cliResolved = false;
      const ensureCliResolved = async () => {
        if (cliResolved) {
          return;
        }
        cliResolved = true;
        if (config.remoteAgentHostCommand) {
          this._logService.info(`${LOG_PREFIX} Using custom agent host command: ${config.remoteAgentHostCommand}`);
          return;
        }
        const { stdout: unameS } = await sshExec(sshClient, "uname -s");
        const { stdout: unameM } = await sshExec(sshClient, "uname -m");
        const platform = resolveRemotePlatform(unameS, unameM);
        if (!platform) {
          throw new Error(`${LOG_PREFIX} Unsupported remote platform: ${unameS.trim()} ${unameM.trim()}`);
        }
        this._logService.info(`${LOG_PREFIX} Remote platform: ${platform.os}-${platform.arch}`);
        reportProgress(localize("sshProgressInstallingCLI", "Checking remote CLI installation..."));
        cliBin = await this._ensureCLIInstalled(sshClient, platform, reportProgress);
      };
      let remoteHost = "127.0.0.1";
      let remotePort;
      let connectionToken;
      let agentStream;
      reportProgress(localize("sshProgressCheckingAgent", "Checking for existing agent host..."));
      const exec = bindSshExec(sshClient);
      const existingAH = await findRunningAgentHost(exec, this._logService, this._serverDataFolderName, this._quality);
      if (existingAH.kind === "compatible") {
        remoteHost = existingAH.host;
        remotePort = existingAH.port;
        connectionToken = existingAH.connectionToken;
      }
      if (remotePort === void 0) {
        await ensureCliResolved();
        reportProgress(localize("sshProgressStartingAgent", "Starting remote agent host..."));
        const result = await this._startRemoteAgentHost(sshClient, cliBin, getRemoteCLIDataDir(this._serverDataFolderName), config.remoteAgentHostCommand);
        remotePort = result.port;
        connectionToken = result.connectionToken;
        agentStream = result.stream;
        await writeAgentHostState(exec, this._logService, this._serverDataFolderName, this._quality, result.pid, remotePort, connectionToken);
      }
      reportProgress(localize("sshProgressForwarding", "Connecting to remote agent host..."));
      const connectionId = connectionKey;
      let conn;
      let relay;
      try {
        relay = await this._createWebSocketRelay(
          sshClient,
          remoteHost,
          remotePort,
          connectionToken,
          (data) => this._onDidRelayMessage.fire({ connectionId, data }),
          () => {
            conn?.dispose();
          }
        );
      } catch (relayErr) {
        if (existingAH.kind !== "compatible") {
          throw relayErr;
        }
        const relayErrorMessage = relayErr instanceof Error ? relayErr.message : String(relayErr);
        this._logService.warn(`${LOG_PREFIX} Failed to connect to reused agent host on ${remoteHost}:${remotePort}: ${relayErrorMessage}. Starting fresh`);
        await cleanupRemoteAgentHost(exec, this._logService, this._serverDataFolderName, this._quality);
        await ensureCliResolved();
        reportProgress(localize("sshProgressStartingAgent", "Starting remote agent host..."));
        const result = await this._startRemoteAgentHost(sshClient, cliBin, getRemoteCLIDataDir(this._serverDataFolderName), config.remoteAgentHostCommand);
        remoteHost = "127.0.0.1";
        remotePort = result.port;
        connectionToken = result.connectionToken;
        agentStream = result.stream;
        await writeAgentHostState(exec, this._logService, this._serverDataFolderName, this._quality, result.pid, remotePort, connectionToken);
        reportProgress(localize("sshProgressForwarding", "Connecting to remote agent host..."));
        relay = await this._createWebSocketRelay(
          sshClient,
          remoteHost,
          remotePort,
          connectionToken,
          (data) => this._onDidRelayMessage.fire({ connectionId, data }),
          () => {
            conn?.dispose();
          }
        );
      }
      const address = connectionKey;
      conn = new SSHConnection(
        config,
        connectionId,
        address,
        config.name,
        connectionToken,
        remotePort,
        sshClient,
        relay,
        agentStream,
        this._logService
      );
      Event.once(conn.onDidClose)(() => {
        if (this._connections.get(connectionKey) === conn) {
          this._connections.deleteAndDispose(connectionKey);
          this._onDidRelayClose.fire(connectionId);
          this._onDidCloseConnection.fire(connectionId);
          this._onDidChangeConnections.fire();
        }
      });
      this._connections.set(connectionKey, conn);
      sshClient = void 0;
      this._onDidChangeConnections.fire();
      return {
        connectionId,
        address,
        name: config.name,
        connectionToken,
        config: conn.config,
        sshConfigHost: config.sshConfigHost
      };
    } catch (err) {
      sshClient?.end();
      throw err;
    }
  }
  async disconnect(host) {
    for (const [key, conn] of this._connections) {
      if (key === host || conn.connectionId === host) {
        conn.dispose();
        return;
      }
    }
  }
  async relaySend(connectionId, message) {
    for (const conn of this._connections.values()) {
      if (conn.connectionId === connectionId) {
        conn.relaySend(message);
        return;
      }
    }
  }
  async reconnect(sshConfigHost, name, remoteAgentHostCommand, agentForward) {
    this._logService.info(`${LOG_PREFIX} Reconnecting via SSH config host: ${sshConfigHost}`);
    const resolved = await this.resolveSSHConfig(sshConfigHost);
    let privateKeyPath;
    if (resolved.identityFile.length > 0 && !SSHRemoteAgentHostMainService._isDefaultKeyPath(resolved.identityFile[0])) {
      privateKeyPath = resolved.identityFile[0];
    }
    this._logService.info(`${LOG_PREFIX} reconnect: identityFiles=${JSON.stringify(resolved.identityFile)}, explicit key=${privateKeyPath ?? "(none)"}`);
    return this.connect(
      {
        host: resolved.hostname,
        port: resolved.port !== 22 ? resolved.port : void 0,
        username: resolved.user ?? sshConfigHost,
        authMethod: SSHAuthMethod.Agent,
        privateKeyPath,
        identityAgent: resolved.identityAgent,
        name,
        sshConfigHost,
        remoteAgentHostCommand,
        agentForward: agentForward && resolved.forwardAgent ? true : void 0
      },
      /* replaceRelay */
      true
    );
  }
  async listSSHConfigHosts() {
    const configPath = join(os.homedir(), ".ssh", "config");
    try {
      const content = await fsp.readFile(configPath, "utf-8");
      return this._parseSSHConfigHosts(content, dirname(configPath));
    } catch {
      this._logService.info(`${LOG_PREFIX} Could not read SSH config at ${configPath}`);
      return [];
    }
  }
  async ensureUserSSHConfig() {
    const sshDir = join(os.homedir(), ".ssh");
    const configPath = join(sshDir, "config");
    const isPosix = process.platform !== "win32";
    try {
      await fsp.mkdir(sshDir, { recursive: true, mode: isPosix ? 448 : void 0 });
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} Failed to ensure ~/.ssh directory: ${err}`);
      throw err;
    }
    try {
      await fsp.access(configPath);
    } catch {
      try {
        const handle = await fsp.open(configPath, "a", isPosix ? 384 : void 0);
        await handle.close();
      } catch (err) {
        this._logService.warn(`${LOG_PREFIX} Failed to create ${configPath}: ${err}`);
        throw err;
      }
    }
    return URI.file(configPath);
  }
  async listSSHConfigFiles() {
    const isWindows = process.platform === "win32";
    const userConfigPath = join(os.homedir(), ".ssh", "config");
    const systemConfigPath = isWindows ? join(process.env["ProgramData"] ?? "C:\\ProgramData", "ssh", "ssh_config") : "/etc/ssh/ssh_config";
    const result = [URI.file(userConfigPath)];
    try {
      await fsp.access(systemConfigPath);
      result.push(URI.file(systemConfigPath));
    } catch {
    }
    return result;
  }
  async resolveSSHConfig(host) {
    return new Promise((resolve, reject) => {
      cp.execFile("ssh", ["-G", host], { timeout: 5e3 }, (err, stdout) => {
        if (err) {
          reject(new Error(`${LOG_PREFIX} ssh -G failed for ${host}: ${err.message}`));
          return;
        }
        const config = this._parseSSHGOutput(stdout);
        resolve(config);
      });
    });
  }
  async _parseSSHConfigHosts(content, configDir, visited) {
    const seen = visited ?? /* @__PURE__ */ new Set();
    const hosts = [];
    hosts.push(...parseSSHConfigHostEntries(content));
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const includeMatch = trimmed.match(/^Include\s+(.+)$/i);
      if (!includeMatch) {
        continue;
      }
      const rawValue = stripSSHComment(includeMatch[1]);
      const patterns = rawValue.split(/\s+/).filter(Boolean);
      for (const rawPattern of patterns) {
        const pattern = rawPattern.replace(/^~/, os.homedir());
        const resolvedPattern = isAbsolute(pattern) ? pattern : join(configDir, pattern);
        if (seen.has(resolvedPattern)) {
          continue;
        }
        seen.add(resolvedPattern);
        try {
          const stat = await fsp.stat(resolvedPattern);
          if (stat.isDirectory()) {
            const files = await fsp.readdir(resolvedPattern);
            for (const file of files) {
              try {
                const sub = await fsp.readFile(join(resolvedPattern, file), "utf-8");
                hosts.push(...await this._parseSSHConfigHosts(sub, resolvedPattern, seen));
              } catch {
              }
            }
          } else {
            const sub = await fsp.readFile(resolvedPattern, "utf-8");
            hosts.push(...await this._parseSSHConfigHosts(sub, dirname(resolvedPattern), seen));
          }
        } catch {
          const dir = dirname(resolvedPattern);
          const base = basename(resolvedPattern);
          if (base.includes("*")) {
            try {
              const files = await fsp.readdir(dir);
              for (const file of files) {
                const regex = new RegExp("^" + base.replace(/\*/g, ".*") + "$");
                if (regex.test(file)) {
                  try {
                    const sub = await fsp.readFile(join(dir, file), "utf-8");
                    hosts.push(...await this._parseSSHConfigHosts(sub, dir, seen));
                  } catch {
                  }
                }
              }
            } catch {
            }
          }
        }
      }
    }
    return hosts;
  }
  _parseSSHGOutput(stdout) {
    return parseSSHGOutput(stdout);
  }
  async _connectSSH(config, connectionKey) {
    const connectConfig = {
      host: config.host,
      port: config.port ?? 22,
      username: config.username,
      readyTimeout: 3e4,
      keepaliveInterval: 15e3
    };
    const attempts = await this._buildAuthAttempts(config);
    this._logService.info(`${LOG_PREFIX} Built ${attempts.length} auth attempt(s): ${attempts.map((a) => describeAuthAttempt(a)).join(", ")}`);
    const displayHost = config.sshConfigHost ?? `${config.username}@${config.host}`;
    const liveKbiRequests = /* @__PURE__ */ new Set();
    let cancelConnectFromKbi;
    const kbiHandler = attempts.some((a) => a.type === "keyboard-interactive") ? (name, instructions, prompts, finish) => {
      const requestId = this._handleKeyboardInteractive(connectionKey ?? displayHost, displayHost, config.username, name, instructions, prompts, finish, () => cancelConnectFromKbi?.());
      liveKbiRequests.add(requestId);
    } : void 0;
    const keyPassphraseHandler = attempts.some((a) => a.type === "publickey" && a.encrypted) ? (keyPath, finish) => {
      const requestId = this._handleKeyboardInteractive(
        connectionKey ?? displayHost,
        displayHost,
        config.username,
        localize("sshKeyPassphraseName", "SSH Key Passphrase"),
        "",
        [{ prompt: localize("sshKeyPassphrasePrompt", "Enter passphrase for SSH key {0}.", keyPath), echo: false }],
        (responses) => finish(responses[0]),
        () => cancelConnectFromKbi?.()
      );
      liveKbiRequests.add(requestId);
    } : void 0;
    connectConfig.authHandler = makeAuthHandler(attempts, this._logService, kbiHandler, keyPassphraseHandler);
    const cancelLiveKbiRequests = () => {
      for (const requestId of liveKbiRequests) {
        const pending = this._pendingKbiRequests.get(requestId);
        this._pendingKbiRequests.delete(requestId);
        this._onDidCancelKeyboardInteractive.fire(requestId);
        pending?.finish([]);
      }
      liveKbiRequests.clear();
    };
    if (config.agentForward) {
      const agentSock = this._getAgentSocket(config);
      if (agentSock) {
        connectConfig.agent = agentSock;
        connectConfig.agentForward = true;
        this._logService.info(`${LOG_PREFIX} SSH agent forwarding enabled`);
      } else {
        this._logService.warn(`${LOG_PREFIX} SSH agent forwarding requested, but no SSH agent endpoint is available; agent forwarding disabled`);
      }
    }
    const client = await this._createSSHClient();
    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveConnect = () => {
        if (settled) {
          return;
        }
        settled = true;
        this._logService.info(`${LOG_PREFIX} SSH connection established to ${config.host}`);
        cancelLiveKbiRequests();
        resolve(client);
      };
      const rejectConnect = (err, endClient) => {
        if (settled) {
          return;
        }
        settled = true;
        cancelLiveKbiRequests();
        if (endClient) {
          client.end();
        }
        reject(err);
      };
      cancelConnectFromKbi = () => {
        this._logService.info(`${LOG_PREFIX} SSH keyboard-interactive prompt cancelled by user for ${displayHost}`);
        rejectConnect(new CancellationError(), true);
      };
      client.on("ready", () => {
        resolveConnect();
      });
      client.on("error", (err) => {
        this._logService.error(`${LOG_PREFIX} SSH connection error: ${err.message}`);
        rejectConnect(err, false);
      });
      client.connect(connectConfig);
    });
  }
  async _createSSHClient() {
    const nativeRequire = await this._getNativeRequire();
    const ssh2Module = nativeRequire("ssh2");
    return new ssh2Module.Client();
  }
  /**
   * Build the ordered list of authentication attempts to feed to ssh2's
   * `authHandler`. In `Agent` mode we try the configured agent first (so a
   * loaded identity short-circuits before we ever touch an encrypted key
   * file), then any non-default explicit `IdentityFile`, then each readable
   * default identity in turn. A host that accepts `~/.ssh/id_rsa` still
   * works even if the agent doesn't have it loaded — without needing an
   * explicit `IdentityFile` entry in `~/.ssh/config`.
   */
  async _buildAuthAttempts(config) {
    const attempts = [];
    const username = config.username;
    switch (config.authMethod) {
      case SSHAuthMethod.Agent: {
        const agentSock = this._getAgentSocket(config);
        if (agentSock) {
          attempts.push({ type: "agent", username, agent: agentSock });
        }
        const explicitKeyPath = config.privateKeyPath;
        const explicitIsDefault = explicitKeyPath !== void 0 && SSHRemoteAgentHostMainService._isDefaultKeyPath(explicitKeyPath);
        if (explicitKeyPath && !explicitIsDefault) {
          const explicit = await this._readKeyFileIfExists(explicitKeyPath);
          if (explicit) {
            attempts.push({ type: "publickey", username, key: explicit, keyPath: explicitKeyPath, ...isEncryptedPrivateKey(explicit) ? { encrypted: true } : void 0 });
          }
        }
        for (const keyPath of SSHRemoteAgentHostMainService._defaultKeyPaths) {
          const contents = await this._readKeyFileIfExists(keyPath);
          if (contents) {
            attempts.push({ type: "publickey", username, key: contents, keyPath, ...isEncryptedPrivateKey(contents) ? { encrypted: true } : void 0 });
          }
        }
        attempts.push({ type: "keyboard-interactive", username });
        break;
      }
      case SSHAuthMethod.KeyFile: {
        if (!config.privateKeyPath) {
          throw new Error(localize("ssh.keyFileAuthRequiresPath", "Key file authentication requires a private key path."));
        }
        const explicit = await this._readKeyFileIfExists(config.privateKeyPath);
        if (!explicit) {
          throw new Error(localize("ssh.failedToReadPrivateKey", "Failed to read private key file: {0}", config.privateKeyPath));
        }
        attempts.push({ type: "publickey", username, key: explicit, keyPath: config.privateKeyPath, ...isEncryptedPrivateKey(explicit) ? { encrypted: true } : void 0 });
        break;
      }
      case SSHAuthMethod.Password: {
        if (config.password !== void 0) {
          attempts.push({ type: "password", username, password: config.password });
        }
        break;
      }
    }
    return attempts;
  }
  /**
   * Expand a leading `~` to the current user's home directory so that paths
   * coming back from `ssh -G` (always absolute) compare equal to our
   * `~`-prefixed defaults.
   */
  static _normalizeKeyPath(keyPath) {
    return keyPath.replace(/^~/, os.homedir());
  }
  static _isDefaultKeyPath(keyPath) {
    const normalized = SSHRemoteAgentHostMainService._normalizeKeyPath(keyPath);
    return SSHRemoteAgentHostMainService._defaultKeyPaths.some((p) => SSHRemoteAgentHostMainService._normalizeKeyPath(p) === normalized);
  }
  /** Test seam: returns the SSH agent socket path, or undefined when no agent is available. */
  _isAgentAvailable() {
    return process.env["SSH_AUTH_SOCK"];
  }
  _getAgentSocket(config) {
    if (config.identityAgent !== void 0) {
      return this._resolveIdentityAgent(config.identityAgent);
    }
    return this._isAgentAvailable();
  }
  _resolveIdentityAgent(identityAgent) {
    const trimmed = identityAgent.trim();
    if (!trimmed || trimmed.toLowerCase() === "none") {
      return void 0;
    }
    if (trimmed === "SSH_AUTH_SOCK") {
      return this._isAgentAvailable();
    }
    if (trimmed.startsWith("$")) {
      const envMatch = /^\$\{(?<braced>[A-Za-z_][A-Za-z0-9_]*)\}$|^\$(?<plain>[A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
      return envMatch?.groups ? process.env[envMatch.groups.braced ?? envMatch.groups.plain] || void 0 : void 0;
    }
    return trimmed.replace(/^~/, os.homedir());
  }
  /**
   * Forward a keyboard-interactive challenge from ssh2 to the renderer and
   * register the `finish` callback so {@link respondKeyboardInteractive} can
   * supply the user's responses when they arrive. Returns the generated
   * `requestId` so the caller can track in-flight prompts.
   */
  _handleKeyboardInteractive(connectionKey, displayHost, username, name, instructions, prompts, finish, cancelConnect) {
    const requestId = `kbi-${++this._kbiRequestCounter}`;
    let settled = false;
    const finishOnce = (responses) => {
      if (settled) {
        return;
      }
      settled = true;
      this._pendingKbiRequests.delete(requestId);
      finish(responses);
    };
    this._pendingKbiRequests.set(requestId, { finish: finishOnce, cancelConnect });
    this._logService.info(`${LOG_PREFIX} keyboard-interactive challenge from ${displayHost}: ${prompts.length} prompt(s)`);
    this._onDidRequestKeyboardInteractive.fire({
      requestId,
      connectionKey,
      displayHost,
      username,
      name,
      instructions,
      prompts: prompts.map((p) => ({ prompt: p.prompt, echo: p.echo }))
    });
    return requestId;
  }
  async respondKeyboardInteractive(requestId, responses) {
    const pending = this._pendingKbiRequests.get(requestId);
    if (!pending) {
      this._logService.warn(`${LOG_PREFIX} respondKeyboardInteractive: no pending request for ${requestId}`);
      return;
    }
    if (responses === void 0) {
      pending.cancelConnect();
      pending.finish([]);
      return;
    }
    pending.finish(responses);
  }
  /**
   * Test seam: read a private key file from disk. Returns `undefined` if the
   * file doesn't exist; logs and returns `undefined` for any other read error
   * so a single broken key doesn't abort the whole auth flow.
   */
  async _readKeyFileIfExists(keyPath) {
    const resolved = keyPath.replace(/^~/, os.homedir());
    try {
      return await fsp.readFile(resolved);
    } catch (error) {
      const errorCode = error.code;
      if (errorCode === "ENOENT" || errorCode === "ENOTDIR") {
        return void 0;
      }
      this._logService.warn(`${LOG_PREFIX} Failed to read SSH key file ${resolved}`, error);
      return void 0;
    }
  }
  get _quality() {
    return this._productService.quality || "insider";
  }
  get _serverDataFolderName() {
    return this._productService.serverDataFolderName ?? ".vscode-server-oss";
  }
  get _commit() {
    return this._productService.commit;
  }
  _startRemoteAgentHost(client, cliBin, cliDataDir, commandOverride) {
    return startRemoteAgentHost(client, this._logService, cliBin, cliDataDir, commandOverride);
  }
  async _createWebSocketRelay(client, dstHost, dstPort, connectionToken, onMessage, onClose) {
    const nativeRequire = await this._getNativeRequire();
    return createWebSocketRelay(nativeRequire, client, dstHost, dstPort, connectionToken, this._logService, onMessage, onClose);
  }
  /**
   * Resolve which CLI binary to run on the remote.
   *
   * When the desktop has a `productService.commit` (release builds), we
   * pin to that commit: install at `~/<serverDataFolderName>/<archive>-<commit>`
   * (sharing the install root with Remote-SSH), reuse on file existence,
   * download from the commit-pinned URL on miss, and clean up older
   * commit-keyed CLIs (keep last 5). The agent host CLI does not
   * self-update on this path, so the desktop pushes freshness on every
   * fresh start — but tolerantly: if the download fails and any other
   * usable CLI is present (other commit-keyed or the legacy
   * `~/.vscode-cli{,-<quality>}/<archive>`), we fall back to the newest
   * one rather than refusing to connect.
   *
   * In dev/OSS builds with no commit, we keep the loose, non-pinned
   * behavior: install `~/<serverDataFolderName>/<archive>` from the
   * `latest` URL, with a `--version`-based reuse check.
   *
   * Returns the resolved CLI binary path to run.
   */
  async _ensureCLIInstalled(client, platform, reportProgress) {
    const commit = this._commit;
    if (!commit) {
      return this._ensureCLIInstalledLoose(client, platform, reportProgress);
    }
    return this._ensureCLIInstalledPinned(client, platform, reportProgress, commit);
  }
  /**
   * Commit-pinned install path. See {@link _ensureCLIInstalled}.
   */
  async _ensureCLIInstalledPinned(client, platform, reportProgress, commit) {
    const cliBin = getRemoteCLIBin(this._serverDataFolderName, this._quality, commit);
    const installRoot = getRemoteCLIInstallRoot(this._serverDataFolderName);
    const { code: existsCode } = await sshExec(client, `test -x ${cliBin}`, { ignoreExitCode: true });
    if (existsCode === 0) {
      this._logService.info(`${LOG_PREFIX} Reusing remote CLI at ${cliBin}`);
      const { code: touchCode } = await sshExec(client, `touch -- ${cliBin}`, { ignoreExitCode: true });
      if (touchCode === 0) {
        await sshExec(client, buildCleanupOldCLIsCommand(this._serverDataFolderName, this._quality), { ignoreExitCode: true });
      } else {
        this._logService.warn(`${LOG_PREFIX} Skipping CLI retention cleanup: touch exited ${touchCode}`);
      }
      return cliBin;
    }
    reportProgress(localize("sshProgressDownloadingCLI", "Installing VS Code CLI on remote..."));
    const url = buildCLIDownloadUrl(platform.os, platform.arch, this._quality, commit);
    const installCmd = [
      `mkdir -p ${installRoot}`,
      `tmpdir=$(mktemp -d ${installRoot}/.cli-install-XXXXXX)`,
      `(cd "$tmpdir" && curl -fsSL ${shellEscape(url)} | tar xz)`,
      // The archive contains exactly one file: the CLI binary, named per quality.
      `mv "$tmpdir"/* ${cliBin}`,
      `chmod +x ${cliBin}`,
      `rm -rf "$tmpdir"`
    ].join(" && ");
    try {
      await sshExec(client, installCmd);
      const { code: versionCode } = await sshExec(client, `${cliBin} --version`, { ignoreExitCode: true });
      if (versionCode !== 0) {
        throw new Error(`CLI at ${cliBin} failed --version check after install (exit code ${versionCode})`);
      }
      this._logService.info(`${LOG_PREFIX} Installed remote CLI at ${cliBin}`);
      await sshExec(client, buildCleanupOldCLIsCommand(this._serverDataFolderName, this._quality), { ignoreExitCode: true });
      return cliBin;
    } catch (installErr) {
      const installErrorMessage = installErr instanceof Error ? installErr.message : String(installErr);
      this._logService.warn(`${LOG_PREFIX} Could not install matching CLI for commit ${commit}: ${installErrorMessage}. Looking for a fallback CLI on the remote...`);
      const fallback = await this._findFallbackCLI(client);
      if (fallback) {
        this._logService.warn(`${LOG_PREFIX} Using fallback CLI at ${fallback} (does not match desktop commit ${commit}).`);
        return fallback;
      }
      throw installErr;
    }
  }
  /**
   * Loose dev-build install: no commit pin. See {@link _ensureCLIInstalled}.
   */
  async _ensureCLIInstalledLoose(client, platform, reportProgress) {
    const cliBin = getRemoteCLIBin(this._serverDataFolderName, this._quality);
    const installRoot = getRemoteCLIInstallRoot(this._serverDataFolderName);
    this._logService.warn(`${LOG_PREFIX} Desktop has no product commit; falling back to non-pinned CLI install at ${cliBin}.`);
    const { code } = await sshExec(client, `${cliBin} --version`, { ignoreExitCode: true });
    if (code === 0) {
      this._logService.info(`${LOG_PREFIX} Reusing remote CLI at ${cliBin} (dev build, --version check passed)`);
      return cliBin;
    }
    reportProgress(localize("sshProgressDownloadingCLI", "Installing VS Code CLI on remote..."));
    const url = buildCLIDownloadUrl(platform.os, platform.arch, this._quality);
    const installCmd = [
      `mkdir -p ${installRoot}`,
      `curl -fsSL ${shellEscape(url)} | tar xz -C ${installRoot}`,
      `chmod +x ${cliBin}`
    ].join(" && ");
    await sshExec(client, installCmd);
    this._logService.info(`${LOG_PREFIX} Installed remote CLI at ${cliBin}`);
    return cliBin;
  }
  /**
   * List remote CLI candidates that could be used as a fallback when the
   * commit-pinned download fails, and return the newest one that passes
   * a `--version` check. Returns `undefined` if no candidate works.
   */
  async _findFallbackCLI(client) {
    const { stdout } = await sshExec(client, buildFindFallbackCLICommand(this._serverDataFolderName, this._quality), { ignoreExitCode: true });
    const rawCandidates = stdout.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
    const candidates = [];
    for (const candidate of rawCandidates) {
      if (isValidFallbackCLIPath(candidate, this._serverDataFolderName, this._quality)) {
        candidates.push(candidate);
      } else {
        this._logService.info(`${LOG_PREFIX} Ignoring fallback CLI candidate with unexpected path shape: ${candidate}`);
      }
    }
    for (const candidate of candidates) {
      const { code } = await sshExec(client, `${candidate} --version`, { ignoreExitCode: true });
      if (code === 0) {
        return candidate;
      }
      this._logService.info(`${LOG_PREFIX} Fallback CLI candidate ${candidate} failed --version check (exit ${code}); trying next.`);
    }
    return void 0;
  }
};
SSHRemoteAgentHostMainService._defaultKeyPaths = [
  "~/.ssh/id_ed25519",
  "~/.ssh/id_rsa",
  "~/.ssh/id_ecdsa",
  "~/.ssh/id_dsa",
  "~/.ssh/id_xmss"
];
SSHRemoteAgentHostMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProductService)
], SSHRemoteAgentHostMainService);
export {
  SSHRemoteAgentHostMainService,
  makeAuthHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NzaFJlbW90ZUFnZW50SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSBXZWJTb2NrZXQgZnJvbSAnd3MnO1xuaW1wb3J0IHR5cGUgeyBBbnlBdXRoTWV0aG9kLCBBdXRoZW50aWNhdGlvblR5cGUsIENvbm5lY3RDb25maWcgfSBmcm9tICdzc2gyJztcbmltcG9ydCB7IHByb21pc2VzIGFzIGZzcCB9IGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiwgaXNBYnNvbHV0ZSwgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0SVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLFxuXHRTU0hBdXRoTWV0aG9kLFxuXHR0eXBlIElTU0hBZ2VudEhvc3RDb25maWcsXG5cdHR5cGUgSVNTSEFnZW50SG9zdENvbmZpZ1Nhbml0aXplZCxcblx0dHlwZSBJU1NIQ29ubmVjdFByb2dyZXNzLFxuXHR0eXBlIElTU0hDb25uZWN0UmVzdWx0LFxuXHR0eXBlIElTU0hLZXlib2FyZEludGVyYWN0aXZlUHJvbXB0LFxuXHR0eXBlIElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdCxcblx0dHlwZSBJU1NIUmVzb2x2ZWRDb25maWcsXG59IGZyb20gJy4uL2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHR5cGUgeyBJUmVsYXlNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL3JlbGF5VHJhbnNwb3J0LmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkQWdlbnRIb3N0QmFzZUNvbW1hbmQsXG5cdGJ1aWxkQ0xJRG93bmxvYWRVcmwsXG5cdGJ1aWxkQ2xlYW51cE9sZENMSXNDb21tYW5kLFxuXHRidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQsXG5cdGNsZWFudXBSZW1vdGVBZ2VudEhvc3QsXG5cdGV4dHJhY3RBZ2VudEhvc3RXZWJTb2NrZXRVUkwsXG5cdGZpbmRSdW5uaW5nQWdlbnRIb3N0LFxuXHRnZXRSZW1vdGVDTElCaW4sXG5cdGdldFJlbW90ZUNMSURhdGFEaXIsXG5cdGdldFJlbW90ZUNMSUluc3RhbGxSb290LFxuXHRpc1ZhbGlkRmFsbGJhY2tDTElQYXRoLFxuXHRyZWRhY3RUb2tlbixcblx0cmVzb2x2ZVJlbW90ZVBsYXRmb3JtLFxuXHRzaGVsbEVzY2FwZSxcblx0d3JpdGVBZ2VudEhvc3RTdGF0ZSxcbn0gZnJvbSAnLi9zc2hSZW1vdGVBZ2VudEhvc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMsIHBhcnNlU1NIR091dHB1dCwgc3RyaXBTU0hDb21tZW50IH0gZnJvbSAnLi4vY29tbW9uL3NzaENvbmZpZ1BhcnNpbmcuanMnO1xuaW1wb3J0IHsgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5cbi8qKiBNaW5pbWFsIHN1YnNldCBvZiBzc2gyLkNsaWVudENoYW5uZWwgdXNlZCBieSB0aGlzIG1vZHVsZSAoZHVwbGV4IHN0cmVhbSkuICovXG5pbnRlcmZhY2UgU1NIQ2hhbm5lbCBleHRlbmRzIE5vZGVKUy5SZWFkV3JpdGVTdHJlYW0ge1xuXHRvbihldmVudDogJ2RhdGEnLCBsaXN0ZW5lcjogKGRhdGE6IEJ1ZmZlcikgPT4gdm9pZCk6IHRoaXM7XG5cdG9uKGV2ZW50OiAnY2xvc2UnLCBsaXN0ZW5lcjogKGNvZGU6IG51bWJlcikgPT4gdm9pZCk6IHRoaXM7XG5cdG9uKGV2ZW50OiAnZXJyb3InLCBsaXN0ZW5lcjogKGVycjogRXJyb3IpID0+IHZvaWQpOiB0aGlzO1xuXHRvbihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCk6IHRoaXM7XG5cdHN0ZGVycjogeyBvbihldmVudDogJ2RhdGEnLCBsaXN0ZW5lcjogKGRhdGE6IEJ1ZmZlcikgPT4gdm9pZCk6IHZvaWQgfTtcblx0Y2xvc2UoKTogdm9pZDtcbn1cblxuLyoqIE1pbmltYWwgc3Vic2V0IG9mIHNzaDIuQ2xpZW50IHVzZWQgYnkgdGhpcyBtb2R1bGUuICovXG5pbnRlcmZhY2UgU1NIQ2xpZW50IHtcblx0b24oZXZlbnQ6ICdyZWFkeScsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogU1NIQ2xpZW50O1xuXHRvbihldmVudDogJ2Vycm9yJywgbGlzdGVuZXI6IChlcnI6IEVycm9yKSA9PiB2b2lkKTogU1NIQ2xpZW50O1xuXHRvbihldmVudDogJ2Nsb3NlJywgbGlzdGVuZXI6ICgpID0+IHZvaWQpOiBTU0hDbGllbnQ7XG5cdHJlbW92ZUxpc3RlbmVyKGV2ZW50OiAnY2xvc2UnLCBsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IFNTSENsaWVudDtcblx0cmVtb3ZlTGlzdGVuZXIoZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IFNTSENsaWVudDtcblx0Y29ubmVjdChjb25maWc6IENvbm5lY3RDb25maWcpOiB2b2lkO1xuXHRleGVjKGNvbW1hbmQ6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBzdHJlYW06IFNTSENoYW5uZWwpID0+IHZvaWQpOiBTU0hDbGllbnQ7XG5cdGZvcndhcmRPdXQoc3JjSVA6IHN0cmluZywgc3JjUG9ydDogbnVtYmVyLCBkc3RJUDogc3RyaW5nLCBkc3RQb3J0OiBudW1iZXIsIGNhbGxiYWNrOiAoZXJyOiBFcnJvciB8IHVuZGVmaW5lZCwgY2hhbm5lbDogU1NIQ2hhbm5lbCkgPT4gdm9pZCk6IFNTSENsaWVudDtcblx0ZW5kKCk6IHZvaWQ7XG59XG5cbmNvbnN0IExPR19QUkVGSVggPSAnW1NTSFJlbW90ZUFnZW50SG9zdF0nO1xuXG4vKipcbiAqIE1heGltdW0gdGltZSB0byB3YWl0IGZvciB7QGxpbmsgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX2NyZWF0ZVdlYlNvY2tldFJlbGF5fVxuICogdG8gc2V0dGxlIG9uIHRoZSBgcmVwbGFjZVJlbGF5YCByZWNvbm5lY3QgcGF0aCBiZWZvcmUgZ2l2aW5nIHVwLiBBIHNpbGVudGx5XG4gKiBkZWFkIFNTSCBjbGllbnQgKFRDUCBoYWxmLW9wZW4sIHNzaDIga2VlcGFsaXZlIGhhc24ndCBmaXJlZCB5ZXQpIGNhbiBsZWF2ZVxuICogYGZvcndhcmRPdXRgJ3MgY2FsbGJhY2sgdW5maXJlZCwgaGFuZ2luZyB0aGUgd2hvbGUgYGNvbm5lY3QoKWAgY2FsbC4gQm91bmRpbmdcbiAqIHRoaXMgc3VyZmFjZXMgYSBjbGVhbiBmYWlsdXJlIHNvIHRoZSByZW5kZXJlciBjYW4gY2xlYXIgaXRzIHBlbmRpbmctcmVjb25uZWN0XG4gKiBmbGFnIGFuZCByZXRyeSwgYW5kIHNvIHRoZSBkZWFkIFNTSCBjbGllbnQgZ2V0cyBlbmRlZCAocHVyZ2luZyBpdCBmcm9tIHRoZVxuICogc2hhcmVkLXByb2Nlc3MgYF9jb25uZWN0aW9uc2AgbWFwKS5cbiAqXG4gKiBUaGUgdmFsdWUgaXMganVzdCBzbGlnaHRseSBsYXJnZXIgdGhhbiBzc2gyJ3MgZGVmYXVsdCBrZWVwYWxpdmUgZmFpbHVyZVxuICogd2luZG93IChga2VlcGFsaXZlSW50ZXJ2YWwgKiBrZWVwYWxpdmVDb3VudE1heGAgfj0gMTVzICogMyA9IDQ1cykgc28gdGhhdCBpblxuICogcHJhY3RpY2UgdGhlIFNTSCBjbGllbnQgaXRzZWxmIHdpbGwgc3VyZmFjZSBpdHMgb3duIGAnY2xvc2UnYCBmaXJzdCB3aGVuXG4gKiB0aGUgbmV0d29yayBpcyBoYXJkLWRvd24uIFRlc3RzIG92ZXJyaWRlIHRoaXMgdG8gYSBtdWNoIHNtYWxsZXIgdmFsdWUuXG4gKi9cbmNvbnN0IFJFQ09OTkVDVF9SRUxBWV9USU1FT1VUX01TID0gNjBfMDAwO1xuXG4vKipcbiAqIE9uZSBlbnRyeSBpbiB0aGUgcXVldWUgb2YgYXV0aGVudGljYXRpb24gYXR0ZW1wdHMgaGFuZGVkIHRvIHNzaDInc1xuICogYGF1dGhIYW5kbGVyYC4gRWFjaCBhdHRlbXB0IGNvcnJlc3BvbmRzIHRvIG9uZSBvZiB0aGUgYXV0aCBtZXRob2Qgc2hhcGVzXG4gKiBkb2N1bWVudGVkIGF0IGh0dHBzOi8vd3d3Lm5wbWpzLmNvbS9wYWNrYWdlL3NzaDIjY2xpZW50LW1ldGhvZHMuXG4gKlxuICogYGtleVBhdGhgIGlzIGludGVybmFsLW9ubHkgbWV0YWRhdGEgZm9yIGxvZ2dpbmcgXHUyMDE0IGl0IGlzIHN0cmlwcGVkIGJlZm9yZSB0aGVcbiAqIGF0dGVtcHQgaXMgcmV0dXJuZWQgdG8gc3NoMi5cbiAqL1xuZXhwb3J0IHR5cGUgU1NIQXV0aEF0dGVtcHQgPVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogJ3B1YmxpY2tleSc7IHJlYWRvbmx5IHVzZXJuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGtleTogQnVmZmVyOyByZWFkb25seSBrZXlQYXRoOiBzdHJpbmc7IHJlYWRvbmx5IGVuY3J5cHRlZD86IGJvb2xlYW4gfVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogJ2FnZW50JzsgcmVhZG9ubHkgdXNlcm5hbWU6IHN0cmluZzsgcmVhZG9ubHkgYWdlbnQ6IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSB0eXBlOiAncGFzc3dvcmQnOyByZWFkb25seSB1c2VybmFtZTogc3RyaW5nOyByZWFkb25seSBwYXNzd29yZDogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZSc7IHJlYWRvbmx5IHVzZXJuYW1lOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZGVzY3JpYmVBdXRoQXR0ZW1wdChhdHRlbXB0OiBTU0hBdXRoQXR0ZW1wdCk6IHN0cmluZyB7XG5cdHN3aXRjaCAoYXR0ZW1wdC50eXBlKSB7XG5cdFx0Y2FzZSAncHVibGlja2V5JzogcmV0dXJuIGBwdWJsaWNrZXkgJHthdHRlbXB0LmtleVBhdGh9YDtcblx0XHRjYXNlICdhZ2VudCc6IHJldHVybiAnYWdlbnQnO1xuXHRcdGNhc2UgJ3Bhc3N3b3JkJzogcmV0dXJuICdwYXNzd29yZCc7XG5cdFx0Y2FzZSAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnOiByZXR1cm4gJ2tleWJvYXJkLWludGVyYWN0aXZlJztcblx0fVxufVxuXG4vKipcbiAqIENhbGxiYWNrIGludm9rZWQgd2hlbiB0aGUgU1NIIHNlcnZlciByZXF1ZXN0cyBrZXlib2FyZC1pbnRlcmFjdGl2ZVxuICogYXV0aGVudGljYXRpb24uIFRoZSBoYW5kbGVyIG11c3QgZXZlbnR1YWxseSBjYWxsIGBmaW5pc2hgIHdpdGggdGhlXG4gKiB1c2VyJ3MgcmVzcG9uc2VzIChvciBhbiBlbXB0eSBhcnJheSB0byBmYWlsIHRoaXMgYXR0ZW1wdCkuXG4gKi9cbmV4cG9ydCB0eXBlIFNTSEtleWJvYXJkSW50ZXJhY3RpdmVQcm9tcHRIYW5kbGVyID0gKFxuXHRuYW1lOiBzdHJpbmcsXG5cdGluc3RydWN0aW9uczogc3RyaW5nLFxuXHRwcm9tcHRzOiByZWFkb25seSBJU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVByb21wdFtdLFxuXHRmaW5pc2g6IChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiB2b2lkLFxuKSA9PiB2b2lkO1xuXG5leHBvcnQgdHlwZSBTU0hLZXlQYXNzcGhyYXNlUHJvbXB0SGFuZGxlciA9IChcblx0a2V5UGF0aDogc3RyaW5nLFxuXHRmaW5pc2g6IChwYXNzcGhyYXNlOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHZvaWQsXG4pID0+IHZvaWQ7XG5cbi8qKlxuICogVHJhbnNsYXRlIGEge0BsaW5rIFNTSEF1dGhBdHRlbXB0fSBpbnRvIHRoZSBwYXlsb2FkIHNoYXBlIHNzaDIgZXhwZWN0cyBpblxuICogaXRzIGBhdXRoSGFuZGxlcmAgY2FsbGJhY2suIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgYXR0ZW1wdCBjYW5ub3QgYmVcbiAqIHJlYWxpemVkIChjdXJyZW50bHkgb25seSBga2V5Ym9hcmQtaW50ZXJhY3RpdmVgIHdpdGhvdXQgYSBwcm9tcHQgaGFuZGxlcikuXG4gKlxuICogVGhlIGtiaSBjYXNlIGlzIHRoZSBvbmUgcGxhY2Ugd2hlcmUgd2Ugc3RpbGwgbmVlZCBhIGNhbGxiYWNrLWJyaWRnZTogc3NoMlxuICogY2FsbHMgb3VyIGBwcm9tcHRgIHdpdGggYSBgZmluaXNoKHN0cmluZ1tdKWAgYW5kIHdlIGhhbmQgdGhlIHJlc3BvbnNlcyB0b1xuICogYGtiaUhhbmRsZXJgLiBJc29sYXRpbmcgdGhhdCBoZXJlIGtlZXBzIGl0IG91dCBvZiB0aGUgaXRlcmF0aW9uIGxvb3AgYmVsb3cuXG4gKi9cbmZ1bmN0aW9uIHRvQXV0aE1ldGhvZChcblx0YXR0ZW1wdDogU1NIQXV0aEF0dGVtcHQsXG5cdGtiaUhhbmRsZXI6IFNTSEtleWJvYXJkSW50ZXJhY3RpdmVQcm9tcHRIYW5kbGVyIHwgdW5kZWZpbmVkLFxuXHRrZXlQYXNzcGhyYXNlSGFuZGxlcjogU1NIS2V5UGFzc3BocmFzZVByb21wdEhhbmRsZXIgfCB1bmRlZmluZWQsXG5cdGNhbGxiYWNrOiAobmV4dDogQW55QXV0aE1ldGhvZCB8IGZhbHNlKSA9PiB2b2lkLFxuKTogQW55QXV0aE1ldGhvZCB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAoYXR0ZW1wdC50eXBlKSB7XG5cdFx0Y2FzZSAncHVibGlja2V5Jzoge1xuXHRcdFx0Ly8gU3RyaXAgb3VyIGludGVybmFsIGBrZXlQYXRoYCBtZXRhZGF0YSBiZWZvcmUgaGFuZGluZyB0byBzc2gyLlxuXHRcdFx0Y29uc3QgeyBrZXlQYXRoOiBfa3AsIGVuY3J5cHRlZDogX2VuY3J5cHRlZCwgLi4ucGF5bG9hZCB9ID0gYXR0ZW1wdDtcblx0XHRcdGlmIChhdHRlbXB0LmVuY3J5cHRlZCkge1xuXHRcdFx0XHRpZiAoIWtleVBhc3NwaHJhc2VIYW5kbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRrZXlQYXNzcGhyYXNlSGFuZGxlcihhdHRlbXB0LmtleVBhdGgsIHBhc3NwaHJhc2UgPT4ge1xuXHRcdFx0XHRcdGlmIChwYXNzcGhyYXNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKGZhbHNlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FsbGJhY2soeyAuLi5wYXlsb2FkLCBwYXNzcGhyYXNlIH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXlsb2FkO1xuXHRcdH1cblx0XHRjYXNlICdhZ2VudCc6XG5cdFx0Y2FzZSAncGFzc3dvcmQnOlxuXHRcdFx0cmV0dXJuIGF0dGVtcHQ7XG5cdFx0Y2FzZSAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnOiB7XG5cdFx0XHRpZiAoIWtiaUhhbmRsZXIpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsXG5cdFx0XHRcdHVzZXJuYW1lOiBhdHRlbXB0LnVzZXJuYW1lLFxuXHRcdFx0XHRwcm9tcHQ6IChuYW1lLCBpbnN0cnVjdGlvbnMsIF9sYW5nLCBwcm9tcHRzLCBmaW5pc2gpID0+IHtcblx0XHRcdFx0XHRjb25zdCBub3JtYWxpemVkID0gcHJvbXB0cy5tYXAocCA9PiAoeyBwcm9tcHQ6IHAucHJvbXB0LCBlY2hvOiBwLmVjaG8gPz8gdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0a2JpSGFuZGxlcihuYW1lLCBpbnN0cnVjdGlvbnMsIG5vcm1hbGl6ZWQsIHJlc3BvbnNlcyA9PiBmaW5pc2goWy4uLnJlc3BvbnNlc10pKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogYGFnZW50YCBpcyBhIHB1YmxpY2tleS1mbGF2b3JlZCBtZXRob2QgYXQgdGhlIFNTSCBwcm90b2NvbCBsZXZlbCBcdTIwMTQgc2VydmVyc1xuICogYWR2ZXJ0aXNlIGBwdWJsaWNrZXlgLCBub3QgYGFnZW50YCwgaW4gYG1ldGhvZHNMZWZ0YC4gUmV0dXJucyB0cnVlIHdoZW4gdGhlXG4gKiBzZXJ2ZXIgc3RpbGwgaGFzIHRoZSB1bmRlcmx5aW5nIHByb3RvY29sIG1ldGhvZCBvbiBvZmZlci5cbiAqL1xuZnVuY3Rpb24gaXNNZXRob2RBbGxvd2VkQnlTZXJ2ZXIoYXR0ZW1wdDogU1NIQXV0aEF0dGVtcHQsIG1ldGhvZHNMZWZ0OiBBdXRoZW50aWNhdGlvblR5cGVbXSB8IG51bGwpOiBib29sZWFuIHtcblx0aWYgKCFtZXRob2RzTGVmdCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IHByb3RvY29sTWV0aG9kOiBBdXRoZW50aWNhdGlvblR5cGUgPSBhdHRlbXB0LnR5cGUgPT09ICdhZ2VudCcgPyAncHVibGlja2V5JyA6IGF0dGVtcHQudHlwZTtcblx0cmV0dXJuIG1ldGhvZHNMZWZ0LmluY2x1ZGVzKHByb3RvY29sTWV0aG9kKTtcbn1cblxuLyoqXG4gKiBCdWlsZCBhbiBzc2gyIGBhdXRoSGFuZGxlcmAgY2FsbGJhY2sgdGhhdCB3YWxrcyB0aGUgZ2l2ZW4gYXR0ZW1wdHMgaW4gb3JkZXIsXG4gKiBmaWx0ZXJpbmcgYnkgdGhlIHNlcnZlci1hZHZlcnRpc2VkIGBtZXRob2RzTGVmdGAgd2hlbiBzc2gyIHByb3ZpZGVzIG9uZS5cbiAqIFJldHVybnMgYGZhbHNlYCB3aGVuIHRoZSBxdWV1ZSBpcyBleGhhdXN0ZWQsIHdoaWNoIGNhdXNlcyBzc2gyIHRvIHN1cmZhY2VcbiAqIGFuIGF1dGhlbnRpY2F0aW9uIGZhaWx1cmUgdG8gdGhlIGNhbGxlci5cbiAqXG4gKiBga2JpSGFuZGxlcmAgKHdoZW4gcHJvdmlkZWQpIGlzIGludm9rZWQgYnkgc3NoMiBpZiB0aGUgc2VydmVyIHBpY2tzIHRoZVxuICogYGtleWJvYXJkLWludGVyYWN0aXZlYCBhdHRlbXB0LCBhbmQgaXMgcmVzcG9uc2libGUgZm9yIGNvbGxlY3RpbmdcbiAqIHJlc3BvbnNlcyAoZS5nLiBieSBwcm9tcHRpbmcgdGhlIHVzZXIpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFrZUF1dGhIYW5kbGVyKFxuXHRhdHRlbXB0czogcmVhZG9ubHkgU1NIQXV0aEF0dGVtcHRbXSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdGtiaUhhbmRsZXI/OiBTU0hLZXlib2FyZEludGVyYWN0aXZlUHJvbXB0SGFuZGxlcixcblx0a2V5UGFzc3BocmFzZUhhbmRsZXI/OiBTU0hLZXlQYXNzcGhyYXNlUHJvbXB0SGFuZGxlcixcbik6IChtZXRob2RzTGVmdDogQXV0aGVudGljYXRpb25UeXBlW10gfCBudWxsLCBwYXJ0aWFsU3VjY2VzczogYm9vbGVhbiwgY2FsbGJhY2s6IChuZXh0OiBBbnlBdXRoTWV0aG9kIHwgZmFsc2UpID0+IHZvaWQpID0+IHZvaWQge1xuXHRsZXQgaW5kZXggPSAwO1xuXHRyZXR1cm4gKG1ldGhvZHNMZWZ0LCBfcGFydGlhbFN1Y2Nlc3MsIGNhbGxiYWNrKSA9PiB7XG5cdFx0d2hpbGUgKGluZGV4IDwgYXR0ZW1wdHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBhdHRlbXB0ID0gYXR0ZW1wdHNbaW5kZXgrK107XG5cdFx0XHRpZiAoIWlzTWV0aG9kQWxsb3dlZEJ5U2VydmVyKGF0dGVtcHQsIG1ldGhvZHNMZWZ0KSkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gU2tpcHBpbmcgJHtkZXNjcmliZUF1dGhBdHRlbXB0KGF0dGVtcHQpfSBcdTIwMTQgc2VydmVyIG9ubHkgYWxsb3dzICR7bWV0aG9kc0xlZnQhLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWV0aG9kID0gdG9BdXRoTWV0aG9kKGF0dGVtcHQsIGtiaUhhbmRsZXIsIGtleVBhc3NwaHJhc2VIYW5kbGVyLCBjYWxsYmFjayk7XG5cdFx0XHRpZiAoIW1ldGhvZCkge1xuXHRcdFx0XHRpZiAoYXR0ZW1wdC50eXBlID09PSAncHVibGlja2V5JyAmJiBhdHRlbXB0LmVuY3J5cHRlZCAmJiBrZXlQYXNzcGhyYXNlSGFuZGxlcikge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBUcnlpbmcgYXV0aDogJHtkZXNjcmliZUF1dGhBdHRlbXB0KGF0dGVtcHQpfWApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gJHtkZXNjcmliZUF1dGhBdHRlbXB0KGF0dGVtcHQpfSBza2lwcGVkOiBubyBwcm9tcHQgaGFuZGxlciBhdmFpbGFibGVgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVHJ5aW5nIGF1dGg6ICR7ZGVzY3JpYmVBdXRoQXR0ZW1wdChhdHRlbXB0KX1gKTtcblx0XHRcdGNhbGxiYWNrKG1ldGhvZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBObyBtb3JlIGF1dGggbWV0aG9kcyB0byB0cnk7IGdpdmluZyB1cGApO1xuXHRcdGNhbGxiYWNrKGZhbHNlKTtcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVhZFNTSFN0cmluZyhidWZmZXI6IEJ1ZmZlciwgb2Zmc2V0OiBudW1iZXIpOiB7IHZhbHVlOiBzdHJpbmc7IG9mZnNldDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRpZiAob2Zmc2V0ICsgNCA+IGJ1ZmZlci5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGxlbmd0aCA9IGJ1ZmZlci5yZWFkVUludDMyQkUob2Zmc2V0KTtcblx0Y29uc3QgdmFsdWVPZmZzZXQgPSBvZmZzZXQgKyA0O1xuXHRjb25zdCBuZXh0T2Zmc2V0ID0gdmFsdWVPZmZzZXQgKyBsZW5ndGg7XG5cdGlmIChuZXh0T2Zmc2V0ID4gYnVmZmVyLmxlbmd0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgdmFsdWU6IGJ1ZmZlci50b1N0cmluZygndXRmOCcsIHZhbHVlT2Zmc2V0LCBuZXh0T2Zmc2V0KSwgb2Zmc2V0OiBuZXh0T2Zmc2V0IH07XG59XG5cbmZ1bmN0aW9uIGlzRW5jcnlwdGVkUHJpdmF0ZUtleShrZXk6IEJ1ZmZlcik6IGJvb2xlYW4ge1xuXHRjb25zdCB0ZXh0ID0ga2V5LnRvU3RyaW5nKCd1dGY4Jyk7XG5cdGlmICgvLS0tLS1CRUdJTiBFTkNSWVBURUQgUFJJVkFURSBLRVktLS0tLS8udGVzdCh0ZXh0KSB8fCAvUHJvYy1UeXBlOlxccyo0LEVOQ1JZUFRFRC9pLnRlc3QodGV4dCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBvcGVuU1NIS2V5ID0gLy0tLS0tQkVHSU4gT1BFTlNTSCBQUklWQVRFIEtFWS0tLS0tKFtcXHNcXFNdKz8pLS0tLS1FTkQgT1BFTlNTSCBQUklWQVRFIEtFWS0tLS0tLy5leGVjKHRleHQpO1xuXHRpZiAoIW9wZW5TU0hLZXkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgZGF0YSA9IEJ1ZmZlci5mcm9tKG9wZW5TU0hLZXlbMV0ucmVwbGFjZSgvXFxzKy9nLCAnJyksICdiYXNlNjQnKTtcblx0Y29uc3QgbWFnaWMgPSBCdWZmZXIuZnJvbSgnb3BlbnNzaC1rZXktdjFcXDAnLCAndXRmOCcpO1xuXHRpZiAoZGF0YS5sZW5ndGggPCBtYWdpYy5sZW5ndGggfHwgIWRhdGEuc3ViYXJyYXkoMCwgbWFnaWMubGVuZ3RoKS5lcXVhbHMobWFnaWMpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGNpcGhlciA9IHJlYWRTU0hTdHJpbmcoZGF0YSwgbWFnaWMubGVuZ3RoKTtcblx0cmV0dXJuICEhY2lwaGVyICYmIGNpcGhlci52YWx1ZSAhPT0gJ25vbmUnO1xufVxuXG5mdW5jdGlvbiBzc2hFeGVjKGNsaWVudDogU1NIQ2xpZW50LCBjb21tYW5kOiBzdHJpbmcsIG9wdHM/OiB7IGlnbm9yZUV4aXRDb2RlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nOyBzdGRlcnI6IHN0cmluZzsgY29kZTogbnVtYmVyIH0+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmc7IHN0ZGVycjogc3RyaW5nOyBjb2RlOiBudW1iZXIgfT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNsaWVudC5leGVjKGNvbW1hbmQsIChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBzdHJlYW06IFNTSENoYW5uZWwpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHN0ZG91dCA9ICcnO1xuXHRcdFx0bGV0IHN0ZGVyciA9ICcnO1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgZmluaXNoID0gKGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCwgY29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29kZSAhPT0gMCAmJiAhb3B0cz8uaWdub3JlRXhpdENvZGUpIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGBTU0ggY29tbWFuZCBmYWlsZWQgKGV4aXQgJHtjb2RlfSk6ICR7Y29tbWFuZH1cXG5zdGRlcnI6ICR7c3RkZXJyfWApKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgc3Rkb3V0LCBzdGRlcnIsIGNvZGU6IGNvZGUgPz8gMCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0c3RyZWFtLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4geyBzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpOyB9KTtcblx0XHRcdHN0cmVhbS5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7IHN0ZGVyciArPSBkYXRhLnRvU3RyaW5nKCk7IH0pO1xuXHRcdFx0c3RyZWFtLm9uKCdlcnJvcicsIChzdHJlYW1FcnI6IEVycm9yKSA9PiBmaW5pc2goc3RyZWFtRXJyLCB1bmRlZmluZWQpKTtcblx0XHRcdHN0cmVhbS5vbignY2xvc2UnLCAoY29kZTogbnVtYmVyKSA9PiBmaW5pc2godW5kZWZpbmVkLCBjb2RlKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vKiogQ3JlYXRlIGEgYm91bmQgZXhlYyBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIFNTSCBjbGllbnQuICovXG5mdW5jdGlvbiBiaW5kU3NoRXhlYyhjbGllbnQ6IFNTSENsaWVudCk6IChjb21tYW5kOiBzdHJpbmcsIG9wdHM/OiB7IGlnbm9yZUV4aXRDb2RlPzogYm9vbGVhbiB9KSA9PiBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmc7IHN0ZGVycjogc3RyaW5nOyBjb2RlOiBudW1iZXIgfT4ge1xuXHRyZXR1cm4gKGNvbW1hbmQsIG9wdHMpID0+IHNzaEV4ZWMoY2xpZW50LCBjb21tYW5kLCBvcHRzKTtcbn1cblxuZnVuY3Rpb24gc3RhcnRSZW1vdGVBZ2VudEhvc3QoXG5cdGNsaWVudDogU1NIQ2xpZW50LFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0Y2xpQmluOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGNsaURhdGFEaXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0Y29tbWFuZE92ZXJyaWRlPzogc3RyaW5nLFxuKTogUHJvbWlzZTx7IHBvcnQ6IG51bWJlcjsgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkOyBzdHJlYW06IFNTSENoYW5uZWwgfT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGlmICghY29tbWFuZE92ZXJyaWRlICYmICghY2xpQmluIHx8ICFjbGlEYXRhRGlyKSkge1xuXHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBzdGFydFJlbW90ZUFnZW50SG9zdCByZXF1aXJlcyBlaXRoZXIgYSBjbGlCaW4rY2xpRGF0YURpciBwYWlyIG9yIGEgY29tbWFuZE92ZXJyaWRlYCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiYXNlQ21kID0gY29tbWFuZE92ZXJyaWRlID8/IGJ1aWxkQWdlbnRIb3N0QmFzZUNvbW1hbmQoY2xpQmluISwgY2xpRGF0YURpciEpO1xuXHRcdC8vIFdyYXAgaW4gYSBsb2dpbiBzaGVsbCBzbyB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzIGluaGVyaXRzIHRoZVxuXHRcdC8vIHVzZXIncyBQQVRIIGFuZCBlbnZpcm9ubWVudCBmcm9tIH4vLmJhc2hfcHJvZmlsZSAvIH4vLmJhc2hyY1xuXHRcdC8vIChzc2gyIGV4ZWMgcnVucyBhIG5vbi1pbnRlcmFjdGl2ZSBub24tbG9naW4gc2hlbGwgYnkgZGVmYXVsdCkuXG5cdFx0Ly8gRWNobyB0aGUgUElEIHNvIHdlIGNhbiByZWNvcmQgaXQgZm9yIHByb2Nlc3MgcmV1c2UgZGV0ZWN0aW9uLlxuXHRcdGNvbnN0IGNtZCA9IGBiYXNoIC1sIC1jICR7c2hlbGxFc2NhcGUoYGVjaG8gVlNDT0RFX1BJRD0kJCAmJiBleGVjICR7YmFzZUNtZH1gKX1gO1xuXHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTdGFydGluZyByZW1vdGUgYWdlbnQgaG9zdDogJHtjbWR9YCk7XG5cblx0XHRjbGllbnQuZXhlYyhjbWQsIChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBzdHJlYW06IFNTSENoYW5uZWwpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHRsZXQgb3V0cHV0QnVmID0gJyc7XG5cdFx0XHRsZXQgcGlkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGAke0xPR19QUkVGSVh9IFRpbWVkIG91dCB3YWl0aW5nIGZvciBhZ2VudCBob3N0IHRvIHN0YXJ0Llxcbm91dHB1dCBzbyBmYXI6ICR7cmVkYWN0VG9rZW4ob3V0cHV0QnVmKX1gKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDYwXzAwMCk7XG5cblx0XHRcdGNvbnN0IGNoZWNrRm9yT3V0cHV0ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjbGVhbiA9IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhvdXRwdXRCdWYpO1xuXHRcdFx0XHRpZiAocGlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBwaWRNYXRjaCA9IGNsZWFuLm1hdGNoKC9WU0NPREVfUElEPShcXGQrKS8pO1xuXHRcdFx0XHRcdGlmIChwaWRNYXRjaCkge1xuXHRcdFx0XHRcdFx0cGlkID0gcGFyc2VJbnQocGlkTWF0Y2hbMV0sIDEwKTtcblx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZW1vdGUgYWdlbnQgaG9zdCBQSUQ6ICR7cGlkfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IGV4dHJhY3RBZ2VudEhvc3RXZWJTb2NrZXRVUkwoY2xlYW4pO1xuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFJlbW90ZSBhZ2VudCBob3N0IGxpc3RlbmluZyBvbiBwb3J0ICR7bWF0Y2gucG9ydH1gKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoeyBwb3J0OiBtYXRjaC5wb3J0LCBjb25uZWN0aW9uVG9rZW46IG1hdGNoLnRva2VuLCBwaWQsIHN0cmVhbSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHN0cmVhbS5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0XHRcdG91dHB1dEJ1ZiArPSB0ZXh0O1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IHJlbW90ZSBzdGRlcnI6ICR7cmVkYWN0VG9rZW4odGV4dC50cmltRW5kKCkpfWApO1xuXHRcdFx0XHRjaGVja0Zvck91dHB1dCgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN0cmVhbS5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGRhdGEudG9TdHJpbmcoKTtcblx0XHRcdFx0b3V0cHV0QnVmICs9IHRleHQ7XG5cdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gcmVtb3RlIHN0ZG91dDogJHtyZWRhY3RUb2tlbih0ZXh0LnRyaW1FbmQoKSl9YCk7XG5cdFx0XHRcdGNoZWNrRm9yT3V0cHV0KCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3RyZWFtLm9uKCdlcnJvcicsIChzdHJlYW1FcnI6IEVycm9yKSA9PiB7XG5cdFx0XHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0XHRcdHJlamVjdChzdHJlYW1FcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0c3RyZWFtLm9uKCdjbG9zZScsIChjb2RlOiBudW1iZXIpID0+IHtcblx0XHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBBZ2VudCBob3N0IHByb2Nlc3MgZXhpdGVkIHdpdGggY29kZSAke2NvZGV9IGJlZm9yZSBiZWNvbWluZyByZWFkeS5cXG5vdXRwdXQ6ICR7cmVkYWN0VG9rZW4ob3V0cHV0QnVmKX1gKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBXZWJTb2NrZXQgY29ubmVjdGlvbiB0byB0aGUgcmVtb3RlIGFnZW50IGhvc3QgdmlhIGFuIFNTSCBmb3J3YXJkZWQgY2hhbm5lbC5cbiAqIFVzZXMgdGhlIGB3c2AgbGlicmFyeSB0byBzcGVhayBXZWJTb2NrZXQgb3ZlciB0aGUgU1NIIGNoYW5uZWwuXG4gKiBNZXNzYWdlcyBhcmUgcmVsYXllZCB0byB0aGUgcmVuZGVyZXIgdmlhIElQQyBldmVudHMuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVdlYlNvY2tldFJlbGF5KFxuXHRuYXRpdmVSZXF1aXJlOiBOb2RlSlMuUmVxdWlyZSxcblx0Y2xpZW50OiBTU0hDbGllbnQsXG5cdGRzdEhvc3Q6IHN0cmluZyxcblx0ZHN0UG9ydDogbnVtYmVyLFxuXHRjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdG9uTWVzc2FnZTogKGRhdGE6IHN0cmluZykgPT4gdm9pZCxcblx0b25DbG9zZTogKCkgPT4gdm9pZCxcbik6IFByb21pc2U8eyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9PiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y2xpZW50LmZvcndhcmRPdXQoJzEyNy4wLjAuMScsIDAsIGRzdEhvc3QsIGRzdFBvcnQsIChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBjaGFubmVsOiBTU0hDaGFubmVsKSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IFdTID0gbmF0aXZlUmVxdWlyZSgnd3MnKSBhcyB0eXBlb2YgV2ViU29ja2V0O1xuXHRcdFx0bGV0IHVybCA9IGB3czovLyR7ZHN0SG9zdH06JHtkc3RQb3J0fWA7XG5cdFx0XHRpZiAoY29ubmVjdGlvblRva2VuKSB7XG5cdFx0XHRcdHVybCArPSBgP3Rrbj0ke2VuY29kZVVSSUNvbXBvbmVudChjb25uZWN0aW9uVG9rZW4pfWA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBTU0ggY2hhbm5lbCBpcyBhIGR1cGxleCBzdHJlYW0gY29tcGF0aWJsZSB3aXRoIHdzJ3MgY3JlYXRlQ29ubmVjdGlvbixcblx0XHRcdC8vIGJ1dCBvdXIgbWluaW1hbCBTU0hDaGFubmVsIGludGVyZmFjZSBkb2Vzbid0IGNhcnJ5IHRoZSBmdWxsIE5vZGUgRHVwbGV4IHNoYXBlLlxuXHRcdFx0Y29uc3Qgd3MgPSBuZXcgV1ModXJsLCB7IGNyZWF0ZUNvbm5lY3Rpb246ICgoKSA9PiBjaGFubmVsKSBhcyB1bmtub3duIGFzIFdlYlNvY2tldC5DbGllbnRPcHRpb25zWydjcmVhdGVDb25uZWN0aW9uJ10gfSk7XG5cblx0XHRcdHdzLm9uKCdvcGVuJywgKCkgPT4ge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gV2ViU29ja2V0IHJlbGF5IGNvbm5lY3RlZCB0byByZW1vdGUgYWdlbnQgaG9zdGApO1xuXHRcdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0XHRzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAod3MucmVhZHlTdGF0ZSA9PT0gd3MuT1BFTikge1xuXHRcdFx0XHRcdFx0XHR3cy5zZW5kKGRhdGEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2xvc2U6ICgpID0+IHdzLmNsb3NlKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHdzLm9uKCdtZXNzYWdlJywgKGRhdGE6IFdlYlNvY2tldC5SYXdEYXRhKSA9PiB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0XHRcdFx0b25NZXNzYWdlKEJ1ZmZlci5jb25jYXQoZGF0YSkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdFx0b25NZXNzYWdlKEJ1ZmZlci5mcm9tKG5ldyBVaW50OEFycmF5KGRhdGEpKS50b1N0cmluZygpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvbk1lc3NhZ2UoZGF0YS50b1N0cmluZygpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHdzLm9uKCdjbG9zZScsIG9uQ2xvc2UpO1xuXG5cdFx0XHR3cy5vbignZXJyb3InLCAod3NFcnI6IHVua25vd24pID0+IHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IFdlYlNvY2tldCByZWxheSBlcnJvcjogJHt3c0VyciBpbnN0YW5jZW9mIEVycm9yID8gd3NFcnIubWVzc2FnZSA6IFN0cmluZyh3c0Vycil9YCk7XG5cdFx0XHRcdHJlamVjdCh3c0Vycik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplQ29uZmlnKGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyk6IElTU0hBZ2VudEhvc3RDb25maWdTYW5pdGl6ZWQge1xuXHRjb25zdCB7IHBhc3N3b3JkOiBfcCwgcHJpdmF0ZUtleVBhdGg6IF9rLCAuLi5zYW5pdGl6ZWQgfSA9IGNvbmZpZztcblx0cmV0dXJuIHNhbml0aXplZDtcbn1cblxuLyoqXG4gKiBTdGF0ZSBmb3IgYSBzaW5nbGUgYWN0aXZlIFNTSCByZWxheSBjb25uZWN0aW9uLlxuICogSW1tdXRhYmxlIGFuZCBkaXNwb3NlLW9uY2UgXHUyMDE0IGZvbGxvd3MgdGhlIHNhbWUgcGF0dGVybiBhcyBUdW5uZWxDb25uZWN0aW9uLlxuICogT24gcmVjb25uZWN0LCB0aGUgb2xkIFNTSENvbm5lY3Rpb24gaXMgZGlzcG9zZWQgYW5kIGEgZnJlc2ggb25lIGlzIGNyZWF0ZWQ7XG4gKiB0aGUgU1NIIGNsaWVudCBjYW4gYmUgZGV0YWNoZWQgZmlyc3Qgc28gb25seSB0aGUgV2ViU29ja2V0IHJlbGF5IGlzIHRvcm4gZG93bi5cbiAqL1xuY2xhc3MgU1NIQ29ubmVjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZSA9IHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7XG5cblx0cmVhZG9ubHkgY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnU2FuaXRpemVkO1xuXHRwcml2YXRlIF9jbG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3NoQ2xpZW50RGV0YWNoZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3NoQ2xvc2VMaXN0ZW5lciA9ICgpID0+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gU1NIIGNsaWVudCBjbG9zZWQgZm9yIGNvbm5lY3Rpb24gJHt0aGlzLmNvbm5lY3Rpb25JZH0gKGFkZHJlc3MgJHt0aGlzLmFkZHJlc3N9KTsgZGlzcG9zaW5nIGNvbm5lY3Rpb25gKTtcblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0fTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3NoRXJyb3JMaXN0ZW5lciA9IChlcnI/OiBFcnJvcikgPT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTU0ggY2xpZW50IGVycm9yIGZvciBjb25uZWN0aW9uICR7dGhpcy5jb25uZWN0aW9uSWR9IChhZGRyZXNzICR7dGhpcy5hZGRyZXNzfSk6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfTsgZGlzcG9zaW5nIGNvbm5lY3Rpb25gKTtcblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRmdWxsQ29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnLFxuXHRcdHJlYWRvbmx5IGNvbm5lY3Rpb25JZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGFkZHJlc3M6IHN0cmluZyxcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgcmVtb3RlUG9ydDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IHNzaENsaWVudDogU1NIQ2xpZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5OiB7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVtb3RlU3RyZWFtOiBTU0hDaGFubmVsIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jb25maWcgPSBzYW5pdGl6ZUNvbmZpZyhmdWxsQ29uZmlnKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGNsZWFudXAgZmlyc3Qgc28gaXQgZmlyZXMgX29uRGlkQ2xvc2UgKmJlZm9yZSogdGhlIEVtaXR0ZXIgaXMgZGlzcG9zZWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jbG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2xvc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3JlbGF5LmNsb3NlKCk7XG5cdFx0XHRpZiAoIXRoaXMuX3NzaENsaWVudERldGFjaGVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW90ZVN0cmVhbT8uY2xvc2UoKTtcblx0XHRcdFx0c3NoQ2xpZW50LmVuZCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDbG9zZS5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb25EaWRDbG9zZSk7XG5cblx0XHRzc2hDbGllbnQub24oJ2Nsb3NlJywgdGhpcy5fc3NoQ2xvc2VMaXN0ZW5lcik7XG5cdFx0c3NoQ2xpZW50Lm9uKCdlcnJvcicsIHRoaXMuX3NzaEVycm9yTGlzdGVuZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERldGFjaCB0aGUgU1NIIGNsaWVudCBmcm9tIHRoaXMgY29ubmVjdGlvbiBzbyB0aGF0IGBkaXNwb3NlKClgXG5cdCAqIG9ubHkgY2xvc2VzIHRoZSBXZWJTb2NrZXQgcmVsYXkgd2l0aG91dCBlbmRpbmcgdGhlIFNTSCBzZXNzaW9uLlxuXHQgKiBBbHNvIHJlbW92ZXMgZXZlbnQgbGlzdGVuZXJzIGZyb20gdGhlIFNTSCBjbGllbnQgc28gdGhlIG9sZFxuXHQgKiBjb25uZWN0aW9uIG9iamVjdCBpcyBub3QgcmV0YWluZWQgYnkgdGhlIHNoYXJlZCBjbGllbnQuXG5cdCAqL1xuXHRkZXRhY2hTc2hDbGllbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3NoQ2xpZW50RGV0YWNoZWQgPSB0cnVlO1xuXHRcdHRoaXMuc3NoQ2xpZW50LnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIHRoaXMuX3NzaENsb3NlTGlzdGVuZXIpO1xuXHRcdHRoaXMuc3NoQ2xpZW50LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIHRoaXMuX3NzaEVycm9yTGlzdGVuZXIpO1xuXHR9XG5cblx0cmVsYXlTZW5kKGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbGF5LnNlbmQoZGF0YSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25uZWN0aW9uczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2VDb25uZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZUNvbm5lY3Rpb246IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZENsb3NlQ29ubmVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTU0hDb25uZWN0UHJvZ3Jlc3M+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzczogRXZlbnQ8SVNTSENvbm5lY3RQcm9ncmVzcz4gPSB0aGlzLl9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbGF5TWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElSZWxheU1lc3NhZ2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbGF5TWVzc2FnZTogRXZlbnQ8SVJlbGF5TWVzc2FnZT4gPSB0aGlzLl9vbkRpZFJlbGF5TWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbGF5Q2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbGF5Q2xvc2U6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZFJlbGF5Q2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdEtleWJvYXJkSW50ZXJhY3RpdmU6IEV2ZW50PElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdD4gPSB0aGlzLl9vbkRpZFJlcXVlc3RLZXlib2FyZEludGVyYWN0aXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZTogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZS5ldmVudDtcblxuXHQvKipcblx0ICogUGVuZGluZyBrZXlib2FyZC1pbnRlcmFjdGl2ZSBwcm9tcHRzIGF3YWl0aW5nIGEgcmVzcG9uc2UgZnJvbSB0aGUgcmVuZGVyZXIuXG5cdCAqIEtleWVkIGJ5IGByZXF1ZXN0SWRgLiBFYWNoIGVudHJ5IGNhbiBlaXRoZXIgZmluaXNoIHRoZSBzc2gyIHByb21wdCB3aXRoXG5cdCAqIHJlc3BvbnNlcyBvciBjYW5jZWwgdGhlIG93bmluZyBjb25uZWN0IGF0dGVtcHQgd2hlbiB0aGUgdXNlciBkaXNtaXNzZXMgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nS2JpUmVxdWVzdHMgPSBuZXcgTWFwPHN0cmluZywgeyBmaW5pc2g6IChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiB2b2lkOyBjYW5jZWxDb25uZWN0OiAoKSA9PiB2b2lkIH0+KCk7XG5cdHByaXZhdGUgX2tiaVJlcXVlc3RDb3VudGVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgU1NIQ29ubmVjdGlvbj4oKSk7XG5cblx0cHJpdmF0ZSBfbmF0aXZlUmVxdWlyZTogTm9kZUpTLlJlcXVpcmUgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIE92ZXJyaWRlIGhvb2sgZm9yIHRlc3RzIHRvIHNob3J0ZW4gdGhlIHJlbGF5LWNyZWF0aW9uIHRpbWVvdXQgdXNlZCBvblxuXHQgKiB0aGUgYHJlcGxhY2VSZWxheWAgcmVjb25uZWN0IHBhdGguIFNlZSB7QGxpbmsgUkVDT05ORUNUX1JFTEFZX1RJTUVPVVRfTVN9LlxuXHQgKi9cblx0cHJvdGVjdGVkIHJlbGF5Q3JlYXRpb25UaW1lb3V0TXM6IG51bWJlciA9IFJFQ09OTkVDVF9SRUxBWV9USU1FT1VUX01TO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogTGF6aWx5IGxvYWQgYSBgcmVxdWlyZWAgZnVuY3Rpb24gZm9yIG5hdGl2ZSBtb2R1bGVzIChgc3NoMmAsIGB3c2ApLlxuXHQgKiBVc2VzIGEgZHluYW1pYyBgaW1wb3J0KCdub2RlOm1vZHVsZScpYCBzbyB0aGUgbW9kdWxlIGlzIG9ubHkgcmVzb2x2ZWRcblx0ICogd2hlbiBhY3R1YWxseSBuZWVkZWQgYXQgcnVudGltZSBcdTIwMTQgbm90IGF0IGZpbGUtbG9hZCB0aW1lLiBUaGlzIG1hdHRlcnNcblx0ICogYmVjYXVzZSB0ZXN0cyBvdmVycmlkZSB0aGUgbWV0aG9kcyB0aGF0IGNhbGwgdGhpcyBhbmQgbmV2ZXIgdHJpZ2dlclxuXHQgKiB0aGUgaW1wb3J0LCBhdm9pZGluZyBpc3N1ZXMgd2l0aCBFbGVjdHJvbidzIEVTTSBsb2FkZXIgd2hpY2ggY2Fubm90XG5cdCAqIHJlc29sdmUgYG5vZGU6YCBzcGVjaWZpZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0TmF0aXZlUmVxdWlyZSgpOiBQcm9taXNlPE5vZGVKUy5SZXF1aXJlPiB7XG5cdFx0aWYgKCF0aGlzLl9uYXRpdmVSZXF1aXJlKSB7XG5cdFx0XHRjb25zdCBub2RlTW9kdWxlID0gYXdhaXQgaW1wb3J0KCdub2RlOm1vZHVsZScpO1xuXHRcdFx0dGhpcy5fbmF0aXZlUmVxdWlyZSA9IG5vZGVNb2R1bGUuY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmF0aXZlUmVxdWlyZTtcblx0fVxuXG5cdGFzeW5jIGNvbm5lY3QoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnLCByZXBsYWNlUmVsYXk/OiBib29sZWFuKTogUHJvbWlzZTxJU1NIQ29ubmVjdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25LZXkgPSBjb25maWcuc3NoQ29uZmlnSG9zdFxuXHRcdFx0PyBgc3NoOiR7Y29uZmlnLnNzaENvbmZpZ0hvc3R9YFxuXHRcdFx0OiBgJHtjb25maWcudXNlcm5hbWV9QCR7Y29uZmlnLmhvc3R9OiR7Y29uZmlnLnBvcnQgPz8gMjJ9YDtcblxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25LZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0aWYgKHJlcGxhY2VSZWxheSkge1xuXHRcdFx0XHQvLyBUZWFyIGRvd24gdGhlIG9sZCByZWxheSBhbmQgY3JlYXRlIGEgZnJlc2ggb25lLCBmb2xsb3dpbmdcblx0XHRcdFx0Ly8gdGhlIHNhbWUgZGlzcG9zZS1hbmQtcmVjcmVhdGUgcGF0dGVybiBhcyBUdW5uZWxBZ2VudEhvc3RNYWluU2VydmljZS5cblx0XHRcdFx0Ly8gVGhlIFNTSCBjbGllbnQgaXMgZGV0YWNoZWQgc28gb25seSB0aGUgV2ViU29ja2V0IHJlbGF5IGlzIGNsb3NlZC5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFJlY29ubmVjdGluZyByZWxheSBmb3IgZXhpc3RpbmcgU1NIIHR1bm5lbCAke2Nvbm5lY3Rpb25LZXl9YCk7XG5cdFx0XHRcdGNvbnN0IHsgc3NoQ2xpZW50LCByZW1vdGVQb3J0LCBjb25uZWN0aW9uVG9rZW4gfSA9IGV4aXN0aW5nO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSBmcm9tIG1hcCBhbmQgZGV0YWNoIFNTSCBjbGllbnQgYmVmb3JlIGRpc3Bvc2luZyBzb1xuXHRcdFx0XHQvLyB0aGUgb2xkIHJlbGF5J3MgY2xvc2UgaGFuZGxlciAoY29ubj8uZGlzcG9zZSgpKSBpcyBhIG5vLW9wLlxuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGVBbmRMZWFrKGNvbm5lY3Rpb25LZXkpO1xuXHRcdFx0XHRleGlzdGluZy5kZXRhY2hTc2hDbGllbnQoKTtcblx0XHRcdFx0ZXhpc3RpbmcuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdC8vIENyZWF0ZSBmcmVzaCByZWxheSBhbmQgY29ubmVjdGlvbi4gSWYgcmVsYXkgY3JlYXRpb24gZmFpbHMsXG5cdFx0XHRcdC8vIGNsZWFuIHVwIHRoZSBkZXRhY2hlZCBTU0ggY2xpZW50IHNvIGl0IGRvZXNuJ3QgbGVhay5cblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbklkID0gY29ubmVjdGlvbktleTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRsZXQgY29ubjogU1NIQ29ubmVjdGlvbiB8IHVuZGVmaW5lZDsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBwcmVmZXItY29uc3Rcblx0XHRcdFx0XHQvLyBCb3VuZCB0aGUgcmVsYXkgY3JlYXRpb246IGEgc2lsZW50bHkgZGVhZCBTU0ggY2xpZW50XG5cdFx0XHRcdFx0Ly8gKFRDUCBoYWxmLW9wZW4sIHNzaDIga2VlcGFsaXZlIGhhc24ndCBmaXJlZCB5ZXQpIGNhblxuXHRcdFx0XHRcdC8vIGxlYXZlIGZvcndhcmRPdXQncyBjYWxsYmFjayB1bmZpcmVkLCBoYW5naW5nIHRoZSB3aG9sZVxuXHRcdFx0XHRcdC8vIHByb21pc2UgY2hhaW4uIHJhY2VUaW1lb3V0IHJldHVybnMgdW5kZWZpbmVkIG9uIHRpbWVvdXQuXG5cdFx0XHRcdFx0Y29uc3QgdGltZW91dE1zID0gdGhpcy5yZWxheUNyZWF0aW9uVGltZW91dE1zO1xuXHRcdFx0XHRcdGNvbnN0IHJlbGF5ID0gYXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRcdFx0XHR0aGlzLl9jcmVhdGVXZWJTb2NrZXRSZWxheShcblx0XHRcdFx0XHRcdFx0c3NoQ2xpZW50LCAnMTI3LjAuMC4xJywgcmVtb3RlUG9ydCwgY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdFx0XHQoZGF0YTogc3RyaW5nKSA9PiB0aGlzLl9vbkRpZFJlbGF5TWVzc2FnZS5maXJlKHsgY29ubmVjdGlvbklkLCBkYXRhIH0pLFxuXHRcdFx0XHRcdFx0XHQoKSA9PiB7IGNvbm4/LmRpc3Bvc2UoKTsgfSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHR0aW1lb3V0TXMsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRpZiAoIXJlbGF5KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNTSCByZWxheSBjcmVhdGlvbiB0aW1lZCBvdXQgYWZ0ZXIgJHt0aW1lb3V0TXN9bXMgKFNTSCBjbGllbnQgYXBwZWFycyB1bnJlc3BvbnNpdmUpYCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29ubiA9IG5ldyBTU0hDb25uZWN0aW9uKFxuXHRcdFx0XHRcdFx0Y29uZmlnLCBjb25uZWN0aW9uSWQsIGNvbm5lY3Rpb25LZXksIGNvbmZpZy5uYW1lLFxuXHRcdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuLCByZW1vdGVQb3J0LCBzc2hDbGllbnQsIHJlbGF5LCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRFdmVudC5vbmNlKGNvbm4ub25EaWRDbG9zZSkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uS2V5KSA9PT0gY29ubikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGNvbm5lY3Rpb25LZXkpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlbGF5Q2xvc2UuZmlyZShjb25uZWN0aW9uSWQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENsb3NlQ29ubmVjdGlvbi5maXJlKGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuc2V0KGNvbm5lY3Rpb25LZXksIGNvbm4pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbm5lY3Rpb25JZDogY29ubi5jb25uZWN0aW9uSWQsXG5cdFx0XHRcdFx0XHRhZGRyZXNzOiBjb25uLmFkZHJlc3MsXG5cdFx0XHRcdFx0XHRuYW1lOiBjb25uLm5hbWUsXG5cdFx0XHRcdFx0XHRjb25uZWN0aW9uVG9rZW46IGNvbm4uY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdFx0Y29uZmlnOiBjb25uLmNvbmZpZyxcblx0XHRcdFx0XHRcdHNzaENvbmZpZ0hvc3Q6IGNvbmZpZy5zc2hDb25maWdIb3N0LFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHNzaENsaWVudC5lbmQoKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlbGF5Q2xvc2UuZmlyZShjb25uZWN0aW9uSWQpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29ubmVjdGlvbklkOiBleGlzdGluZy5jb25uZWN0aW9uSWQsXG5cdFx0XHRcdGFkZHJlc3M6IGV4aXN0aW5nLmFkZHJlc3MsXG5cdFx0XHRcdG5hbWU6IGV4aXN0aW5nLm5hbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogZXhpc3RpbmcuY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRjb25maWc6IGV4aXN0aW5nLmNvbmZpZyxcblx0XHRcdFx0c3NoQ29uZmlnSG9zdDogY29uZmlnLnNzaENvbmZpZ0hvc3QsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSAke3JlcGxhY2VSZWxheSA/ICdSZWNvbm5lY3RpbmcnIDogJ0Nvbm5lY3RpbmcnfSB0byAke2Nvbm5lY3Rpb25LZXl9YCk7XG5cdFx0bGV0IHNzaENsaWVudDogU1NIQ2xpZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcG9ydFByb2dyZXNzID0gKG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcy5maXJlKHsgY29ubmVjdGlvbktleSwgbWVzc2FnZSB9KTtcblx0XHRcdH07XG5cblx0XHRcdC8vIDEuIEVzdGFibGlzaCBTU0ggY29ubmVjdGlvblxuXHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzQ29ubmVjdGluZycsIFwiRXN0YWJsaXNoaW5nIFNTSCBjb25uZWN0aW9uLi4uXCIpKTtcblx0XHRcdHNzaENsaWVudCA9IGF3YWl0IHRoaXMuX2Nvbm5lY3RTU0goY29uZmlnLCBjb25uZWN0aW9uS2V5KTtcblxuXHRcdFx0bGV0IGNsaUJpbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGNsaVJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHQvLyBSZXNvbHZlIHRoZSByZW1vdGUgQ0xJIGxhemlseTogcGxhdGZvcm0gZGV0ZWN0aW9uIGFuZCBDTElcblx0XHRcdC8vIGluc3RhbGwvcmVmcmVzaCBvbmx5IHJ1biB3aGVuIHdlJ3JlIGFjdHVhbGx5IGFib3V0IHRvIHNwYXduXG5cdFx0XHQvLyBhbiBhZ2VudCBob3N0LiBSZWNvbm5lY3RzIHRoYXQgcmV1c2UgYSBsaXZlIEFIIHZpYSB0aGVcblx0XHRcdC8vIGxvY2tmaWxlIHNraXAgdGhpcyB3b3JrIGVudGlyZWx5LCBzaW5jZSB0aGUgcnVubmluZyBBSCB3YXNcblx0XHRcdC8vIHNwYXduZWQgZnJvbSB3aGF0ZXZlciBDTEkgd2FzIGN1cnJlbnQgYXQgdGhlIHRpbWUuXG5cdFx0XHRjb25zdCBlbnN1cmVDbGlSZXNvbHZlZCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdFx0aWYgKGNsaVJlc29sdmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNsaVJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGNvbmZpZy5yZW1vdGVBZ2VudEhvc3RDb21tYW5kKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFVzaW5nIGN1c3RvbSBhZ2VudCBob3N0IGNvbW1hbmQ6ICR7Y29uZmlnLnJlbW90ZUFnZW50SG9zdENvbW1hbmR9YCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHsgc3Rkb3V0OiB1bmFtZVMgfSA9IGF3YWl0IHNzaEV4ZWMoc3NoQ2xpZW50ISwgJ3VuYW1lIC1zJyk7XG5cdFx0XHRcdGNvbnN0IHsgc3Rkb3V0OiB1bmFtZU0gfSA9IGF3YWl0IHNzaEV4ZWMoc3NoQ2xpZW50ISwgJ3VuYW1lIC1tJyk7XG5cdFx0XHRcdGNvbnN0IHBsYXRmb3JtID0gcmVzb2x2ZVJlbW90ZVBsYXRmb3JtKHVuYW1lUywgdW5hbWVNKTtcblx0XHRcdFx0aWYgKCFwbGF0Zm9ybSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBVbnN1cHBvcnRlZCByZW1vdGUgcGxhdGZvcm06ICR7dW5hbWVTLnRyaW0oKX0gJHt1bmFtZU0udHJpbSgpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZW1vdGUgcGxhdGZvcm06ICR7cGxhdGZvcm0ub3N9LSR7cGxhdGZvcm0uYXJjaH1gKTtcblx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzSW5zdGFsbGluZ0NMSScsIFwiQ2hlY2tpbmcgcmVtb3RlIENMSSBpbnN0YWxsYXRpb24uLi5cIikpO1xuXHRcdFx0XHRjbGlCaW4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDTElJbnN0YWxsZWQoc3NoQ2xpZW50ISwgcGxhdGZvcm0sIHJlcG9ydFByb2dyZXNzKTtcblx0XHRcdH07XG5cblx0XHRcdC8vIDIuIENoZWNrIGZvciBhbiBhbHJlYWR5LXJ1bm5pbmcgYWdlbnQgaG9zdCBvbiB0aGUgcmVtb3RlIGZpcnN0LlxuXHRcdFx0Ly8gICAgVGhpcyBwcmV2ZW50cyBhY2N1bXVsYXRpbmcgb3JwaGFuZWQgcHJvY2Vzc2VzIHdoZW4gdGhlIFNTSFxuXHRcdFx0Ly8gICAgY29ubmVjdGlvbiBkcm9wcyBhbmQgd2UgcmVjb25uZWN0IFx1MjAxNCBhbmQgYXZvaWRzIHBheWluZyBmb3Jcblx0XHRcdC8vICAgIHBsYXRmb3JtIGRldGVjdGlvbiArIENMSSBpbnN0YWxsIG9uIGV2ZXJ5IHJlY29ubmVjdC5cblx0XHRcdGxldCByZW1vdGVIb3N0OiBzdHJpbmcgPSAnMTI3LjAuMC4xJztcblx0XHRcdGxldCByZW1vdGVQb3J0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgYWdlbnRTdHJlYW06IFNTSENoYW5uZWwgfCB1bmRlZmluZWQ7XG5cblx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdzc2hQcm9ncmVzc0NoZWNraW5nQWdlbnQnLCBcIkNoZWNraW5nIGZvciBleGlzdGluZyBhZ2VudCBob3N0Li4uXCIpKTtcblx0XHRcdGNvbnN0IGV4ZWMgPSBiaW5kU3NoRXhlYyhzc2hDbGllbnQpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdBSCA9IGF3YWl0IGZpbmRSdW5uaW5nQWdlbnRIb3N0KGV4ZWMsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5KTtcblx0XHRcdGlmIChleGlzdGluZ0FILmtpbmQgPT09ICdjb21wYXRpYmxlJykge1xuXHRcdFx0XHRyZW1vdGVIb3N0ID0gZXhpc3RpbmdBSC5ob3N0O1xuXHRcdFx0XHRyZW1vdGVQb3J0ID0gZXhpc3RpbmdBSC5wb3J0O1xuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW4gPSBleGlzdGluZ0FILmNvbm5lY3Rpb25Ub2tlbjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlbW90ZVBvcnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyAzLiBOZWVkIHRvIHNwYXduIGZyZXNoOiByZXNvbHZlIHRoZSBDTEkgbm93LlxuXHRcdFx0XHRhd2FpdCBlbnN1cmVDbGlSZXNvbHZlZCgpO1xuXG5cdFx0XHRcdC8vIDQuIFN0YXJ0IGFnZW50LWhvc3QgYW5kIGNhcHR1cmUgcG9ydC90b2tlblxuXHRcdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnc3NoUHJvZ3Jlc3NTdGFydGluZ0FnZW50JywgXCJTdGFydGluZyByZW1vdGUgYWdlbnQgaG9zdC4uLlwiKSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3N0YXJ0UmVtb3RlQWdlbnRIb3N0KHNzaENsaWVudCwgY2xpQmluLCBnZXRSZW1vdGVDTElEYXRhRGlyKHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lKSwgY29uZmlnLnJlbW90ZUFnZW50SG9zdENvbW1hbmQpO1xuXHRcdFx0XHRyZW1vdGVQb3J0ID0gcmVzdWx0LnBvcnQ7XG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbiA9IHJlc3VsdC5jb25uZWN0aW9uVG9rZW47XG5cdFx0XHRcdGFnZW50U3RyZWFtID0gcmVzdWx0LnN0cmVhbTtcblxuXHRcdFx0XHQvLyBSZWNvcmQgc3RhdGUgZm9yIGZ1dHVyZSByZXVzZVxuXHRcdFx0XHRhd2FpdCB3cml0ZUFnZW50SG9zdFN0YXRlKGV4ZWMsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5LCByZXN1bHQucGlkLCByZW1vdGVQb3J0LCBjb25uZWN0aW9uVG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyA2LiBDb25uZWN0IHRvIHJlbW90ZSBhZ2VudCBob3N0IHZpYSBXZWJTb2NrZXQgcmVsYXkgKG5vIGxvY2FsIFRDUCBwb3J0KVxuXHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzRm9yd2FyZGluZycsIFwiQ29ubmVjdGluZyB0byByZW1vdGUgYWdlbnQgaG9zdC4uLlwiKSk7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uSWQgPSBjb25uZWN0aW9uS2V5O1xuXHRcdFx0bGV0IGNvbm46IFNTSENvbm5lY3Rpb24gfCB1bmRlZmluZWQ7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgcHJlZmVyLWNvbnN0XG5cdFx0XHRsZXQgcmVsYXk6IHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlbGF5ID0gYXdhaXQgdGhpcy5fY3JlYXRlV2ViU29ja2V0UmVsYXkoXG5cdFx0XHRcdFx0c3NoQ2xpZW50LCByZW1vdGVIb3N0LCByZW1vdGVQb3J0LCBjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdFx0KGRhdGE6IHN0cmluZykgPT4gdGhpcy5fb25EaWRSZWxheU1lc3NhZ2UuZmlyZSh7IGNvbm5lY3Rpb25JZCwgZGF0YSB9KSxcblx0XHRcdFx0XHQoKSA9PiB7IGNvbm4/LmRpc3Bvc2UoKTsgfSxcblx0XHRcdFx0KTtcblx0XHRcdH0gY2F0Y2ggKHJlbGF5RXJyKSB7XG5cdFx0XHRcdGlmIChleGlzdGluZ0FILmtpbmQgIT09ICdjb21wYXRpYmxlJykge1xuXHRcdFx0XHRcdHRocm93IHJlbGF5RXJyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFRoZSByZXVzZWQgYWdlbnQgaG9zdCBpcyBub3QgY29ubmVjdGFibGUgXHUyMDE0IGtpbGwgaXQgYW5kIHN0YXJ0IGZyZXNoLlxuXHRcdFx0XHQvLyBSZXNvbHZlIHRoZSBDTEkgbm93ICh3ZSBza2lwcGVkIGl0IG9uIHRoZSByZXVzZSBwYXRoKS5cblx0XHRcdFx0Y29uc3QgcmVsYXlFcnJvck1lc3NhZ2UgPSByZWxheUVyciBpbnN0YW5jZW9mIEVycm9yID8gcmVsYXlFcnIubWVzc2FnZSA6IFN0cmluZyhyZWxheUVycik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBGYWlsZWQgdG8gY29ubmVjdCB0byByZXVzZWQgYWdlbnQgaG9zdCBvbiAke3JlbW90ZUhvc3R9OiR7cmVtb3RlUG9ydH06ICR7cmVsYXlFcnJvck1lc3NhZ2V9LiBTdGFydGluZyBmcmVzaGApO1xuXHRcdFx0XHRhd2FpdCBjbGVhbnVwUmVtb3RlQWdlbnRIb3N0KGV4ZWMsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5KTtcblx0XHRcdFx0YXdhaXQgZW5zdXJlQ2xpUmVzb2x2ZWQoKTtcblxuXHRcdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnc3NoUHJvZ3Jlc3NTdGFydGluZ0FnZW50JywgXCJTdGFydGluZyByZW1vdGUgYWdlbnQgaG9zdC4uLlwiKSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3N0YXJ0UmVtb3RlQWdlbnRIb3N0KHNzaENsaWVudCwgY2xpQmluLCBnZXRSZW1vdGVDTElEYXRhRGlyKHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lKSwgY29uZmlnLnJlbW90ZUFnZW50SG9zdENvbW1hbmQpO1xuXHRcdFx0XHRyZW1vdGVIb3N0ID0gJzEyNy4wLjAuMSc7XG5cdFx0XHRcdHJlbW90ZVBvcnQgPSByZXN1bHQucG9ydDtcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuID0gcmVzdWx0LmNvbm5lY3Rpb25Ub2tlbjtcblx0XHRcdFx0YWdlbnRTdHJlYW0gPSByZXN1bHQuc3RyZWFtO1xuXHRcdFx0XHRhd2FpdCB3cml0ZUFnZW50SG9zdFN0YXRlKGV4ZWMsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5LCByZXN1bHQucGlkLCByZW1vdGVQb3J0LCBjb25uZWN0aW9uVG9rZW4pO1xuXG5cdFx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdzc2hQcm9ncmVzc0ZvcndhcmRpbmcnLCBcIkNvbm5lY3RpbmcgdG8gcmVtb3RlIGFnZW50IGhvc3QuLi5cIikpO1xuXHRcdFx0XHRyZWxheSA9IGF3YWl0IHRoaXMuX2NyZWF0ZVdlYlNvY2tldFJlbGF5KFxuXHRcdFx0XHRcdHNzaENsaWVudCwgcmVtb3RlSG9zdCwgcmVtb3RlUG9ydCwgY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdChkYXRhOiBzdHJpbmcpID0+IHRoaXMuX29uRGlkUmVsYXlNZXNzYWdlLmZpcmUoeyBjb25uZWN0aW9uSWQsIGRhdGEgfSksXG5cdFx0XHRcdFx0KCkgPT4geyBjb25uPy5kaXNwb3NlKCk7IH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIDcuIENyZWF0ZSBjb25uZWN0aW9uIG9iamVjdFxuXHRcdFx0Y29uc3QgYWRkcmVzcyA9IGNvbm5lY3Rpb25LZXk7XG5cdFx0XHRjb25uID0gbmV3IFNTSENvbm5lY3Rpb24oXG5cdFx0XHRcdGNvbmZpZyxcblx0XHRcdFx0Y29ubmVjdGlvbklkLFxuXHRcdFx0XHRhZGRyZXNzLFxuXHRcdFx0XHRjb25maWcubmFtZSxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRyZW1vdGVQb3J0LFxuXHRcdFx0XHRzc2hDbGllbnQsXG5cdFx0XHRcdHJlbGF5LFxuXHRcdFx0XHRhZ2VudFN0cmVhbSxcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHRcdCk7XG5cblx0XHRcdEV2ZW50Lm9uY2UoY29ubi5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbktleSkgPT09IGNvbm4pIHtcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGNvbm5lY3Rpb25LZXkpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVsYXlDbG9zZS5maXJlKGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDbG9zZUNvbm5lY3Rpb24uZmlyZShjb25uZWN0aW9uSWQpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuc2V0KGNvbm5lY3Rpb25LZXksIGNvbm4pO1xuXHRcdFx0c3NoQ2xpZW50ID0gdW5kZWZpbmVkOyAvLyBvd25lcnNoaXAgdHJhbnNmZXJyZWQgdG8gU1NIQ29ubmVjdGlvblxuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29ubmVjdGlvbklkLFxuXHRcdFx0XHRhZGRyZXNzLFxuXHRcdFx0XHRuYW1lOiBjb25maWcubmFtZSxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRjb25maWc6IGNvbm4uY29uZmlnLFxuXHRcdFx0XHRzc2hDb25maWdIb3N0OiBjb25maWcuc3NoQ29uZmlnSG9zdCxcblx0XHRcdH07XG5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHNzaENsaWVudD8uZW5kKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGlzY29ubmVjdChob3N0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGNvbm5dIG9mIHRoaXMuX2Nvbm5lY3Rpb25zKSB7XG5cdFx0XHRpZiAoa2V5ID09PSBob3N0IHx8IGNvbm4uY29ubmVjdGlvbklkID09PSBob3N0KSB7XG5cdFx0XHRcdGNvbm4uZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVsYXlTZW5kKGNvbm5lY3Rpb25JZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGNvbm4gb2YgdGhpcy5fY29ubmVjdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChjb25uLmNvbm5lY3Rpb25JZCA9PT0gY29ubmVjdGlvbklkKSB7XG5cdFx0XHRcdGNvbm4ucmVsYXlTZW5kKG1lc3NhZ2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVjb25uZWN0KHNzaENvbmZpZ0hvc3Q6IHN0cmluZywgbmFtZTogc3RyaW5nLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kPzogc3RyaW5nLCBhZ2VudEZvcndhcmQ/OiBib29sZWFuKTogUHJvbWlzZTxJU1NIQ29ubmVjdFJlc3VsdD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZWNvbm5lY3RpbmcgdmlhIFNTSCBjb25maWcgaG9zdDogJHtzc2hDb25maWdIb3N0fWApO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5yZXNvbHZlU1NIQ29uZmlnKHNzaENvbmZpZ0hvc3QpO1xuXG5cdFx0Ly8gQWx3YXlzIHVzZSBBZ2VudCBhdXRoIFx1MjAxNCB0aGUgYXV0aCBoYW5kbGVyIHdpbGwgd2FsayB0aHJvdWdoIHRoZSBTU0hcblx0XHQvLyBhZ2VudCBhbmQgYW55IGRlZmF1bHQgaWRlbnRpdGllcy4gSWYgdGhlIHVzZXIgcGlubmVkIGEgbm9uLWRlZmF1bHRcblx0XHQvLyBgSWRlbnRpdHlGaWxlYCBpbiB0aGVpciBzc2ggY29uZmlnLCBzdXJmYWNlIGl0IGFzIHRoZSBleHBsaWNpdCBrZXlcblx0XHQvLyBzbyBpdCBnZXRzIHRyaWVkIGZpcnN0LlxuXHRcdGxldCBwcml2YXRlS2V5UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXNvbHZlZC5pZGVudGl0eUZpbGUubGVuZ3RoID4gMCAmJiAhU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX2lzRGVmYXVsdEtleVBhdGgocmVzb2x2ZWQuaWRlbnRpdHlGaWxlWzBdKSkge1xuXHRcdFx0cHJpdmF0ZUtleVBhdGggPSByZXNvbHZlZC5pZGVudGl0eUZpbGVbMF07XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSByZWNvbm5lY3Q6IGlkZW50aXR5RmlsZXM9JHtKU09OLnN0cmluZ2lmeShyZXNvbHZlZC5pZGVudGl0eUZpbGUpfSwgZXhwbGljaXQga2V5PSR7cHJpdmF0ZUtleVBhdGggPz8gJyhub25lKSd9YCk7XG5cblx0XHRyZXR1cm4gdGhpcy5jb25uZWN0KHtcblx0XHRcdGhvc3Q6IHJlc29sdmVkLmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogcmVzb2x2ZWQucG9ydCAhPT0gMjIgPyByZXNvbHZlZC5wb3J0IDogdW5kZWZpbmVkLFxuXHRcdFx0dXNlcm5hbWU6IHJlc29sdmVkLnVzZXIgPz8gc3NoQ29uZmlnSG9zdCxcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0XHRwcml2YXRlS2V5UGF0aCxcblx0XHRcdGlkZW50aXR5QWdlbnQ6IHJlc29sdmVkLmlkZW50aXR5QWdlbnQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0c3NoQ29uZmlnSG9zdCxcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQsXG5cdFx0XHRhZ2VudEZvcndhcmQ6IGFnZW50Rm9yd2FyZCAmJiByZXNvbHZlZC5mb3J3YXJkQWdlbnQgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdH0sIC8qIHJlcGxhY2VSZWxheSAqLyB0cnVlKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RTU0hDb25maWdIb3N0cygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGpvaW4ob3MuaG9tZWRpcigpLCAnLnNzaCcsICdjb25maWcnKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZzcC5yZWFkRmlsZShjb25maWdQYXRoLCAndXRmLTgnKTtcblx0XHRcdHJldHVybiB0aGlzLl9wYXJzZVNTSENvbmZpZ0hvc3RzKGNvbnRlbnQsIGRpcm5hbWUoY29uZmlnUGF0aCkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IENvdWxkIG5vdCByZWFkIFNTSCBjb25maWcgYXQgJHtjb25maWdQYXRofWApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGVuc3VyZVVzZXJTU0hDb25maWcoKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBzc2hEaXIgPSBqb2luKG9zLmhvbWVkaXIoKSwgJy5zc2gnKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gam9pbihzc2hEaXIsICdjb25maWcnKTtcblx0XHRjb25zdCBpc1Bvc2l4ID0gcHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJztcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnNwLm1rZGlyKHNzaERpciwgeyByZWN1cnNpdmU6IHRydWUsIG1vZGU6IGlzUG9zaXggPyAwbzcwMCA6IHVuZGVmaW5lZCB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBGYWlsZWQgdG8gZW5zdXJlIH4vLnNzaCBkaXJlY3Rvcnk6ICR7ZXJyfWApO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnNwLmFjY2Vzcyhjb25maWdQYXRoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IGZzcC5vcGVuKGNvbmZpZ1BhdGgsICdhJywgaXNQb3NpeCA/IDBvNjAwIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0YXdhaXQgaGFuZGxlLmNsb3NlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBjcmVhdGUgJHtjb25maWdQYXRofTogJHtlcnJ9YCk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFVSSS5maWxlKGNvbmZpZ1BhdGgpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFNTSENvbmZpZ0ZpbGVzKCk6IFByb21pc2U8VVJJW10+IHtcblx0XHRjb25zdCBpc1dpbmRvd3MgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInO1xuXHRcdGNvbnN0IHVzZXJDb25maWdQYXRoID0gam9pbihvcy5ob21lZGlyKCksICcuc3NoJywgJ2NvbmZpZycpO1xuXHRcdGNvbnN0IHN5c3RlbUNvbmZpZ1BhdGggPSBpc1dpbmRvd3Ncblx0XHRcdD8gam9pbihwcm9jZXNzLmVudlsnUHJvZ3JhbURhdGEnXSA/PyAnQzpcXFxcUHJvZ3JhbURhdGEnLCAnc3NoJywgJ3NzaF9jb25maWcnKVxuXHRcdFx0OiAnL2V0Yy9zc2gvc3NoX2NvbmZpZyc7XG5cblx0XHRjb25zdCByZXN1bHQ6IFVSSVtdID0gW1VSSS5maWxlKHVzZXJDb25maWdQYXRoKV07XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZzcC5hY2Nlc3Moc3lzdGVtQ29uZmlnUGF0aCk7XG5cdFx0XHRyZXN1bHQucHVzaChVUkkuZmlsZShzeXN0ZW1Db25maWdQYXRoKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBzeXN0ZW0gY29uZmlnIGZpbGUgZG9lcyBub3QgZXhpc3QgXHUyMDE0IHNraXBcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVTU0hDb25maWcoaG9zdDogc3RyaW5nKTogUHJvbWlzZTxJU1NIUmVzb2x2ZWRDb25maWc+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVNTSFJlc29sdmVkQ29uZmlnPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjcC5leGVjRmlsZSgnc3NoJywgWyctRycsIGhvc3RdLCB7IHRpbWVvdXQ6IDUwMDAgfSwgKGVyciwgc3Rkb3V0KSA9PiB7XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGAke0xPR19QUkVGSVh9IHNzaCAtRyBmYWlsZWQgZm9yICR7aG9zdH06ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9wYXJzZVNTSEdPdXRwdXQoc3Rkb3V0KTtcblx0XHRcdFx0cmVzb2x2ZShjb25maWcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wYXJzZVNTSENvbmZpZ0hvc3RzKGNvbnRlbnQ6IHN0cmluZywgY29uZmlnRGlyOiBzdHJpbmcsIHZpc2l0ZWQ/OiBTZXQ8c3RyaW5nPik6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBzZWVuID0gdmlzaXRlZCA/PyBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBob3N0czogc3RyaW5nW10gPSBbXTtcblxuXHRcdC8vIEV4dHJhY3QgaG9zdHMgZnJvbSB0aGlzIGZpbGUgZGlyZWN0bHlcblx0XHRob3N0cy5wdXNoKC4uLnBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoY29udGVudCkpO1xuXG5cdFx0Ly8gRm9sbG93IEluY2x1ZGUgZGlyZWN0aXZlc1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBjb250ZW50LnNwbGl0KCdcXG4nKSkge1xuXHRcdFx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpO1xuXHRcdFx0aWYgKCF0cmltbWVkIHx8IHRyaW1tZWQuc3RhcnRzV2l0aCgnIycpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5jbHVkZU1hdGNoID0gdHJpbW1lZC5tYXRjaCgvXkluY2x1ZGVcXHMrKC4rKSQvaSk7XG5cdFx0XHRpZiAoIWluY2x1ZGVNYXRjaCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmF3VmFsdWUgPSBzdHJpcFNTSENvbW1lbnQoaW5jbHVkZU1hdGNoWzFdKTtcblx0XHRcdGNvbnN0IHBhdHRlcm5zID0gcmF3VmFsdWUuc3BsaXQoL1xccysvKS5maWx0ZXIoQm9vbGVhbik7XG5cblx0XHRcdGZvciAoY29uc3QgcmF3UGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHRcdFx0XHRjb25zdCBwYXR0ZXJuID0gcmF3UGF0dGVybi5yZXBsYWNlKC9efi8sIG9zLmhvbWVkaXIoKSk7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkUGF0dGVybiA9IGlzQWJzb2x1dGUocGF0dGVybikgPyBwYXR0ZXJuIDogam9pbihjb25maWdEaXIsIHBhdHRlcm4pO1xuXG5cdFx0XHRcdGlmIChzZWVuLmhhcyhyZXNvbHZlZFBhdHRlcm4pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2Vlbi5hZGQocmVzb2x2ZWRQYXR0ZXJuKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBmc3Auc3RhdChyZXNvbHZlZFBhdHRlcm4pO1xuXHRcdFx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgZnNwLnJlYWRkaXIocmVzb2x2ZWRQYXR0ZXJuKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHN1YiA9IGF3YWl0IGZzcC5yZWFkRmlsZShqb2luKHJlc29sdmVkUGF0dGVybiwgZmlsZSksICd1dGYtOCcpO1xuXHRcdFx0XHRcdFx0XHRcdGhvc3RzLnB1c2goLi4uYXdhaXQgdGhpcy5fcGFyc2VTU0hDb25maWdIb3N0cyhzdWIsIHJlc29sdmVkUGF0dGVybiwgc2VlbikpO1xuXHRcdFx0XHRcdFx0XHR9IGNhdGNoIHsgLyogc2tpcCB1bnJlYWRhYmxlIGZpbGVzICovIH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3ViID0gYXdhaXQgZnNwLnJlYWRGaWxlKHJlc29sdmVkUGF0dGVybiwgJ3V0Zi04Jyk7XG5cdFx0XHRcdFx0XHRob3N0cy5wdXNoKC4uLmF3YWl0IHRoaXMuX3BhcnNlU1NIQ29uZmlnSG9zdHMoc3ViLCBkaXJuYW1lKHJlc29sdmVkUGF0dGVybiksIHNlZW4pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdGNvbnN0IGRpciA9IGRpcm5hbWUocmVzb2x2ZWRQYXR0ZXJuKTtcblx0XHRcdFx0XHRjb25zdCBiYXNlID0gYmFzZW5hbWUocmVzb2x2ZWRQYXR0ZXJuKTtcblx0XHRcdFx0XHRpZiAoYmFzZS5pbmNsdWRlcygnKicpKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IGZzcC5yZWFkZGlyKGRpcik7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cCgnXicgKyBiYXNlLnJlcGxhY2UoL1xcKi9nLCAnLionKSArICckJyk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHJlZ2V4LnRlc3QoZmlsZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHN1YiA9IGF3YWl0IGZzcC5yZWFkRmlsZShqb2luKGRpciwgZmlsZSksICd1dGYtOCcpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRob3N0cy5wdXNoKC4uLmF3YWl0IHRoaXMuX3BhcnNlU1NIQ29uZmlnSG9zdHMoc3ViLCBkaXIsIHNlZW4pKTtcblx0XHRcdFx0XHRcdFx0XHRcdH0gY2F0Y2ggeyAvKiBza2lwICovIH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gY2F0Y2ggeyAvKiBza2lwIHVucmVhZGFibGUgZGlycyAqLyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBob3N0cztcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlU1NIR091dHB1dChzdGRvdXQ6IHN0cmluZyk6IElTU0hSZXNvbHZlZENvbmZpZyB7XG5cdFx0cmV0dXJuIHBhcnNlU1NIR091dHB1dChzdGRvdXQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9jb25uZWN0U1NIKFxuXHRcdGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyxcblx0XHRjb25uZWN0aW9uS2V5Pzogc3RyaW5nLFxuXHQpOiBQcm9taXNlPFNTSENsaWVudD4ge1xuXHRcdGNvbnN0IGNvbm5lY3RDb25maWc6IENvbm5lY3RDb25maWcgPSB7XG5cdFx0XHRob3N0OiBjb25maWcuaG9zdCxcblx0XHRcdHBvcnQ6IGNvbmZpZy5wb3J0ID8/IDIyLFxuXHRcdFx0dXNlcm5hbWU6IGNvbmZpZy51c2VybmFtZSxcblx0XHRcdHJlYWR5VGltZW91dDogMzBfMDAwLFxuXHRcdFx0a2VlcGFsaXZlSW50ZXJ2YWw6IDE1XzAwMCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCB0aGlzLl9idWlsZEF1dGhBdHRlbXB0cyhjb25maWcpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBCdWlsdCAke2F0dGVtcHRzLmxlbmd0aH0gYXV0aCBhdHRlbXB0KHMpOiAke2F0dGVtcHRzLm1hcChhID0+IGRlc2NyaWJlQXV0aEF0dGVtcHQoYSkpLmpvaW4oJywgJyl9YCk7XG5cdFx0Y29uc3QgZGlzcGxheUhvc3QgPSBjb25maWcuc3NoQ29uZmlnSG9zdCA/PyBgJHtjb25maWcudXNlcm5hbWV9QCR7Y29uZmlnLmhvc3R9YDtcblx0XHQvLyBUcmFjayByZXF1ZXN0SWRzIHdlIGNyZWF0ZWQgZHVyaW5nIHRoaXMgY29ubmVjdCBzbyB3ZSBjYW4gZmlyZVxuXHRcdC8vIG9uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZSBmb3IgYW55IHN0aWxsLXBlbmRpbmcgcHJvbXB0cyB3aGVuXG5cdFx0Ly8gdGhlIGNvbm5lY3QgYXR0ZW1wdCBmYWlscyBvciBjb21wbGV0ZXMuXG5cdFx0Y29uc3QgbGl2ZUtiaVJlcXVlc3RzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bGV0IGNhbmNlbENvbm5lY3RGcm9tS2JpOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qga2JpSGFuZGxlcjogU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVByb21wdEhhbmRsZXIgfCB1bmRlZmluZWQgPSBhdHRlbXB0cy5zb21lKGEgPT4gYS50eXBlID09PSAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnKVxuXHRcdFx0PyAobmFtZSwgaW5zdHJ1Y3Rpb25zLCBwcm9tcHRzLCBmaW5pc2gpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdElkID0gdGhpcy5faGFuZGxlS2V5Ym9hcmRJbnRlcmFjdGl2ZShjb25uZWN0aW9uS2V5ID8/IGRpc3BsYXlIb3N0LCBkaXNwbGF5SG9zdCwgY29uZmlnLnVzZXJuYW1lLCBuYW1lLCBpbnN0cnVjdGlvbnMsIHByb21wdHMsIGZpbmlzaCwgKCkgPT4gY2FuY2VsQ29ubmVjdEZyb21LYmk/LigpKTtcblx0XHRcdFx0bGl2ZUtiaVJlcXVlc3RzLmFkZChyZXF1ZXN0SWQpO1xuXHRcdFx0fVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qga2V5UGFzc3BocmFzZUhhbmRsZXI6IFNTSEtleVBhc3NwaHJhc2VQcm9tcHRIYW5kbGVyIHwgdW5kZWZpbmVkID0gYXR0ZW1wdHMuc29tZShhID0+IGEudHlwZSA9PT0gJ3B1YmxpY2tleScgJiYgYS5lbmNyeXB0ZWQpXG5cdFx0XHQ/IChrZXlQYXRoLCBmaW5pc2gpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdElkID0gdGhpcy5faGFuZGxlS2V5Ym9hcmRJbnRlcmFjdGl2ZShcblx0XHRcdFx0XHRjb25uZWN0aW9uS2V5ID8/IGRpc3BsYXlIb3N0LFxuXHRcdFx0XHRcdGRpc3BsYXlIb3N0LFxuXHRcdFx0XHRcdGNvbmZpZy51c2VybmFtZSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnc3NoS2V5UGFzc3BocmFzZU5hbWUnLCBcIlNTSCBLZXkgUGFzc3BocmFzZVwiKSxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRbeyBwcm9tcHQ6IGxvY2FsaXplKCdzc2hLZXlQYXNzcGhyYXNlUHJvbXB0JywgXCJFbnRlciBwYXNzcGhyYXNlIGZvciBTU0gga2V5IHswfS5cIiwga2V5UGF0aCksIGVjaG86IGZhbHNlIH1dLFxuXHRcdFx0XHRcdHJlc3BvbnNlcyA9PiBmaW5pc2gocmVzcG9uc2VzWzBdKSxcblx0XHRcdFx0XHQoKSA9PiBjYW5jZWxDb25uZWN0RnJvbUtiaT8uKCksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGxpdmVLYmlSZXF1ZXN0cy5hZGQocmVxdWVzdElkKTtcblx0XHRcdH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdC8vIENhc3Q6IHRoZSBzc2gyIEB0eXBlcyBkb24ndCBtb2RlbCBgZmFsc2VgIChnaXZlLXVwKSBmb3IgdGhlXG5cdFx0Ly8gY2FsbGJhY2sgbm9yIGBudWxsYCBmb3IgdGhlIGZpcnN0IGludm9jYXRpb24ncyBgbWV0aG9kc0xlZnRgLFxuXHRcdC8vIGV2ZW4gdGhvdWdoIHRoZSBydW50aW1lIHN1cHBvcnRzIGJvdGggcGVyIHRoZSBzc2gyIGRvY3MuXG5cdFx0Y29ubmVjdENvbmZpZy5hdXRoSGFuZGxlciA9IG1ha2VBdXRoSGFuZGxlcihhdHRlbXB0cywgdGhpcy5fbG9nU2VydmljZSwga2JpSGFuZGxlciwga2V5UGFzc3BocmFzZUhhbmRsZXIpIGFzIHVua25vd24gYXMgQ29ubmVjdENvbmZpZ1snYXV0aEhhbmRsZXInXTtcblxuXHRcdGNvbnN0IGNhbmNlbExpdmVLYmlSZXF1ZXN0cyA9ICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVxdWVzdElkIG9mIGxpdmVLYmlSZXF1ZXN0cykge1xuXHRcdFx0XHQvLyBQdWxsIHRoZSBwZW5kaW5nIGZpbmlzaCBjYWxsYmFjayAoaWYgYW55KSBhbmQgaW52b2tlIGl0IHdpdGhcblx0XHRcdFx0Ly8gZW1wdHkgcmVzcG9uc2VzIHNvIHNzaDIgc3RvcHMgd2FpdGluZyBvbiB0aGlzIGF0dGVtcHQgXHUyMDE0IHdpdGhvdXRcblx0XHRcdFx0Ly8gdGhpcywgc3NoMiBoYW5ncyB1bnRpbCBgcmVhZHlUaW1lb3V0YCBlbGFwc2VzIHdoZW4gYSBjb25uZWN0XG5cdFx0XHRcdC8vIGF0dGVtcHQgaXMgYWJvcnRlZCBtaWQtcHJvbXB0LiBUaGUgcmVuZGVyZXIgYWxzbyBnZXRzIG5vdGlmaWVkXG5cdFx0XHRcdC8vIHNvIGl0IGNhbiBkaXNtaXNzIGFueSBvcGVuIHF1aWNrLWlucHV0IFVJLlxuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0tiaVJlcXVlc3RzLmdldChyZXF1ZXN0SWQpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nS2JpUmVxdWVzdHMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZS5maXJlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdHBlbmRpbmc/LmZpbmlzaChbXSk7XG5cdFx0XHR9XG5cdFx0XHRsaXZlS2JpUmVxdWVzdHMuY2xlYXIoKTtcblx0XHR9O1xuXG5cdFx0aWYgKGNvbmZpZy5hZ2VudEZvcndhcmQpIHtcblx0XHRcdGNvbnN0IGFnZW50U29jayA9IHRoaXMuX2dldEFnZW50U29ja2V0KGNvbmZpZyk7XG5cdFx0XHRpZiAoYWdlbnRTb2NrKSB7XG5cdFx0XHRcdC8vIHNzaDIgbmVlZHMgYGNvbm5lY3RDb25maWcuYWdlbnRgIHNldCBzbyBpdCBrbm93cyB3aGljaCBsb2NhbFxuXHRcdFx0XHQvLyBhZ2VudCBzb2NrZXQgdG8gZm9yd2FyZCB0by4gV2l0aG91dCBpdCwgYWdlbnQgZm9yd2FyZGluZyBpcyBhXG5cdFx0XHRcdC8vIG5vLW9wIGV2ZW4gaWYgYGFnZW50Rm9yd2FyZDogdHJ1ZWAgaXMgc2V0LlxuXHRcdFx0XHRjb25uZWN0Q29uZmlnLmFnZW50ID0gYWdlbnRTb2NrO1xuXHRcdFx0XHRjb25uZWN0Q29uZmlnLmFnZW50Rm9yd2FyZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTU0ggYWdlbnQgZm9yd2FyZGluZyBlbmFibGVkYCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gU1NIIGFnZW50IGZvcndhcmRpbmcgcmVxdWVzdGVkLCBidXQgbm8gU1NIIGFnZW50IGVuZHBvaW50IGlzIGF2YWlsYWJsZTsgYWdlbnQgZm9yd2FyZGluZyBkaXNhYmxlZGApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2NyZWF0ZVNTSENsaWVudCgpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxTU0hDbGllbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHJlc29sdmVDb25uZWN0ID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNTSCBjb25uZWN0aW9uIGVzdGFibGlzaGVkIHRvICR7Y29uZmlnLmhvc3R9YCk7XG5cdFx0XHRcdGNhbmNlbExpdmVLYmlSZXF1ZXN0cygpO1xuXHRcdFx0XHRyZXNvbHZlKGNsaWVudCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWplY3RDb25uZWN0ID0gKGVycjogRXJyb3IsIGVuZENsaWVudDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdFx0Y2FuY2VsTGl2ZUtiaVJlcXVlc3RzKCk7XG5cdFx0XHRcdGlmIChlbmRDbGllbnQpIHtcblx0XHRcdFx0XHRjbGllbnQuZW5kKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9O1xuXG5cdFx0XHRjYW5jZWxDb25uZWN0RnJvbUtiaSA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNTSCBrZXlib2FyZC1pbnRlcmFjdGl2ZSBwcm9tcHQgY2FuY2VsbGVkIGJ5IHVzZXIgZm9yICR7ZGlzcGxheUhvc3R9YCk7XG5cdFx0XHRcdHJlamVjdENvbm5lY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCksIHRydWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y2xpZW50Lm9uKCdyZWFkeScsICgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZUNvbm5lY3QoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjbGllbnQub24oJ2Vycm9yJywgKGVycjogRXJyb3IpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtMT0dfUFJFRklYfSBTU0ggY29ubmVjdGlvbiBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcblx0XHRcdFx0cmVqZWN0Q29ubmVjdChlcnIsIGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjbGllbnQuY29ubmVjdChjb25uZWN0Q29uZmlnKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfY3JlYXRlU1NIQ2xpZW50KCk6IFByb21pc2U8U1NIQ2xpZW50PiB7XG5cdFx0Y29uc3QgbmF0aXZlUmVxdWlyZSA9IGF3YWl0IHRoaXMuX2dldE5hdGl2ZVJlcXVpcmUoKTtcblx0XHRjb25zdCBzc2gyTW9kdWxlID0gbmF0aXZlUmVxdWlyZSgnc3NoMicpIGFzIHsgQ2xpZW50OiBuZXcgKCkgPT4gdW5rbm93biB9O1xuXHRcdHJldHVybiBuZXcgc3NoMk1vZHVsZS5DbGllbnQoKSBhcyBTU0hDbGllbnQ7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIG9yZGVyZWQgbGlzdCBvZiBhdXRoZW50aWNhdGlvbiBhdHRlbXB0cyB0byBmZWVkIHRvIHNzaDInc1xuXHQgKiBgYXV0aEhhbmRsZXJgLiBJbiBgQWdlbnRgIG1vZGUgd2UgdHJ5IHRoZSBjb25maWd1cmVkIGFnZW50IGZpcnN0IChzbyBhXG5cdCAqIGxvYWRlZCBpZGVudGl0eSBzaG9ydC1jaXJjdWl0cyBiZWZvcmUgd2UgZXZlciB0b3VjaCBhbiBlbmNyeXB0ZWQga2V5XG5cdCAqIGZpbGUpLCB0aGVuIGFueSBub24tZGVmYXVsdCBleHBsaWNpdCBgSWRlbnRpdHlGaWxlYCwgdGhlbiBlYWNoIHJlYWRhYmxlXG5cdCAqIGRlZmF1bHQgaWRlbnRpdHkgaW4gdHVybi4gQSBob3N0IHRoYXQgYWNjZXB0cyBgfi8uc3NoL2lkX3JzYWAgc3RpbGxcblx0ICogd29ya3MgZXZlbiBpZiB0aGUgYWdlbnQgZG9lc24ndCBoYXZlIGl0IGxvYWRlZCBcdTIwMTQgd2l0aG91dCBuZWVkaW5nIGFuXG5cdCAqIGV4cGxpY2l0IGBJZGVudGl0eUZpbGVgIGVudHJ5IGluIGB+Ly5zc2gvY29uZmlnYC5cblx0ICovXG5cdHByb3RlY3RlZCBhc3luYyBfYnVpbGRBdXRoQXR0ZW1wdHMoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKTogUHJvbWlzZTxTU0hBdXRoQXR0ZW1wdFtdPiB7XG5cdFx0Y29uc3QgYXR0ZW1wdHM6IFNTSEF1dGhBdHRlbXB0W10gPSBbXTtcblx0XHRjb25zdCB1c2VybmFtZSA9IGNvbmZpZy51c2VybmFtZTtcblxuXHRcdHN3aXRjaCAoY29uZmlnLmF1dGhNZXRob2QpIHtcblx0XHRcdGNhc2UgU1NIQXV0aE1ldGhvZC5BZ2VudDoge1xuXHRcdFx0XHQvLyBUcnkgdGhlIGFnZW50IGZpcnN0OiBpZiBpdCBoYXMgYW55IG9mIHRoZSBjb25maWd1cmVkIGlkZW50aXRpZXNcblx0XHRcdFx0Ly8gbG9hZGVkLCBhdXRoIHN1Y2NlZWRzIHdpdGhvdXQgZXZlciB0b3VjaGluZyBvbi1kaXNrIGtleXMuIFRoaXNcblx0XHRcdFx0Ly8gbWF0Y2hlcyBPcGVuU1NIJ3MgSWRlbnRpdHlBZ2VudCBzZW1hbnRpY3MgYW5kIGF2b2lkcyBhblxuXHRcdFx0XHQvLyB1bm5lY2Vzc2FyeSBwYXNzcGhyYXNlIHByb21wdCB3aGVuIGFuIGVuY3J5cHRlZCBrZXkgZmlsZSBpc1xuXHRcdFx0XHQvLyBjb25maWd1cmVkIGJ1dCB0aGUgYWdlbnQgYWxyZWFkeSBob2xkcyBpdHMgdW5sb2NrZWQgY29weS5cblx0XHRcdFx0Y29uc3QgYWdlbnRTb2NrID0gdGhpcy5fZ2V0QWdlbnRTb2NrZXQoY29uZmlnKTtcblx0XHRcdFx0aWYgKGFnZW50U29jaykge1xuXHRcdFx0XHRcdGF0dGVtcHRzLnB1c2goeyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZSwgYWdlbnQ6IGFnZW50U29jayB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBleHBsaWNpdEtleVBhdGggPSBjb25maWcucHJpdmF0ZUtleVBhdGg7XG5cdFx0XHRcdGNvbnN0IGV4cGxpY2l0SXNEZWZhdWx0ID0gZXhwbGljaXRLZXlQYXRoICE9PSB1bmRlZmluZWQgJiYgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX2lzRGVmYXVsdEtleVBhdGgoZXhwbGljaXRLZXlQYXRoKTtcblx0XHRcdFx0aWYgKGV4cGxpY2l0S2V5UGF0aCAmJiAhZXhwbGljaXRJc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRjb25zdCBleHBsaWNpdCA9IGF3YWl0IHRoaXMuX3JlYWRLZXlGaWxlSWZFeGlzdHMoZXhwbGljaXRLZXlQYXRoKTtcblx0XHRcdFx0XHRpZiAoZXhwbGljaXQpIHtcblx0XHRcdFx0XHRcdGF0dGVtcHRzLnB1c2goeyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWUsIGtleTogZXhwbGljaXQsIGtleVBhdGg6IGV4cGxpY2l0S2V5UGF0aCwgLi4uKGlzRW5jcnlwdGVkUHJpdmF0ZUtleShleHBsaWNpdCkgPyB7IGVuY3J5cHRlZDogdHJ1ZSB9IDogdW5kZWZpbmVkKSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBrZXlQYXRoIG9mIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLl9kZWZhdWx0S2V5UGF0aHMpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX3JlYWRLZXlGaWxlSWZFeGlzdHMoa2V5UGF0aCk7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnRzKSB7XG5cdFx0XHRcdFx0XHRhdHRlbXB0cy5wdXNoKHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lLCBrZXk6IGNvbnRlbnRzLCBrZXlQYXRoLCAuLi4oaXNFbmNyeXB0ZWRQcml2YXRlS2V5KGNvbnRlbnRzKSA/IHsgZW5jcnlwdGVkOiB0cnVlIH0gOiB1bmRlZmluZWQpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBGaW5hbCBmYWxsYmFjazoga2V5Ym9hcmQtaW50ZXJhY3RpdmUgKHR5cGljYWxseSBhIHBhc3N3b3JkIHByb21wdCkuXG5cdFx0XHRcdC8vIE9ubHkgbWVhbmluZ2Z1bCBpZiB0aGUgc2VydmVyIGFkdmVydGlzZXMgaXQ7IHRoZSBhdXRoIGhhbmRsZXJcblx0XHRcdFx0Ly8gd2lsbCBza2lwIGl0IG90aGVyd2lzZS4gVGhlIHByb21wdCBpcyBmb3J3YXJkZWQgdG8gdGhlIHJlbmRlcmVyXG5cdFx0XHRcdC8vIHZpYSB7QGxpbmsgb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZX0uXG5cdFx0XHRcdGF0dGVtcHRzLnB1c2goeyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFNTSEF1dGhNZXRob2QuS2V5RmlsZToge1xuXHRcdFx0XHQvLyBLZXlGaWxlIG1vZGUgaGFzIG5vIGZhbGxiYWNrcyBcdTIwMTQgZmFpbCBmYXN0IHdpdGggYSBjbGVhciBlcnJvciBpZlxuXHRcdFx0XHQvLyB0aGUga2V5IGlzIG1pc3Npbmcgb3IgdW5yZWFkYWJsZSwgcmF0aGVyIHRoYW4gbGV0dGluZyBpdCBzdXJmYWNlXG5cdFx0XHRcdC8vIGRvd25zdHJlYW0gYXMgYSBnZW5lcmljIGF1dGggZmFpbHVyZS5cblx0XHRcdFx0aWYgKCFjb25maWcucHJpdmF0ZUtleVBhdGgpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3NzaC5rZXlGaWxlQXV0aFJlcXVpcmVzUGF0aCcsIFwiS2V5IGZpbGUgYXV0aGVudGljYXRpb24gcmVxdWlyZXMgYSBwcml2YXRlIGtleSBwYXRoLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXhwbGljaXQgPSBhd2FpdCB0aGlzLl9yZWFkS2V5RmlsZUlmRXhpc3RzKGNvbmZpZy5wcml2YXRlS2V5UGF0aCk7XG5cdFx0XHRcdGlmICghZXhwbGljaXQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3NzaC5mYWlsZWRUb1JlYWRQcml2YXRlS2V5JywgXCJGYWlsZWQgdG8gcmVhZCBwcml2YXRlIGtleSBmaWxlOiB7MH1cIiwgY29uZmlnLnByaXZhdGVLZXlQYXRoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXR0ZW1wdHMucHVzaCh7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZSwga2V5OiBleHBsaWNpdCwga2V5UGF0aDogY29uZmlnLnByaXZhdGVLZXlQYXRoLCAuLi4oaXNFbmNyeXB0ZWRQcml2YXRlS2V5KGV4cGxpY2l0KSA/IHsgZW5jcnlwdGVkOiB0cnVlIH0gOiB1bmRlZmluZWQpIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgU1NIQXV0aE1ldGhvZC5QYXNzd29yZDoge1xuXHRcdFx0XHRpZiAoY29uZmlnLnBhc3N3b3JkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRhdHRlbXB0cy5wdXNoKHsgdHlwZTogJ3Bhc3N3b3JkJywgdXNlcm5hbWUsIHBhc3N3b3JkOiBjb25maWcucGFzc3dvcmQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF0dGVtcHRzO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2RlZmF1bHRLZXlQYXRocyA9IFtcblx0XHQnfi8uc3NoL2lkX2VkMjU1MTknLFxuXHRcdCd+Ly5zc2gvaWRfcnNhJyxcblx0XHQnfi8uc3NoL2lkX2VjZHNhJyxcblx0XHQnfi8uc3NoL2lkX2RzYScsXG5cdFx0J34vLnNzaC9pZF94bXNzJyxcblx0XTtcblxuXHQvKipcblx0ICogRXhwYW5kIGEgbGVhZGluZyBgfmAgdG8gdGhlIGN1cnJlbnQgdXNlcidzIGhvbWUgZGlyZWN0b3J5IHNvIHRoYXQgcGF0aHNcblx0ICogY29taW5nIGJhY2sgZnJvbSBgc3NoIC1HYCAoYWx3YXlzIGFic29sdXRlKSBjb21wYXJlIGVxdWFsIHRvIG91clxuXHQgKiBgfmAtcHJlZml4ZWQgZGVmYXVsdHMuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBfbm9ybWFsaXplS2V5UGF0aChrZXlQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBrZXlQYXRoLnJlcGxhY2UoL15+Lywgb3MuaG9tZWRpcigpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc0RlZmF1bHRLZXlQYXRoKGtleVBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZS5fbm9ybWFsaXplS2V5UGF0aChrZXlQYXRoKTtcblx0XHRyZXR1cm4gU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX2RlZmF1bHRLZXlQYXRocy5zb21lKHAgPT4gU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX25vcm1hbGl6ZUtleVBhdGgocCkgPT09IG5vcm1hbGl6ZWQpO1xuXHR9XG5cblx0LyoqIFRlc3Qgc2VhbTogcmV0dXJucyB0aGUgU1NIIGFnZW50IHNvY2tldCBwYXRoLCBvciB1bmRlZmluZWQgd2hlbiBubyBhZ2VudCBpcyBhdmFpbGFibGUuICovXG5cdHByb3RlY3RlZCBfaXNBZ2VudEF2YWlsYWJsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwcm9jZXNzLmVudlsnU1NIX0FVVEhfU09DSyddO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBZ2VudFNvY2tldChjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChjb25maWcuaWRlbnRpdHlBZ2VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUlkZW50aXR5QWdlbnQoY29uZmlnLmlkZW50aXR5QWdlbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faXNBZ2VudEF2YWlsYWJsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUlkZW50aXR5QWdlbnQoaWRlbnRpdHlBZ2VudDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0cmltbWVkID0gaWRlbnRpdHlBZ2VudC50cmltKCk7XG5cdFx0aWYgKCF0cmltbWVkIHx8IHRyaW1tZWQudG9Mb3dlckNhc2UoKSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodHJpbW1lZCA9PT0gJ1NTSF9BVVRIX1NPQ0snKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faXNBZ2VudEF2YWlsYWJsZSgpO1xuXHRcdH1cblx0XHRpZiAodHJpbW1lZC5zdGFydHNXaXRoKCckJykpIHtcblx0XHRcdGNvbnN0IGVudk1hdGNoID0gL15cXCRcXHsoPzxicmFjZWQ+W0EtWmEtel9dW0EtWmEtejAtOV9dKilcXH0kfF5cXCQoPzxwbGFpbj5bQS1aYS16X11bQS1aYS16MC05X10qKSQvLmV4ZWModHJpbW1lZCk7XG5cdFx0XHRyZXR1cm4gZW52TWF0Y2g/Lmdyb3VwcyA/IHByb2Nlc3MuZW52W2Vudk1hdGNoLmdyb3Vwcy5icmFjZWQgPz8gZW52TWF0Y2guZ3JvdXBzLnBsYWluXSB8fCB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0cmltbWVkLnJlcGxhY2UoL15+Lywgb3MuaG9tZWRpcigpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkIGEga2V5Ym9hcmQtaW50ZXJhY3RpdmUgY2hhbGxlbmdlIGZyb20gc3NoMiB0byB0aGUgcmVuZGVyZXIgYW5kXG5cdCAqIHJlZ2lzdGVyIHRoZSBgZmluaXNoYCBjYWxsYmFjayBzbyB7QGxpbmsgcmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmV9IGNhblxuXHQgKiBzdXBwbHkgdGhlIHVzZXIncyByZXNwb25zZXMgd2hlbiB0aGV5IGFycml2ZS4gUmV0dXJucyB0aGUgZ2VuZXJhdGVkXG5cdCAqIGByZXF1ZXN0SWRgIHNvIHRoZSBjYWxsZXIgY2FuIHRyYWNrIGluLWZsaWdodCBwcm9tcHRzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9oYW5kbGVLZXlib2FyZEludGVyYWN0aXZlKFxuXHRcdGNvbm5lY3Rpb25LZXk6IHN0cmluZyxcblx0XHRkaXNwbGF5SG9zdDogc3RyaW5nLFxuXHRcdHVzZXJuYW1lOiBzdHJpbmcsXG5cdFx0bmFtZTogc3RyaW5nLFxuXHRcdGluc3RydWN0aW9uczogc3RyaW5nLFxuXHRcdHByb21wdHM6IHJlYWRvbmx5IElTU0hLZXlib2FyZEludGVyYWN0aXZlUHJvbXB0W10sXG5cdFx0ZmluaXNoOiAocmVzcG9uc2VzOiByZWFkb25seSBzdHJpbmdbXSkgPT4gdm9pZCxcblx0XHRjYW5jZWxDb25uZWN0OiAoKSA9PiB2b2lkLFxuXHQpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGBrYmktJHsrK3RoaXMuX2tiaVJlcXVlc3RDb3VudGVyfWA7XG5cdFx0Ly8gV3JhcCBmaW5pc2ggc28gaXQgY2FuIG9ubHkgZmlyZSBvbmNlIFx1MjAxNCBzc2gyIGlnbm9yZXMgZHVwbGljYXRlIGNhbGxzLFxuXHRcdC8vIGJ1dCB3ZSBhbHNvIHdhbnQgdG8gZW5zdXJlIHdlIGRyb3AgdGhlIHBlbmRpbmcgZW50cnkgZXhhY3RseSBvbmNlLlxuXHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZmluaXNoT25jZSA9IChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiB7XG5cdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3BlbmRpbmdLYmlSZXF1ZXN0cy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdGZpbmlzaChyZXNwb25zZXMpO1xuXHRcdH07XG5cdFx0dGhpcy5fcGVuZGluZ0tiaVJlcXVlc3RzLnNldChyZXF1ZXN0SWQsIHsgZmluaXNoOiBmaW5pc2hPbmNlLCBjYW5jZWxDb25uZWN0IH0pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBrZXlib2FyZC1pbnRlcmFjdGl2ZSBjaGFsbGVuZ2UgZnJvbSAke2Rpc3BsYXlIb3N0fTogJHtwcm9tcHRzLmxlbmd0aH0gcHJvbXB0KHMpYCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZS5maXJlKHtcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdGNvbm5lY3Rpb25LZXksXG5cdFx0XHRkaXNwbGF5SG9zdCxcblx0XHRcdHVzZXJuYW1lLFxuXHRcdFx0bmFtZSxcblx0XHRcdGluc3RydWN0aW9ucyxcblx0XHRcdHByb21wdHM6IHByb21wdHMubWFwKHAgPT4gKHsgcHJvbXB0OiBwLnByb21wdCwgZWNobzogcC5lY2hvIH0pKSxcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVxdWVzdElkO1xuXHR9XG5cblx0YXN5bmMgcmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdElkOiBzdHJpbmcsIHJlc3BvbnNlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0tiaVJlcXVlc3RzLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IHJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlOiBubyBwZW5kaW5nIHJlcXVlc3QgZm9yICR7cmVxdWVzdElkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocmVzcG9uc2VzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHBlbmRpbmcuY2FuY2VsQ29ubmVjdCgpO1xuXHRcdFx0cGVuZGluZy5maW5pc2goW10pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRwZW5kaW5nLmZpbmlzaChyZXNwb25zZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3Qgc2VhbTogcmVhZCBhIHByaXZhdGUga2V5IGZpbGUgZnJvbSBkaXNrLiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZVxuXHQgKiBmaWxlIGRvZXNuJ3QgZXhpc3Q7IGxvZ3MgYW5kIHJldHVybnMgYHVuZGVmaW5lZGAgZm9yIGFueSBvdGhlciByZWFkIGVycm9yXG5cdCAqIHNvIGEgc2luZ2xlIGJyb2tlbiBrZXkgZG9lc24ndCBhYm9ydCB0aGUgd2hvbGUgYXV0aCBmbG93LlxuXHQgKi9cblx0cHJvdGVjdGVkIGFzeW5jIF9yZWFkS2V5RmlsZUlmRXhpc3RzKGtleVBhdGg6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBrZXlQYXRoLnJlcGxhY2UoL15+Lywgb3MuaG9tZWRpcigpKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGZzcC5yZWFkRmlsZShyZXNvbHZlZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IGVycm9yQ29kZSA9IChlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGU7XG5cdFx0XHRpZiAoZXJyb3JDb2RlID09PSAnRU5PRU5UJyB8fCBlcnJvckNvZGUgPT09ICdFTk9URElSJykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byByZWFkIFNTSCBrZXkgZmlsZSAke3Jlc29sdmVkfWAsIGVycm9yKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX3F1YWxpdHkoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSB8fCAnaW5zaWRlcic7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfc2VydmVyRGF0YUZvbGRlck5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZHVjdFNlcnZpY2Uuc2VydmVyRGF0YUZvbGRlck5hbWUgPz8gJy52c2NvZGUtc2VydmVyLW9zcyc7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfY29tbWl0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdDtcblx0fVxuXG5cdHByb3RlY3RlZCBfc3RhcnRSZW1vdGVBZ2VudEhvc3QoXG5cdFx0Y2xpZW50OiBTU0hDbGllbnQsIGNsaUJpbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBjbGlEYXRhRGlyOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbW1hbmRPdmVycmlkZT86IHN0cmluZyxcblx0KTogUHJvbWlzZTx7IHBvcnQ6IG51bWJlcjsgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkOyBzdHJlYW06IFNTSENoYW5uZWwgfT4ge1xuXHRcdHJldHVybiBzdGFydFJlbW90ZUFnZW50SG9zdChjbGllbnQsIHRoaXMuX2xvZ1NlcnZpY2UsIGNsaUJpbiwgY2xpRGF0YURpciwgY29tbWFuZE92ZXJyaWRlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfY3JlYXRlV2ViU29ja2V0UmVsYXkoXG5cdFx0Y2xpZW50OiBTU0hDbGllbnQsIGRzdEhvc3Q6IHN0cmluZywgZHN0UG9ydDogbnVtYmVyLCBjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRvbk1lc3NhZ2U6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQsIG9uQ2xvc2U6ICgpID0+IHZvaWQsXG5cdCk6IFByb21pc2U8eyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9PiB7XG5cdFx0Y29uc3QgbmF0aXZlUmVxdWlyZSA9IGF3YWl0IHRoaXMuX2dldE5hdGl2ZVJlcXVpcmUoKTtcblx0XHRyZXR1cm4gY3JlYXRlV2ViU29ja2V0UmVsYXkobmF0aXZlUmVxdWlyZSwgY2xpZW50LCBkc3RIb3N0LCBkc3RQb3J0LCBjb25uZWN0aW9uVG9rZW4sIHRoaXMuX2xvZ1NlcnZpY2UsIG9uTWVzc2FnZSwgb25DbG9zZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB3aGljaCBDTEkgYmluYXJ5IHRvIHJ1biBvbiB0aGUgcmVtb3RlLlxuXHQgKlxuXHQgKiBXaGVuIHRoZSBkZXNrdG9wIGhhcyBhIGBwcm9kdWN0U2VydmljZS5jb21taXRgIChyZWxlYXNlIGJ1aWxkcyksIHdlXG5cdCAqIHBpbiB0byB0aGF0IGNvbW1pdDogaW5zdGFsbCBhdCBgfi88c2VydmVyRGF0YUZvbGRlck5hbWU+LzxhcmNoaXZlPi08Y29tbWl0PmBcblx0ICogKHNoYXJpbmcgdGhlIGluc3RhbGwgcm9vdCB3aXRoIFJlbW90ZS1TU0gpLCByZXVzZSBvbiBmaWxlIGV4aXN0ZW5jZSxcblx0ICogZG93bmxvYWQgZnJvbSB0aGUgY29tbWl0LXBpbm5lZCBVUkwgb24gbWlzcywgYW5kIGNsZWFuIHVwIG9sZGVyXG5cdCAqIGNvbW1pdC1rZXllZCBDTElzIChrZWVwIGxhc3QgNSkuIFRoZSBhZ2VudCBob3N0IENMSSBkb2VzIG5vdFxuXHQgKiBzZWxmLXVwZGF0ZSBvbiB0aGlzIHBhdGgsIHNvIHRoZSBkZXNrdG9wIHB1c2hlcyBmcmVzaG5lc3Mgb24gZXZlcnlcblx0ICogZnJlc2ggc3RhcnQgXHUyMDE0IGJ1dCB0b2xlcmFudGx5OiBpZiB0aGUgZG93bmxvYWQgZmFpbHMgYW5kIGFueSBvdGhlclxuXHQgKiB1c2FibGUgQ0xJIGlzIHByZXNlbnQgKG90aGVyIGNvbW1pdC1rZXllZCBvciB0aGUgbGVnYWN5XG5cdCAqIGB+Ly52c2NvZGUtY2xpeywtPHF1YWxpdHk+fS88YXJjaGl2ZT5gKSwgd2UgZmFsbCBiYWNrIHRvIHRoZSBuZXdlc3Rcblx0ICogb25lIHJhdGhlciB0aGFuIHJlZnVzaW5nIHRvIGNvbm5lY3QuXG5cdCAqXG5cdCAqIEluIGRldi9PU1MgYnVpbGRzIHdpdGggbm8gY29tbWl0LCB3ZSBrZWVwIHRoZSBsb29zZSwgbm9uLXBpbm5lZFxuXHQgKiBiZWhhdmlvcjogaW5zdGFsbCBgfi88c2VydmVyRGF0YUZvbGRlck5hbWU+LzxhcmNoaXZlPmAgZnJvbSB0aGVcblx0ICogYGxhdGVzdGAgVVJMLCB3aXRoIGEgYC0tdmVyc2lvbmAtYmFzZWQgcmV1c2UgY2hlY2suXG5cdCAqXG5cdCAqIFJldHVybnMgdGhlIHJlc29sdmVkIENMSSBiaW5hcnkgcGF0aCB0byBydW4uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVDTElJbnN0YWxsZWQoY2xpZW50OiBTU0hDbGllbnQsIHBsYXRmb3JtOiB7IG9zOiBzdHJpbmc7IGFyY2g6IHN0cmluZyB9LCByZXBvcnRQcm9ncmVzczogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29tbWl0ID0gdGhpcy5fY29tbWl0O1xuXHRcdGlmICghY29tbWl0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlQ0xJSW5zdGFsbGVkTG9vc2UoY2xpZW50LCBwbGF0Zm9ybSwgcmVwb3J0UHJvZ3Jlc3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlQ0xJSW5zdGFsbGVkUGlubmVkKGNsaWVudCwgcGxhdGZvcm0sIHJlcG9ydFByb2dyZXNzLCBjb21taXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbW1pdC1waW5uZWQgaW5zdGFsbCBwYXRoLiBTZWUge0BsaW5rIF9lbnN1cmVDTElJbnN0YWxsZWR9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlQ0xJSW5zdGFsbGVkUGlubmVkKGNsaWVudDogU1NIQ2xpZW50LCBwbGF0Zm9ybTogeyBvczogc3RyaW5nOyBhcmNoOiBzdHJpbmcgfSwgcmVwb3J0UHJvZ3Jlc3M6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQsIGNvbW1pdDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjbGlCaW4gPSBnZXRSZW1vdGVDTElCaW4odGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUsIHRoaXMuX3F1YWxpdHksIGNvbW1pdCk7XG5cdFx0Y29uc3QgaW5zdGFsbFJvb3QgPSBnZXRSZW1vdGVDTElJbnN0YWxsUm9vdCh0aGlzLl9zZXJ2ZXJEYXRhRm9sZGVyTmFtZSk7XG5cblx0XHQvLyBQcmltYXJ5IHJldXNlIGNoZWNrOiBwdXJlIGZpbGUgZXhpc3RlbmNlIG9uIHRoZSBjb21taXQta2V5ZWQgcGF0aC5cblx0XHQvLyBObyBgLS12ZXJzaW9uYCBwYXJzaW5nIFx1MjAxNCB3ZSBrbm93IHRoZSBmaWxlIGlzIG91cnMgYW5kIG1hdGNoZXMgdGhlXG5cdFx0Ly8gZGVza3RvcCBjb21taXQuXG5cdFx0Y29uc3QgeyBjb2RlOiBleGlzdHNDb2RlIH0gPSBhd2FpdCBzc2hFeGVjKGNsaWVudCwgYHRlc3QgLXggJHtjbGlCaW59YCwgeyBpZ25vcmVFeGl0Q29kZTogdHJ1ZSB9KTtcblx0XHRpZiAoZXhpc3RzQ29kZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFJldXNpbmcgcmVtb3RlIENMSSBhdCAke2NsaUJpbn1gKTtcblx0XHRcdC8vIEJ1bXAgbXRpbWUgc28gdGhlIHJldGVudGlvbiBwYXNzIGJlbG93IGRvZXNuJ3QgcHJ1bmUgdGhlXG5cdFx0XHQvLyBiaW5hcnkgd2UganVzdCBkZWNpZGVkIHRvIHJldXNlLiBXaXRob3V0IHRoaXMsIGEgdXNlclxuXHRcdFx0Ly8gcm90YXRpbmcgYmV0d2VlbiBzZXZlcmFsIGRlc2t0b3AgYnVpbGRzIGNvdWxkIHNlZSB0aGVpclxuXHRcdFx0Ly8gY3VycmVudGx5LXVzZWQgQ0xJIGZhbGwgb3V0IG9mIHRoZSA1LW5ld2VzdCB3aW5kb3cgYW5kXG5cdFx0XHQvLyBnZXQgZGVsZXRlZCBqdXN0IGJlZm9yZSB0aGUgbmV4dCByZWNvbm5lY3QuXG5cdFx0XHRjb25zdCB7IGNvZGU6IHRvdWNoQ29kZSB9ID0gYXdhaXQgc3NoRXhlYyhjbGllbnQsIGB0b3VjaCAtLSAke2NsaUJpbn1gLCB7IGlnbm9yZUV4aXRDb2RlOiB0cnVlIH0pO1xuXHRcdFx0aWYgKHRvdWNoQ29kZSA9PT0gMCkge1xuXHRcdFx0XHQvLyBOb3cgdGhhdCB0aGUgaW4tdXNlIGJpbmFyeSBpcyB0aGUgbmV3ZXN0IGJ5IG10aW1lLCBwcnVuZVxuXHRcdFx0XHQvLyBvbGRlciBjb21taXQta2V5ZWQgaW5zdGFsbHMuIEJlc3QtZWZmb3J0LlxuXHRcdFx0XHRhd2FpdCBzc2hFeGVjKGNsaWVudCwgYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQodGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUsIHRoaXMuX3F1YWxpdHkpLCB7IGlnbm9yZUV4aXRDb2RlOiB0cnVlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSWYgd2UgY291bGRuJ3QgcmVmcmVzaCBtdGltZSwgc2tpcCB0aGUgcmV0ZW50aW9uIHBhc3MgXHUyMDE0XG5cdFx0XHRcdC8vIHJ1bm5pbmcgaXQgbm93IGNvdWxkIHBydW5lIHRoZSBiaW5hcnkgd2UganVzdCBkZWNpZGVkXG5cdFx0XHRcdC8vIHRvIHJldXNlLiBXZSdsbCByZXRyeSByZXRlbnRpb24gb24gdGhlIG5leHQgcmVjb25uZWN0LlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gU2tpcHBpbmcgQ0xJIHJldGVudGlvbiBjbGVhbnVwOiB0b3VjaCBleGl0ZWQgJHt0b3VjaENvZGV9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2xpQmluO1xuXHRcdH1cblxuXHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdzc2hQcm9ncmVzc0Rvd25sb2FkaW5nQ0xJJywgXCJJbnN0YWxsaW5nIFZTIENvZGUgQ0xJIG9uIHJlbW90ZS4uLlwiKSk7XG5cdFx0Y29uc3QgdXJsID0gYnVpbGRDTElEb3dubG9hZFVybChwbGF0Zm9ybS5vcywgcGxhdGZvcm0uYXJjaCwgdGhpcy5fcXVhbGl0eSwgY29tbWl0KTtcblxuXHRcdC8vIEV4dHJhY3QgaW50byBhIHRlbXAgZGlyIGluc2lkZSB0aGUgaW5zdGFsbCByb290IHNvIHRoZSBmaW5hbCBgbXZgXG5cdFx0Ly8gaXMgYSBzYW1lLWZpbGVzeXN0ZW0gYXRvbWljIHJlbmFtZS4gQ29uY3VycmVudCBTU0ggc2Vzc2lvbnMgcmFjaW5nXG5cdFx0Ly8gaGVyZSBib3RoIGVuZCB1cCB3aXRoIGEgdmFsaWQgYmluYXJ5IGZvciB0aGUgc2FtZSBjb21taXQ7IHRoZVxuXHRcdC8vIHRyYWlsaW5nIGBybSAtcmZgIG9mIHRoZSB0bXAgZGlyIGlzIGlkZW1wb3RlbnQuXG5cdFx0Y29uc3QgaW5zdGFsbENtZCA9IFtcblx0XHRcdGBta2RpciAtcCAke2luc3RhbGxSb290fWAsXG5cdFx0XHRgdG1wZGlyPSQobWt0ZW1wIC1kICR7aW5zdGFsbFJvb3R9Ly5jbGktaW5zdGFsbC1YWFhYWFgpYCxcblx0XHRcdGAoY2QgXCIkdG1wZGlyXCIgJiYgY3VybCAtZnNTTCAke3NoZWxsRXNjYXBlKHVybCl9IHwgdGFyIHh6KWAsXG5cdFx0XHQvLyBUaGUgYXJjaGl2ZSBjb250YWlucyBleGFjdGx5IG9uZSBmaWxlOiB0aGUgQ0xJIGJpbmFyeSwgbmFtZWQgcGVyIHF1YWxpdHkuXG5cdFx0XHRgbXYgXCIkdG1wZGlyXCIvKiAke2NsaUJpbn1gLFxuXHRcdFx0YGNobW9kICt4ICR7Y2xpQmlufWAsXG5cdFx0XHRgcm0gLXJmIFwiJHRtcGRpclwiYCxcblx0XHRdLmpvaW4oJyAmJiAnKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzc2hFeGVjKGNsaWVudCwgaW5zdGFsbENtZCk7XG5cdFx0XHQvLyBWYWxpZGF0ZSB0aGUgaW5zdGFsbGVkIGJpbmFyeSBhY3R1YWxseSBydW5zLiBJZiB0aGUgYXJjaGl2ZSB3YXNcblx0XHRcdC8vIGZvciB0aGUgd3JvbmcgcGxhdGZvcm0gLyBjb3JydXB0ZWQsIHRoaXMgc3VyZmFjZXMgaW1tZWRpYXRlbHkuXG5cdFx0XHRjb25zdCB7IGNvZGU6IHZlcnNpb25Db2RlIH0gPSBhd2FpdCBzc2hFeGVjKGNsaWVudCwgYCR7Y2xpQmlufSAtLXZlcnNpb25gLCB7IGlnbm9yZUV4aXRDb2RlOiB0cnVlIH0pO1xuXHRcdFx0aWYgKHZlcnNpb25Db2RlICE9PSAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ0xJIGF0ICR7Y2xpQmlufSBmYWlsZWQgLS12ZXJzaW9uIGNoZWNrIGFmdGVyIGluc3RhbGwgKGV4aXQgY29kZSAke3ZlcnNpb25Db2RlfSlgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBJbnN0YWxsZWQgcmVtb3RlIENMSSBhdCAke2NsaUJpbn1gKTtcblx0XHRcdC8vIFBydW5lIG9sZGVyIGNvbW1pdC1rZXllZCBpbnN0YWxscyBub3cgdGhhdCB0aGUgbmV3IGJpbmFyeSBpc1xuXHRcdFx0Ly8gaW4gcGxhY2UgYW5kIGlzIHRoZSBuZXdlc3QgYnkgbXRpbWUuXG5cdFx0XHRhd2FpdCBzc2hFeGVjKGNsaWVudCwgYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQodGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUsIHRoaXMuX3F1YWxpdHkpLCB7IGlnbm9yZUV4aXRDb2RlOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIGNsaUJpbjtcblx0XHR9IGNhdGNoIChpbnN0YWxsRXJyKSB7XG5cdFx0XHQvLyBTb2Z0IGZhbGxiYWNrIChrZXkgZGlmZmVyZW5jZSBmcm9tIFJlbW90ZS1TU0gpOiBpZiB0aGVcblx0XHRcdC8vIGNvbW1pdC1waW5uZWQgZG93bmxvYWQgZmFpbHMgKG9mZmxpbmUsIDQwNCwgZXRjLikgYnV0IGFub3RoZXJcblx0XHRcdC8vIHVzYWJsZSBDTEkgaXMgYWxyZWFkeSBvbiB0aGUgYm94LCB1c2UgdGhhdCBpbnN0ZWFkIG9mIHJlZnVzaW5nXG5cdFx0XHQvLyB0byBjb25uZWN0LiBUaGUgYWdlbnQgaG9zdCBoYXMgbm8gc3RyaWN0IGNvbW1pdC1sb2NrIHdpdGggdGhlXG5cdFx0XHQvLyBkZXNrdG9wIFx1MjAxNCB0aGUgcHJvdG9jb2wgaGFuZHNoYWtlIHdpbGwgY2F0Y2ggZ2VudWluZVxuXHRcdFx0Ly8gaW5jb21wYXRpYmlsaXRpZXMuXG5cdFx0XHRjb25zdCBpbnN0YWxsRXJyb3JNZXNzYWdlID0gaW5zdGFsbEVyciBpbnN0YW5jZW9mIEVycm9yID8gaW5zdGFsbEVyci5tZXNzYWdlIDogU3RyaW5nKGluc3RhbGxFcnIpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IENvdWxkIG5vdCBpbnN0YWxsIG1hdGNoaW5nIENMSSBmb3IgY29tbWl0ICR7Y29tbWl0fTogJHtpbnN0YWxsRXJyb3JNZXNzYWdlfS4gTG9va2luZyBmb3IgYSBmYWxsYmFjayBDTEkgb24gdGhlIHJlbW90ZS4uLmApO1xuXHRcdFx0Y29uc3QgZmFsbGJhY2sgPSBhd2FpdCB0aGlzLl9maW5kRmFsbGJhY2tDTEkoY2xpZW50KTtcblx0XHRcdGlmIChmYWxsYmFjaykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gVXNpbmcgZmFsbGJhY2sgQ0xJIGF0ICR7ZmFsbGJhY2t9IChkb2VzIG5vdCBtYXRjaCBkZXNrdG9wIGNvbW1pdCAke2NvbW1pdH0pLmApO1xuXHRcdFx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBpbnN0YWxsRXJyO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBMb29zZSBkZXYtYnVpbGQgaW5zdGFsbDogbm8gY29tbWl0IHBpbi4gU2VlIHtAbGluayBfZW5zdXJlQ0xJSW5zdGFsbGVkfS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZUNMSUluc3RhbGxlZExvb3NlKGNsaWVudDogU1NIQ2xpZW50LCBwbGF0Zm9ybTogeyBvczogc3RyaW5nOyBhcmNoOiBzdHJpbmcgfSwgcmVwb3J0UHJvZ3Jlc3M6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGNsaUJpbiA9IGdldFJlbW90ZUNMSUJpbih0aGlzLl9zZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgdGhpcy5fcXVhbGl0eSk7XG5cdFx0Y29uc3QgaW5zdGFsbFJvb3QgPSBnZXRSZW1vdGVDTElJbnN0YWxsUm9vdCh0aGlzLl9zZXJ2ZXJEYXRhRm9sZGVyTmFtZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IERlc2t0b3AgaGFzIG5vIHByb2R1Y3QgY29tbWl0OyBmYWxsaW5nIGJhY2sgdG8gbm9uLXBpbm5lZCBDTEkgaW5zdGFsbCBhdCAke2NsaUJpbn0uYCk7XG5cblx0XHRjb25zdCB7IGNvZGUgfSA9IGF3YWl0IHNzaEV4ZWMoY2xpZW50LCBgJHtjbGlCaW59IC0tdmVyc2lvbmAsIHsgaWdub3JlRXhpdENvZGU6IHRydWUgfSk7XG5cdFx0aWYgKGNvZGUgPT09IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZXVzaW5nIHJlbW90ZSBDTEkgYXQgJHtjbGlCaW59IChkZXYgYnVpbGQsIC0tdmVyc2lvbiBjaGVjayBwYXNzZWQpYCk7XG5cdFx0XHRyZXR1cm4gY2xpQmluO1xuXHRcdH1cblxuXHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdzc2hQcm9ncmVzc0Rvd25sb2FkaW5nQ0xJJywgXCJJbnN0YWxsaW5nIFZTIENvZGUgQ0xJIG9uIHJlbW90ZS4uLlwiKSk7XG5cdFx0Y29uc3QgdXJsID0gYnVpbGRDTElEb3dubG9hZFVybChwbGF0Zm9ybS5vcywgcGxhdGZvcm0uYXJjaCwgdGhpcy5fcXVhbGl0eSk7XG5cblx0XHRjb25zdCBpbnN0YWxsQ21kID0gW1xuXHRcdFx0YG1rZGlyIC1wICR7aW5zdGFsbFJvb3R9YCxcblx0XHRcdGBjdXJsIC1mc1NMICR7c2hlbGxFc2NhcGUodXJsKX0gfCB0YXIgeHogLUMgJHtpbnN0YWxsUm9vdH1gLFxuXHRcdFx0YGNobW9kICt4ICR7Y2xpQmlufWAsXG5cdFx0XS5qb2luKCcgJiYgJyk7XG5cblx0XHRhd2FpdCBzc2hFeGVjKGNsaWVudCwgaW5zdGFsbENtZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IEluc3RhbGxlZCByZW1vdGUgQ0xJIGF0ICR7Y2xpQmlufWApO1xuXHRcdHJldHVybiBjbGlCaW47XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCByZW1vdGUgQ0xJIGNhbmRpZGF0ZXMgdGhhdCBjb3VsZCBiZSB1c2VkIGFzIGEgZmFsbGJhY2sgd2hlbiB0aGVcblx0ICogY29tbWl0LXBpbm5lZCBkb3dubG9hZCBmYWlscywgYW5kIHJldHVybiB0aGUgbmV3ZXN0IG9uZSB0aGF0IHBhc3Nlc1xuXHQgKiBhIGAtLXZlcnNpb25gIGNoZWNrLiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIG5vIGNhbmRpZGF0ZSB3b3Jrcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmRGYWxsYmFja0NMSShjbGllbnQ6IFNTSENsaWVudCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IHNzaEV4ZWMoY2xpZW50LCBidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQodGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUsIHRoaXMuX3F1YWxpdHkpLCB7IGlnbm9yZUV4aXRDb2RlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJhd0NhbmRpZGF0ZXMgPSBzdGRvdXQuc3BsaXQoJ1xcbicpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIocyA9PiBzLmxlbmd0aCA+IDApO1xuXHRcdC8vIERlZmVuc2l2ZSB2YWxpZGF0aW9uOiB0aGUgZmluZGVyIHNoZWxsIHNuaXBwZXQgZW1pdHMgcGF0aHMgd2Vcblx0XHQvLyB0cnVzdCBieSBjb25zdHJ1Y3Rpb24sIGJ1dCB0aGUgb3V0cHV0IGlzIHN0aWxsIGRhdGEgY29taW5nIGJhY2tcblx0XHQvLyBvdmVyIFNTSCB0aGF0IHdlIHRoZW4gaW50ZXJwb2xhdGUgaW50byBhIGZvbGxvdy11cCBjb21tYW5kXG5cdFx0Ly8gKGA8Y2FuZGlkYXRlPiAtLXZlcnNpb25gKS4gRmlsdGVyIHRvIHRoZSBleGFjdCBzaGFwZXMgd2UgZXhwZWN0XG5cdFx0Ly8gXHUyMDE0IGA8cm9vdD4vPGFyY2hpdmU+LTw0MCBoZXg+YCBvciBgPGxlZ2FjeURpcj4vPGFyY2hpdmU+YCBcdTIwMTQgc28gYVxuXHRcdC8vIG1hbGljaW91cyBvciBqdW5rIGZpbGUgaW4gdGhlIGluc3RhbGwgcm9vdCBjYW4gbmV2ZXIgYmVjb21lIGFcblx0XHQvLyBzaGVsbCBhcmd1bWVudC5cblx0XHRjb25zdCBjYW5kaWRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHJhd0NhbmRpZGF0ZXMpIHtcblx0XHRcdGlmIChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGNhbmRpZGF0ZSwgdGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUsIHRoaXMuX3F1YWxpdHkpKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZXMucHVzaChjYW5kaWRhdGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IElnbm9yaW5nIGZhbGxiYWNrIENMSSBjYW5kaWRhdGUgd2l0aCB1bmV4cGVjdGVkIHBhdGggc2hhcGU6ICR7Y2FuZGlkYXRlfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0XHRjb25zdCB7IGNvZGUgfSA9IGF3YWl0IHNzaEV4ZWMoY2xpZW50LCBgJHtjYW5kaWRhdGV9IC0tdmVyc2lvbmAsIHsgaWdub3JlRXhpdENvZGU6IHRydWUgfSk7XG5cdFx0XHRpZiAoY29kZSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IEZhbGxiYWNrIENMSSBjYW5kaWRhdGUgJHtjYW5kaWRhdGV9IGZhaWxlZCAtLXZlcnNpb24gY2hlY2sgKGV4aXQgJHtjb2RlfSk7IHRyeWluZyBuZXh0LmApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsWUFBWSxXQUFXO0FBQ2hDLFlBQVksUUFBUTtBQUNwQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxTQUFTLE1BQU0sWUFBWSxnQkFBZ0I7QUFDcEQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGVBQWUsb0JBQW9CO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQztBQUFBLEVBRUM7QUFBQSxPQVFNO0FBRVA7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFB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SUFBSSxTQUFTLE1BQU0sS0FBSyxRQUFRO0FBRXpFLFVBQU0sYUFBYTtBQUFBLE1BQ2xCLFlBQVksV0FBVztBQUFBLE1BQ3ZCLGNBQWMsWUFBWSxHQUFHLENBQUMsZ0JBQWdCLFdBQVc7QUFBQSxNQUN6RCxZQUFZLE1BQU07QUFBQSxJQUNuQixFQUFFLEtBQUssTUFBTTtBQUViLFVBQU0sUUFBUSxRQUFRLFVBQVU7QUFDaEMsU0FBSyxZQUFZLEtBQUssR0FBRyxVQUFVLDRCQUE0QixNQUFNLEVBQUU7QUFDdkUsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxNQUFjLGlCQUFpQixRQUFnRDtBQUM5RSxVQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sUUFBUSxRQUFRLDRCQUE0QixLQUFLLHVCQUF1QixLQUFLLFFBQVEsR0FBRyxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFDekksVUFBTSxnQkFBZ0IsT0FBTyxNQUFNLElBQUksRUFBRSxJQUFJLE9BQUssRUFBRSxLQUFLLENBQUMsRUFBRSxPQUFPLE9BQUssRUFBRSxTQUFTLENBQUM7QUFRcEYsVUFBTSxhQUF1QixDQUFDO0FBQzlCLGVBQVcsYUFBYSxlQUFlO0FBQ3RDLFVBQUksdUJBQXVCLFdBQVcsS0FBSyx1QkFBdUIsS0FBSyxRQUFRLEdBQUc7QUFDakYsbUJBQVcsS0FBSyxTQUFTO0FBQUEsTUFDMUIsT0FBTztBQUNOLGFBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSxnRUFBZ0UsU0FBUyxFQUFFO0FBQUEsTUFDL0c7QUFBQSxJQUNEO0FBQ0EsZUFBVyxhQUFhLFlBQVk7QUFDbkMsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLFFBQVEsUUFBUSxHQUFHLFNBQVMsY0FBYyxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFDekYsVUFBSSxTQUFTLEdBQUc7QUFDZixlQUFPO0FBQUEsTUFDUjtBQUNBLFdBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSwyQkFBMkIsU0FBUyxpQ0FBaUMsSUFBSSxpQkFBaUI7QUFBQSxJQUM5SDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF4K0JhLDhCQTBxQlksbUJBQW1CO0FBQUEsRUFDMUM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFockJZLGdDQUFOO0FBQUEsRUEyQ0o7QUFBQSxFQUNBO0FBQUEsR0E1Q1U7IiwKICAibmFtZXMiOiBbInNzaENsaWVudCJdCn0K
