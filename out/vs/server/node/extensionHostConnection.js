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
import * as net from "net";
import { VSBuffer } from "../../base/common/buffer.js";
import { Emitter, Event } from "../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../base/common/lifecycle.js";
import { FileAccess } from "../../base/common/network.js";
import { delimiter, join } from "../../base/common/path.js";
import { isWindows } from "../../base/common/platform.js";
import { removeDangerousEnvVariables } from "../../base/common/processes.js";
import { createRandomIPCHandle, NodeSocket, WebSocketNodeSocket } from "../../base/parts/ipc/node/ipc.net.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { ILogService } from "../../platform/log/common/log.js";
import { getResolvedShellEnv } from "../../platform/shell/node/shellEnv.js";
import { IExtensionHostStatusService } from "./extensionHostStatusService.js";
import { getNLSConfiguration } from "./remoteLanguagePacks.js";
import { IServerEnvironmentService } from "./serverEnvironmentService.js";
import { IPCExtHostConnection, SocketExtHostConnection, writeExtHostConnection } from "../../workbench/services/extensions/common/extensionHostEnv.js";
async function buildUserEnvironment(startParamsEnv = {}, withUserShellEnvironment, language, environmentService, logService, configurationService) {
  const nlsConfig = await getNLSConfiguration(language, environmentService.userDataPath);
  let userShellEnv = {};
  if (withUserShellEnvironment) {
    try {
      userShellEnv = await getResolvedShellEnv(configurationService, logService, environmentService.args, process.env);
    } catch (error) {
      logService.error("ExtensionHostConnection#buildUserEnvironment resolving shell environment failed", error);
    }
  }
  const processEnv = process.env;
  const env = {
    ...processEnv,
    ...userShellEnv,
    ...{
      VSCODE_ESM_ENTRYPOINT: "vs/workbench/api/node/extensionHostProcess",
      VSCODE_HANDLES_UNCAUGHT_ERRORS: "true",
      VSCODE_NLS_CONFIG: JSON.stringify(nlsConfig)
    },
    ...startParamsEnv
  };
  const binFolder = environmentService.isBuilt ? join(environmentService.appRoot, "bin") : join(environmentService.appRoot, "resources", "server", "bin-dev");
  const remoteCliBinFolder = join(binFolder, "remote-cli");
  let PATH = readCaseInsensitive(env, "PATH");
  if (PATH) {
    PATH = remoteCliBinFolder + delimiter + PATH;
  } else {
    PATH = remoteCliBinFolder;
  }
  setCaseInsensitive(env, "PATH", PATH);
  if (!environmentService.args["without-browser-env-var"]) {
    env.BROWSER = join(binFolder, "helpers", isWindows ? "browser.cmd" : "browser.sh");
  }
  env.VSCODE_RECONNECTION_GRACE_TIME = String(environmentService.reconnectionGraceTime);
  logService.trace(`[reconnection-grace-time] Setting VSCODE_RECONNECTION_GRACE_TIME env var for extension host: ${environmentService.reconnectionGraceTime}ms (${Math.floor(environmentService.reconnectionGraceTime / 1e3)}s)`);
  removeNulls(env);
  return env;
}
class ConnectionData {
  constructor(socket, initialDataChunk) {
    this.socket = socket;
    this.initialDataChunk = initialDataChunk;
  }
  socketDrain() {
    return this.socket.drain();
  }
  toIExtHostSocketMessage() {
    let skipWebSocketFrames;
    let permessageDeflate;
    let inflateBytes;
    if (this.socket instanceof NodeSocket) {
      skipWebSocketFrames = true;
      permessageDeflate = false;
      inflateBytes = VSBuffer.alloc(0);
    } else {
      skipWebSocketFrames = false;
      permessageDeflate = this.socket.permessageDeflate;
      inflateBytes = this.socket.recordedInflateBytes;
      this.socket.setRecordInflateBytes(false);
    }
    return {
      type: "VSCODE_EXTHOST_IPC_SOCKET",
      initialDataChunk: this.initialDataChunk.buffer.toString("base64"),
      skipWebSocketFrames,
      permessageDeflate,
      inflateBytes: inflateBytes.buffer.toString("base64")
    };
  }
}
let ExtensionHostConnection = class extends Disposable {
  constructor(_reconnectionToken, remoteAddress, socket, initialDataChunk, _environmentService, _logService, _extensionHostStatusService, _configurationService) {
    super();
    this._reconnectionToken = _reconnectionToken;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._extensionHostStatusService = _extensionHostStatusService;
    this._configurationService = _configurationService;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._canSendSocket = !isWindows || !this._environmentService.args["socket-path"];
    this._disposed = false;
    this._remoteAddress = remoteAddress;
    this._extensionHostProcess = null;
    this._connectionData = new ConnectionData(socket, initialDataChunk);
    if (!this._canSendSocket && socket instanceof WebSocketNodeSocket) {
      socket.setRecordInflateBytes(false);
    }
    this._log(`New connection established.`);
  }
  dispose() {
    this._cleanResources();
    super.dispose();
  }
  get _logPrefix() {
    return `[${this._remoteAddress}][${this._reconnectionToken.substr(0, 8)}][ExtensionHostConnection] `;
  }
  _log(_str) {
    this._logService.info(`${this._logPrefix}${_str}`);
  }
  _logError(_str) {
    this._logService.error(`${this._logPrefix}${_str}`);
  }
  async _pipeSockets(extHostSocket, connectionData) {
    const disposables = new DisposableStore();
    disposables.add(connectionData.socket);
    disposables.add(toDisposable(() => {
      if (!extHostSocket.destroyed && !extHostSocket.writableEnded) {
        extHostSocket.end();
      }
    }));
    const stopAndCleanup = () => {
      disposables.dispose();
    };
    disposables.add(connectionData.socket.onEnd(stopAndCleanup));
    disposables.add(connectionData.socket.onClose(stopAndCleanup));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "end")(stopAndCleanup));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "close")(stopAndCleanup));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "error")(stopAndCleanup));
    disposables.add(connectionData.socket.onData((e) => extHostSocket.write(e.buffer)));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "data")((e) => {
      connectionData.socket.write(VSBuffer.wrap(e));
    }));
    if (connectionData.initialDataChunk.byteLength > 0) {
      extHostSocket.write(connectionData.initialDataChunk.buffer);
    }
  }
  async _sendSocketToExtensionHost(extensionHostProcess, connectionData) {
    await connectionData.socketDrain();
    const msg = connectionData.toIExtHostSocketMessage();
    let socket;
    if (connectionData.socket instanceof NodeSocket) {
      socket = connectionData.socket.socket;
    } else {
      socket = connectionData.socket.socket.socket;
    }
    extensionHostProcess.send(msg, socket);
  }
  shortenReconnectionGraceTimeIfNecessary() {
    if (!this._extensionHostProcess) {
      return;
    }
    const msg = {
      type: "VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME"
    };
    this._extensionHostProcess.send(msg);
  }
  acceptReconnection(remoteAddress, _socket, initialDataChunk) {
    this._remoteAddress = remoteAddress;
    this._log(`The client has reconnected.`);
    if (!this._canSendSocket && _socket instanceof WebSocketNodeSocket) {
      _socket.setRecordInflateBytes(false);
    }
    const connectionData = new ConnectionData(_socket, initialDataChunk);
    if (!this._extensionHostProcess) {
      this._connectionData = connectionData;
      return;
    }
    this._sendSocketToExtensionHost(this._extensionHostProcess, connectionData);
  }
  _cleanResources() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this._connectionData) {
      this._connectionData.socket.end();
      this._connectionData = null;
    }
    if (this._extensionHostProcess) {
      this._extensionHostProcess.kill();
      this._extensionHostProcess = null;
    }
    this._onClose.fire(void 0);
  }
  async start(startParams) {
    try {
      let execArgv = process.execArgv ? process.execArgv.filter((a) => !/^--inspect(-brk)?=/.test(a)) : [];
      if (startParams.port && !process.pkg) {
        execArgv = [
          `--inspect${startParams.break ? "-brk" : ""}=${startParams.port}`,
          "--experimental-network-inspection"
        ];
      }
      this._log(`Starting extension host process...`);
      const env = await buildUserEnvironment(startParams.env, true, startParams.language, this._environmentService, this._logService, this._configurationService);
      removeDangerousEnvVariables(env);
      let extHostNamedPipeServer;
      if (this._canSendSocket) {
        writeExtHostConnection(new SocketExtHostConnection(), env);
        extHostNamedPipeServer = null;
      } else {
        const { namedPipeServer, pipeName } = await this._listenOnPipe();
        writeExtHostConnection(new IPCExtHostConnection(pipeName), env);
        extHostNamedPipeServer = namedPipeServer;
      }
      const opts = {
        env,
        execArgv,
        silent: true
      };
      opts.execArgv.unshift("--dns-result-order=ipv4first");
      const args = ["--type=extensionHost", `--transformURIs`];
      const useHostProxy = this._environmentService.args["use-host-proxy"];
      args.push(`--useHostProxy=${useHostProxy ? "true" : "false"}`);
      if (this._configurationService.getValue("extensions.supportNodeGlobalNavigator")) {
        args.push("--supportGlobalNavigator");
      }
      this._extensionHostProcess = cp.fork(FileAccess.asFileUri("bootstrap-fork").fsPath, args, opts);
      const pid = this._extensionHostProcess.pid;
      this._log(`<${pid}> Launched Extension Host Process.`);
      this._extensionHostProcess.stdout.setEncoding("utf8");
      this._extensionHostProcess.stderr.setEncoding("utf8");
      const onStdout = Event.fromNodeEventEmitter(this._extensionHostProcess.stdout, "data");
      const onStderr = Event.fromNodeEventEmitter(this._extensionHostProcess.stderr, "data");
      this._register(onStdout((e) => this._log(`<${pid}> ${e}`)));
      this._register(onStderr((e) => this._log(`<${pid}><stderr> ${e}`)));
      this._extensionHostProcess.on("error", (err) => {
        this._logError(`<${pid}> Extension Host Process had an error`);
        this._logService.error(err);
        this._cleanResources();
      });
      this._extensionHostProcess.on("exit", (code, signal) => {
        this._extensionHostStatusService.setExitInfo(this._reconnectionToken, { code, signal });
        this._log(`<${pid}> Extension Host Process exited with code: ${code}, signal: ${signal}.`);
        this._cleanResources();
      });
      if (extHostNamedPipeServer) {
        extHostNamedPipeServer.on("connection", (socket) => {
          extHostNamedPipeServer.close();
          this._pipeSockets(socket, this._connectionData);
        });
      } else {
        const messageListener = (msg) => {
          if (msg.type === "VSCODE_EXTHOST_IPC_READY") {
            this._extensionHostProcess.removeListener("message", messageListener);
            this._sendSocketToExtensionHost(this._extensionHostProcess, this._connectionData);
            this._connectionData = null;
          }
        };
        this._extensionHostProcess.on("message", messageListener);
      }
    } catch (error) {
      this._logError(`Failed to start extension host process`);
      this._logService.error(error);
      this._cleanResources();
    }
  }
  _listenOnPipe() {
    return new Promise((resolve, reject) => {
      const pipeName = createRandomIPCHandle();
      const namedPipeServer = net.createServer();
      namedPipeServer.on("error", reject);
      namedPipeServer.listen(pipeName, () => {
        namedPipeServer?.removeListener("error", reject);
        resolve({ pipeName, namedPipeServer });
      });
    });
  }
};
ExtensionHostConnection = __decorateClass([
  __decorateParam(4, IServerEnvironmentService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IExtensionHostStatusService),
  __decorateParam(7, IConfigurationService)
], ExtensionHostConnection);
function readCaseInsensitive(env, key) {
  const pathKeys = Object.keys(env).filter((k) => k.toLowerCase() === key.toLowerCase());
  const pathKey = pathKeys.length > 0 ? pathKeys[0] : key;
  return env[pathKey];
}
function setCaseInsensitive(env, key, value) {
  const pathKeys = Object.keys(env).filter((k) => k.toLowerCase() === key.toLowerCase());
  const pathKey = pathKeys.length > 0 ? pathKeys[0] : key;
  env[pathKey] = value;
}
function removeNulls(env) {
  for (const key of Object.keys(env)) {
    if (env[key] === null) {
      delete env[key];
    }
  }
}
export {
  ExtensionHostConnection,
  buildUserEnvironment
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3NlcnZlci9ub2RlL2V4dGVuc2lvbkhvc3RDb25uZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBqb2luIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyByZW1vdmVEYW5nZXJvdXNFbnZWYXJpYWJsZXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmFuZG9tSVBDSGFuZGxlLCBOb2RlU29ja2V0LCBXZWJTb2NrZXROb2RlU29ja2V0IH0gZnJvbSAnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMubmV0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXh0ZW5zaW9uSG9zdFN0YXJ0UGFyYW1zIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgZ2V0UmVzb2x2ZWRTaGVsbEVudiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3NoZWxsL25vZGUvc2hlbGxFbnYuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RTdGF0dXNTZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0U3RhdHVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXROTFNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9yZW1vdGVMYW5ndWFnZVBhY2tzLmpzJztcbmltcG9ydCB7IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuL3NlcnZlckVudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUENFeHRIb3N0Q29ubmVjdGlvbiwgU29ja2V0RXh0SG9zdENvbm5lY3Rpb24sIHdyaXRlRXh0SG9zdENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdEVudi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJlYWR5TWVzc2FnZSwgSUV4dEhvc3RSZWR1Y2VHcmFjZVRpbWVNZXNzYWdlLCBJRXh0SG9zdFNvY2tldE1lc3NhZ2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdFByb3RvY29sLmpzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJ1aWxkVXNlckVudmlyb25tZW50KHN0YXJ0UGFyYW1zRW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IG51bGwgfSA9IHt9LCB3aXRoVXNlclNoZWxsRW52aXJvbm1lbnQ6IGJvb2xlYW4sIGxhbmd1YWdlOiBzdHJpbmcsIGVudmlyb25tZW50U2VydmljZTogSVNlcnZlckVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQ+IHtcblx0Y29uc3QgbmxzQ29uZmlnID0gYXdhaXQgZ2V0TkxTQ29uZmlndXJhdGlvbihsYW5ndWFnZSwgZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCk7XG5cblx0bGV0IHVzZXJTaGVsbEVudjogdHlwZW9mIHByb2Nlc3MuZW52ID0ge307XG5cdGlmICh3aXRoVXNlclNoZWxsRW52aXJvbm1lbnQpIHtcblx0XHR0cnkge1xuXHRcdFx0dXNlclNoZWxsRW52ID0gYXdhaXQgZ2V0UmVzb2x2ZWRTaGVsbEVudihjb25maWd1cmF0aW9uU2VydmljZSwgbG9nU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3MsIHByb2Nlc3MuZW52KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignRXh0ZW5zaW9uSG9zdENvbm5lY3Rpb24jYnVpbGRVc2VyRW52aXJvbm1lbnQgcmVzb2x2aW5nIHNoZWxsIGVudmlyb25tZW50IGZhaWxlZCcsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBwcm9jZXNzRW52ID0gcHJvY2Vzcy5lbnY7XG5cblx0Y29uc3QgZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRcdC4uLnByb2Nlc3NFbnYsXG5cdFx0Li4udXNlclNoZWxsRW52LFxuXHRcdC4uLntcblx0XHRcdFZTQ09ERV9FU01fRU5UUllQT0lOVDogJ3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRlbnNpb25Ib3N0UHJvY2VzcycsXG5cdFx0XHRWU0NPREVfSEFORExFU19VTkNBVUdIVF9FUlJPUlM6ICd0cnVlJyxcblx0XHRcdFZTQ09ERV9OTFNfQ09ORklHOiBKU09OLnN0cmluZ2lmeShubHNDb25maWcpXG5cdFx0fSxcblx0XHQuLi5zdGFydFBhcmFtc0VudlxuXHR9O1xuXG5cdGNvbnN0IGJpbkZvbGRlciA9IGVudmlyb25tZW50U2VydmljZS5pc0J1aWx0ID8gam9pbihlbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCwgJ2JpbicpIDogam9pbihlbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCwgJ3Jlc291cmNlcycsICdzZXJ2ZXInLCAnYmluLWRldicpO1xuXHRjb25zdCByZW1vdGVDbGlCaW5Gb2xkZXIgPSBqb2luKGJpbkZvbGRlciwgJ3JlbW90ZS1jbGknKTsgLy8gY29udGFpbnMgdGhlIGBjb2RlYCBjb21tYW5kIHRoYXQgY2FuIHRhbGsgdG8gdGhlIHJlbW90ZSBzZXJ2ZXJcblxuXHRsZXQgUEFUSCA9IHJlYWRDYXNlSW5zZW5zaXRpdmUoZW52LCAnUEFUSCcpO1xuXHRpZiAoUEFUSCkge1xuXHRcdFBBVEggPSByZW1vdGVDbGlCaW5Gb2xkZXIgKyBkZWxpbWl0ZXIgKyBQQVRIO1xuXHR9IGVsc2Uge1xuXHRcdFBBVEggPSByZW1vdGVDbGlCaW5Gb2xkZXI7XG5cdH1cblx0c2V0Q2FzZUluc2Vuc2l0aXZlKGVudiwgJ1BBVEgnLCBQQVRIKTtcblxuXHRpZiAoIWVudmlyb25tZW50U2VydmljZS5hcmdzWyd3aXRob3V0LWJyb3dzZXItZW52LXZhciddKSB7XG5cdFx0ZW52LkJST1dTRVIgPSBqb2luKGJpbkZvbGRlciwgJ2hlbHBlcnMnLCBpc1dpbmRvd3MgPyAnYnJvd3Nlci5jbWQnIDogJ2Jyb3dzZXIuc2gnKTsgLy8gYSBjb21tYW5kIHRoYXQgb3BlbnMgYSBicm93c2VyIG9uIHRoZSBsb2NhbCBtYWNoaW5lXG5cdH1cblxuXHRlbnYuVlNDT0RFX1JFQ09OTkVDVElPTl9HUkFDRV9USU1FID0gU3RyaW5nKGVudmlyb25tZW50U2VydmljZS5yZWNvbm5lY3Rpb25HcmFjZVRpbWUpO1xuXHRsb2dTZXJ2aWNlLnRyYWNlKGBbcmVjb25uZWN0aW9uLWdyYWNlLXRpbWVdIFNldHRpbmcgVlNDT0RFX1JFQ09OTkVDVElPTl9HUkFDRV9USU1FIGVudiB2YXIgZm9yIGV4dGVuc2lvbiBob3N0OiAke2Vudmlyb25tZW50U2VydmljZS5yZWNvbm5lY3Rpb25HcmFjZVRpbWV9bXMgKCR7TWF0aC5mbG9vcihlbnZpcm9ubWVudFNlcnZpY2UucmVjb25uZWN0aW9uR3JhY2VUaW1lIC8gMTAwMCl9cylgKTtcblxuXHRyZW1vdmVOdWxscyhlbnYpO1xuXHRyZXR1cm4gZW52O1xufVxuXG5jbGFzcyBDb25uZWN0aW9uRGF0YSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzb2NrZXQ6IE5vZGVTb2NrZXQgfCBXZWJTb2NrZXROb2RlU29ja2V0LFxuXHRcdHB1YmxpYyByZWFkb25seSBpbml0aWFsRGF0YUNodW5rOiBWU0J1ZmZlclxuXHQpIHsgfVxuXG5cdHB1YmxpYyBzb2NrZXREcmFpbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zb2NrZXQuZHJhaW4oKTtcblx0fVxuXG5cdHB1YmxpYyB0b0lFeHRIb3N0U29ja2V0TWVzc2FnZSgpOiBJRXh0SG9zdFNvY2tldE1lc3NhZ2Uge1xuXG5cdFx0bGV0IHNraXBXZWJTb2NrZXRGcmFtZXM6IGJvb2xlYW47XG5cdFx0bGV0IHBlcm1lc3NhZ2VEZWZsYXRlOiBib29sZWFuO1xuXHRcdGxldCBpbmZsYXRlQnl0ZXM6IFZTQnVmZmVyO1xuXG5cdFx0aWYgKHRoaXMuc29ja2V0IGluc3RhbmNlb2YgTm9kZVNvY2tldCkge1xuXHRcdFx0c2tpcFdlYlNvY2tldEZyYW1lcyA9IHRydWU7XG5cdFx0XHRwZXJtZXNzYWdlRGVmbGF0ZSA9IGZhbHNlO1xuXHRcdFx0aW5mbGF0ZUJ5dGVzID0gVlNCdWZmZXIuYWxsb2MoMCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNraXBXZWJTb2NrZXRGcmFtZXMgPSBmYWxzZTtcblx0XHRcdHBlcm1lc3NhZ2VEZWZsYXRlID0gdGhpcy5zb2NrZXQucGVybWVzc2FnZURlZmxhdGU7XG5cdFx0XHRpbmZsYXRlQnl0ZXMgPSB0aGlzLnNvY2tldC5yZWNvcmRlZEluZmxhdGVCeXRlcztcblx0XHRcdHRoaXMuc29ja2V0LnNldFJlY29yZEluZmxhdGVCeXRlcyhmYWxzZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdWU0NPREVfRVhUSE9TVF9JUENfU09DS0VUJyxcblx0XHRcdGluaXRpYWxEYXRhQ2h1bms6ICg8QnVmZmVyPnRoaXMuaW5pdGlhbERhdGFDaHVuay5idWZmZXIpLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHRcdHNraXBXZWJTb2NrZXRGcmFtZXM6IHNraXBXZWJTb2NrZXRGcmFtZXMsXG5cdFx0XHRwZXJtZXNzYWdlRGVmbGF0ZTogcGVybWVzc2FnZURlZmxhdGUsXG5cdFx0XHRpbmZsYXRlQnl0ZXM6ICg8QnVmZmVyPmluZmxhdGVCeXRlcy5idWZmZXIpLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25Ib3N0Q29ubmVjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX29uQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25DbG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkNsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhblNlbmRTb2NrZXQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2Rpc3Bvc2VkOiBib29sZWFuO1xuXHRwcml2YXRlIF9yZW1vdGVBZGRyZXNzOiBzdHJpbmc7XG5cdHByaXZhdGUgX2V4dGVuc2lvbkhvc3RQcm9jZXNzOiBjcC5DaGlsZFByb2Nlc3MgfCBudWxsO1xuXHRwcml2YXRlIF9jb25uZWN0aW9uRGF0YTogQ29ubmVjdGlvbkRhdGEgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlY29ubmVjdGlvblRva2VuOiBzdHJpbmcsXG5cdFx0cmVtb3RlQWRkcmVzczogc3RyaW5nLFxuXHRcdHNvY2tldDogTm9kZVNvY2tldCB8IFdlYlNvY2tldE5vZGVTb2NrZXQsXG5cdFx0aW5pdGlhbERhdGFDaHVuazogVlNCdWZmZXIsXG5cdFx0QElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJU2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkhvc3RTdGF0dXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkhvc3RTdGF0dXNTZXJ2aWNlOiBJRXh0ZW5zaW9uSG9zdFN0YXR1c1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY2FuU2VuZFNvY2tldCA9ICghaXNXaW5kb3dzIHx8ICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snc29ja2V0LXBhdGgnXSk7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9yZW1vdGVBZGRyZXNzID0gcmVtb3RlQWRkcmVzcztcblx0XHR0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2VzcyA9IG51bGw7XG5cdFx0dGhpcy5fY29ubmVjdGlvbkRhdGEgPSBuZXcgQ29ubmVjdGlvbkRhdGEoc29ja2V0LCBpbml0aWFsRGF0YUNodW5rKTtcblx0XHRpZiAoIXRoaXMuX2NhblNlbmRTb2NrZXQgJiYgc29ja2V0IGluc3RhbmNlb2YgV2ViU29ja2V0Tm9kZVNvY2tldCkge1xuXHRcdFx0c29ja2V0LnNldFJlY29yZEluZmxhdGVCeXRlcyhmYWxzZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nKGBOZXcgY29ubmVjdGlvbiBlc3RhYmxpc2hlZC5gKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYW5SZXNvdXJjZXMoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfbG9nUHJlZml4KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBbJHt0aGlzLl9yZW1vdGVBZGRyZXNzfV1bJHt0aGlzLl9yZWNvbm5lY3Rpb25Ub2tlbi5zdWJzdHIoMCwgOCl9XVtFeHRlbnNpb25Ib3N0Q29ubmVjdGlvbl0gYDtcblx0fVxuXG5cdHByaXZhdGUgX2xvZyhfc3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5fbG9nUHJlZml4fSR7X3N0cn1gKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ0Vycm9yKF9zdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7dGhpcy5fbG9nUHJlZml4fSR7X3N0cn1gKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BpcGVTb2NrZXRzKGV4dEhvc3RTb2NrZXQ6IG5ldC5Tb2NrZXQsIGNvbm5lY3Rpb25EYXRhOiBDb25uZWN0aW9uRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm5lY3Rpb25EYXRhLnNvY2tldCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoIWV4dEhvc3RTb2NrZXQuZGVzdHJveWVkICYmICFleHRIb3N0U29ja2V0LndyaXRhYmxlRW5kZWQpIHtcblx0XHRcdFx0ZXh0SG9zdFNvY2tldC5lbmQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzdG9wQW5kQ2xlYW51cCA9ICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm5lY3Rpb25EYXRhLnNvY2tldC5vbkVuZChzdG9wQW5kQ2xlYW51cCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uZWN0aW9uRGF0YS5zb2NrZXQub25DbG9zZShzdG9wQW5kQ2xlYW51cCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHZvaWQ+KGV4dEhvc3RTb2NrZXQsICdlbmQnKShzdG9wQW5kQ2xlYW51cCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjx2b2lkPihleHRIb3N0U29ja2V0LCAnY2xvc2UnKShzdG9wQW5kQ2xlYW51cCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjx2b2lkPihleHRIb3N0U29ja2V0LCAnZXJyb3InKShzdG9wQW5kQ2xlYW51cCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm5lY3Rpb25EYXRhLnNvY2tldC5vbkRhdGEoKGUpID0+IGV4dEhvc3RTb2NrZXQud3JpdGUoZS5idWZmZXIpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPEJ1ZmZlcj4oZXh0SG9zdFNvY2tldCwgJ2RhdGEnKSgoZSkgPT4ge1xuXHRcdFx0Y29ubmVjdGlvbkRhdGEuc29ja2V0LndyaXRlKFZTQnVmZmVyLndyYXAoZSkpO1xuXHRcdH0pKTtcblxuXHRcdGlmIChjb25uZWN0aW9uRGF0YS5pbml0aWFsRGF0YUNodW5rLmJ5dGVMZW5ndGggPiAwKSB7XG5cdFx0XHRleHRIb3N0U29ja2V0LndyaXRlKGNvbm5lY3Rpb25EYXRhLmluaXRpYWxEYXRhQ2h1bmsuYnVmZmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kU29ja2V0VG9FeHRlbnNpb25Ib3N0KGV4dGVuc2lvbkhvc3RQcm9jZXNzOiBjcC5DaGlsZFByb2Nlc3MsIGNvbm5lY3Rpb25EYXRhOiBDb25uZWN0aW9uRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE1ha2Ugc3VyZSBhbGwgb3V0c3RhbmRpbmcgd3JpdGVzIGhhdmUgYmVlbiBkcmFpbmVkIGJlZm9yZSBzZW5kaW5nIHRoZSBzb2NrZXRcblx0XHRhd2FpdCBjb25uZWN0aW9uRGF0YS5zb2NrZXREcmFpbigpO1xuXHRcdGNvbnN0IG1zZyA9IGNvbm5lY3Rpb25EYXRhLnRvSUV4dEhvc3RTb2NrZXRNZXNzYWdlKCk7XG5cdFx0bGV0IHNvY2tldDogbmV0LlNvY2tldDtcblx0XHRpZiAoY29ubmVjdGlvbkRhdGEuc29ja2V0IGluc3RhbmNlb2YgTm9kZVNvY2tldCkge1xuXHRcdFx0c29ja2V0ID0gY29ubmVjdGlvbkRhdGEuc29ja2V0LnNvY2tldDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c29ja2V0ID0gY29ubmVjdGlvbkRhdGEuc29ja2V0LnNvY2tldC5zb2NrZXQ7XG5cdFx0fVxuXHRcdGV4dGVuc2lvbkhvc3RQcm9jZXNzLnNlbmQobXNnLCBzb2NrZXQpO1xuXHR9XG5cblx0cHVibGljIHNob3J0ZW5SZWNvbm5lY3Rpb25HcmFjZVRpbWVJZk5lY2Vzc2FyeSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1zZzogSUV4dEhvc3RSZWR1Y2VHcmFjZVRpbWVNZXNzYWdlID0ge1xuXHRcdFx0dHlwZTogJ1ZTQ09ERV9FWFRIT1NUX0lQQ19SRURVQ0VfR1JBQ0VfVElNRSdcblx0XHR9O1xuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLnNlbmQobXNnKTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRSZWNvbm5lY3Rpb24ocmVtb3RlQWRkcmVzczogc3RyaW5nLCBfc29ja2V0OiBOb2RlU29ja2V0IHwgV2ViU29ja2V0Tm9kZVNvY2tldCwgaW5pdGlhbERhdGFDaHVuazogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW1vdGVBZGRyZXNzID0gcmVtb3RlQWRkcmVzcztcblx0XHR0aGlzLl9sb2coYFRoZSBjbGllbnQgaGFzIHJlY29ubmVjdGVkLmApO1xuXHRcdGlmICghdGhpcy5fY2FuU2VuZFNvY2tldCAmJiBfc29ja2V0IGluc3RhbmNlb2YgV2ViU29ja2V0Tm9kZVNvY2tldCkge1xuXHRcdFx0X3NvY2tldC5zZXRSZWNvcmRJbmZsYXRlQnl0ZXMoZmFsc2UpO1xuXHRcdH1cblx0XHRjb25zdCBjb25uZWN0aW9uRGF0YSA9IG5ldyBDb25uZWN0aW9uRGF0YShfc29ja2V0LCBpbml0aWFsRGF0YUNodW5rKTtcblxuXHRcdGlmICghdGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MpIHtcblx0XHRcdC8vIFRoZSBleHRlbnNpb24gaG9zdCBkaWRuJ3QgZXZlbiBzdGFydCB1cCB5ZXRcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25EYXRhID0gY29ubmVjdGlvbkRhdGE7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZFNvY2tldFRvRXh0ZW5zaW9uSG9zdCh0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2VzcywgY29ubmVjdGlvbkRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW5SZXNvdXJjZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IGNhbGxlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25EYXRhKSB7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uRGF0YS5zb2NrZXQuZW5kKCk7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uRGF0YSA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcykge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3Mua2lsbCgpO1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MgPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLl9vbkNsb3NlLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzdGFydChzdGFydFBhcmFtczogSVJlbW90ZUV4dGVuc2lvbkhvc3RTdGFydFBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZXhlY0FyZ3Y6IHN0cmluZ1tdID0gcHJvY2Vzcy5leGVjQXJndiA/IHByb2Nlc3MuZXhlY0FyZ3YuZmlsdGVyKGEgPT4gIS9eLS1pbnNwZWN0KC1icmspPz0vLnRlc3QoYSkpIDogW107XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdGlmIChzdGFydFBhcmFtcy5wb3J0ICYmICEoPGFueT5wcm9jZXNzKS5wa2cpIHtcblx0XHRcdFx0ZXhlY0FyZ3YgPSBbXG5cdFx0XHRcdFx0YC0taW5zcGVjdCR7c3RhcnRQYXJhbXMuYnJlYWsgPyAnLWJyaycgOiAnJ309JHtzdGFydFBhcmFtcy5wb3J0fWAsXG5cdFx0XHRcdFx0Jy0tZXhwZXJpbWVudGFsLW5ldHdvcmstaW5zcGVjdGlvbidcblx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nKGBTdGFydGluZyBleHRlbnNpb24gaG9zdCBwcm9jZXNzLi4uYCk7XG5cblx0XHRcdGNvbnN0IGVudiA9IGF3YWl0IGJ1aWxkVXNlckVudmlyb25tZW50KHN0YXJ0UGFyYW1zLmVudiwgdHJ1ZSwgc3RhcnRQYXJhbXMubGFuZ3VhZ2UsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0cmVtb3ZlRGFuZ2Vyb3VzRW52VmFyaWFibGVzKGVudik7XG5cblx0XHRcdGxldCBleHRIb3N0TmFtZWRQaXBlU2VydmVyOiBuZXQuU2VydmVyIHwgbnVsbDtcblxuXHRcdFx0aWYgKHRoaXMuX2NhblNlbmRTb2NrZXQpIHtcblx0XHRcdFx0d3JpdGVFeHRIb3N0Q29ubmVjdGlvbihuZXcgU29ja2V0RXh0SG9zdENvbm5lY3Rpb24oKSwgZW52KTtcblx0XHRcdFx0ZXh0SG9zdE5hbWVkUGlwZVNlcnZlciA9IG51bGw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB7IG5hbWVkUGlwZVNlcnZlciwgcGlwZU5hbWUgfSA9IGF3YWl0IHRoaXMuX2xpc3Rlbk9uUGlwZSgpO1xuXHRcdFx0XHR3cml0ZUV4dEhvc3RDb25uZWN0aW9uKG5ldyBJUENFeHRIb3N0Q29ubmVjdGlvbihwaXBlTmFtZSksIGVudik7XG5cdFx0XHRcdGV4dEhvc3ROYW1lZFBpcGVTZXJ2ZXIgPSBuYW1lZFBpcGVTZXJ2ZXI7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wdHMgPSB7XG5cdFx0XHRcdGVudixcblx0XHRcdFx0ZXhlY0FyZ3YsXG5cdFx0XHRcdHNpbGVudDogdHJ1ZVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gUmVmcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTg5ODA1XG5cdFx0XHRvcHRzLmV4ZWNBcmd2LnVuc2hpZnQoJy0tZG5zLXJlc3VsdC1vcmRlcj1pcHY0Zmlyc3QnKTtcblxuXHRcdFx0Ly8gUnVuIEV4dGVuc2lvbiBIb3N0IGFzIGZvcmsgb2YgY3VycmVudCBwcm9jZXNzXG5cdFx0XHRjb25zdCBhcmdzID0gWyctLXR5cGU9ZXh0ZW5zaW9uSG9zdCcsIGAtLXRyYW5zZm9ybVVSSXNgXTtcblx0XHRcdGNvbnN0IHVzZUhvc3RQcm94eSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWyd1c2UtaG9zdC1wcm94eSddO1xuXHRcdFx0YXJncy5wdXNoKGAtLXVzZUhvc3RQcm94eT0ke3VzZUhvc3RQcm94eSA/ICd0cnVlJyA6ICdmYWxzZSd9YCk7XG5cdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2V4dGVuc2lvbnMuc3VwcG9ydE5vZGVHbG9iYWxOYXZpZ2F0b3InKSkge1xuXHRcdFx0XHRhcmdzLnB1c2goJy0tc3VwcG9ydEdsb2JhbE5hdmlnYXRvcicpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MgPSBjcC5mb3JrKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCdib290c3RyYXAtZm9yaycpLmZzUGF0aCwgYXJncywgb3B0cyk7XG5cdFx0XHRjb25zdCBwaWQgPSB0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5waWQ7XG5cdFx0XHR0aGlzLl9sb2coYDwke3BpZH0+IExhdW5jaGVkIEV4dGVuc2lvbiBIb3N0IFByb2Nlc3MuYCk7XG5cblx0XHRcdC8vIENhdGNoIGFsbCBvdXRwdXQgY29taW5nIGZyb20gdGhlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3Ncblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLnN0ZG91dCEuc2V0RW5jb2RpbmcoJ3V0ZjgnKTtcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLnN0ZGVyciEuc2V0RW5jb2RpbmcoJ3V0ZjgnKTtcblx0XHRcdGNvbnN0IG9uU3Rkb3V0ID0gRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8c3RyaW5nPih0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5zdGRvdXQhLCAnZGF0YScpO1xuXHRcdFx0Y29uc3Qgb25TdGRlcnIgPSBFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjxzdHJpbmc+KHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLnN0ZGVyciEsICdkYXRhJyk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvblN0ZG91dCgoZSkgPT4gdGhpcy5fbG9nKGA8JHtwaWR9PiAke2V9YCkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uU3RkZXJyKChlKSA9PiB0aGlzLl9sb2coYDwke3BpZH0+PHN0ZGVycj4gJHtlfWApKSk7XG5cblx0XHRcdC8vIExpZmVjeWNsZVxuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3Mub24oJ2Vycm9yJywgKGVycikgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dFcnJvcihgPCR7cGlkfT4gRXh0ZW5zaW9uIEhvc3QgUHJvY2VzcyBoYWQgYW4gZXJyb3JgKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHR0aGlzLl9jbGVhblJlc291cmNlcygpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLm9uKCdleGl0JywgKGNvZGU6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXR1c1NlcnZpY2Uuc2V0RXhpdEluZm8odGhpcy5fcmVjb25uZWN0aW9uVG9rZW4sIHsgY29kZSwgc2lnbmFsIH0pO1xuXHRcdFx0XHR0aGlzLl9sb2coYDwke3BpZH0+IEV4dGVuc2lvbiBIb3N0IFByb2Nlc3MgZXhpdGVkIHdpdGggY29kZTogJHtjb2RlfSwgc2lnbmFsOiAke3NpZ25hbH0uYCk7XG5cdFx0XHRcdHRoaXMuX2NsZWFuUmVzb3VyY2VzKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGV4dEhvc3ROYW1lZFBpcGVTZXJ2ZXIpIHtcblx0XHRcdFx0ZXh0SG9zdE5hbWVkUGlwZVNlcnZlci5vbignY29ubmVjdGlvbicsIChzb2NrZXQpID0+IHtcblx0XHRcdFx0XHRleHRIb3N0TmFtZWRQaXBlU2VydmVyLmNsb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fcGlwZVNvY2tldHMoc29ja2V0LCB0aGlzLl9jb25uZWN0aW9uRGF0YSEpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2VMaXN0ZW5lciA9IChtc2c6IElFeHRIb3N0UmVhZHlNZXNzYWdlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG1zZy50eXBlID09PSAnVlNDT0RFX0VYVEhPU1RfSVBDX1JFQURZJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MhLnJlbW92ZUxpc3RlbmVyKCdtZXNzYWdlJywgbWVzc2FnZUxpc3RlbmVyKTtcblx0XHRcdFx0XHRcdHRoaXMuX3NlbmRTb2NrZXRUb0V4dGVuc2lvbkhvc3QodGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MhLCB0aGlzLl9jb25uZWN0aW9uRGF0YSEpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbkRhdGEgPSBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3Mub24oJ21lc3NhZ2UnLCBtZXNzYWdlTGlzdGVuZXIpO1xuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ0Vycm9yKGBGYWlsZWQgdG8gc3RhcnQgZXh0ZW5zaW9uIGhvc3QgcHJvY2Vzc2ApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR0aGlzLl9jbGVhblJlc291cmNlcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xpc3Rlbk9uUGlwZSgpOiBQcm9taXNlPHsgcGlwZU5hbWU6IHN0cmluZzsgbmFtZWRQaXBlU2VydmVyOiBuZXQuU2VydmVyIH0+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8eyBwaXBlTmFtZTogc3RyaW5nOyBuYW1lZFBpcGVTZXJ2ZXI6IG5ldC5TZXJ2ZXIgfT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgcGlwZU5hbWUgPSBjcmVhdGVSYW5kb21JUENIYW5kbGUoKTtcblxuXHRcdFx0Y29uc3QgbmFtZWRQaXBlU2VydmVyID0gbmV0LmNyZWF0ZVNlcnZlcigpO1xuXHRcdFx0bmFtZWRQaXBlU2VydmVyLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRuYW1lZFBpcGVTZXJ2ZXIubGlzdGVuKHBpcGVOYW1lLCAoKSA9PiB7XG5cdFx0XHRcdG5hbWVkUGlwZVNlcnZlcj8ucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdFx0cmVzb2x2ZSh7IHBpcGVOYW1lLCBuYW1lZFBpcGVTZXJ2ZXIgfSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiByZWFkQ2FzZUluc2Vuc2l0aXZlKGVudjogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfSwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXRoS2V5cyA9IE9iamVjdC5rZXlzKGVudikuZmlsdGVyKGsgPT4gay50b0xvd2VyQ2FzZSgpID09PSBrZXkudG9Mb3dlckNhc2UoKSk7XG5cdGNvbnN0IHBhdGhLZXkgPSBwYXRoS2V5cy5sZW5ndGggPiAwID8gcGF0aEtleXNbMF0gOiBrZXk7XG5cdHJldHVybiBlbnZbcGF0aEtleV07XG59XG5cbmZ1bmN0aW9uIHNldENhc2VJbnNlbnNpdGl2ZShlbnY6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9LCBrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCBwYXRoS2V5cyA9IE9iamVjdC5rZXlzKGVudikuZmlsdGVyKGsgPT4gay50b0xvd2VyQ2FzZSgpID09PSBrZXkudG9Mb3dlckNhc2UoKSk7XG5cdGNvbnN0IHBhdGhLZXkgPSBwYXRoS2V5cy5sZW5ndGggPiAwID8gcGF0aEtleXNbMF0gOiBrZXk7XG5cdGVudltwYXRoS2V5XSA9IHZhbHVlO1xufVxuXG5mdW5jdGlvbiByZW1vdmVOdWxscyhlbnY6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB8IG51bGwgfSk6IHZvaWQge1xuXHQvLyBEb24ndCBkZWxldGUgd2hpbGUgaXRlcmF0aW5nIHRoZSBvYmplY3QgaXRzZWxmXG5cdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGVudikpIHtcblx0XHRpZiAoZW52W2tleV0gPT09IG51bGwpIHtcblx0XHRcdGRlbGV0ZSBlbnZba2V5XTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBQ3BCLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVcsWUFBWTtBQUNoQyxTQUE4QixpQkFBaUI7QUFDL0MsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyx1QkFBdUIsWUFBWSwyQkFBMkI7QUFDdkUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxzQkFBc0IseUJBQXlC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
