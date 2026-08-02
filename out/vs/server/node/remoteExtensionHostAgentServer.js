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
import * as fs from "fs";
import * as net from "net";
import { createRequire } from "node:module";
import { performance } from "perf_hooks";
import * as url from "url";
import { VSBuffer } from "../../base/common/buffer.js";
import { CharCode } from "../../base/common/charCode.js";
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from "../../base/common/errors.js";
import { isEqualOrParent } from "../../base/common/extpath.js";
import { Disposable, DisposableMap, DisposableStore } from "../../base/common/lifecycle.js";
import { connectionTokenQueryName, FileAccess, getServerProductSegment, Schemas } from "../../base/common/network.js";
import { dirname, join } from "../../base/common/path.js";
import * as perf from "../../base/common/performance.js";
import * as platform from "../../base/common/platform.js";
import { createRegExp, escapeRegExpCharacters } from "../../base/common/strings.js";
import { URI } from "../../base/common/uri.js";
import { generateUuid } from "../../base/common/uuid.js";
import { getOSReleaseInfo } from "../../base/node/osReleaseInfo.js";
import { findFreePort } from "../../base/node/ports.js";
import { addUNCHostToAllowlist, disableUNCAccessRestrictions } from "../../base/node/unc.js";
import { PersistentProtocol } from "../../base/parts/ipc/common/ipc.net.js";
import { NodeSocket, upgradeToISocket, WebSocketNodeSocket } from "../../base/parts/ipc/node/ipc.net.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../platform/log/common/log.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { ConnectionType } from "../../platform/remote/common/remoteAgentConnection.js";
import { ITelemetryService } from "../../platform/telemetry/common/telemetry.js";
import { ExtensionHostConnection } from "./extensionHostConnection.js";
import { ManagementConnection } from "./remoteExtensionManagement.js";
import { determineServerConnectionToken, requestHasValidConnectionToken as httpRequestHasValidConnectionToken, ServerConnectionTokenParseError, ServerConnectionTokenType } from "./serverConnectionToken.js";
import { IServerEnvironmentService } from "./serverEnvironmentService.js";
import { IServerLifetimeService } from "./serverLifetimeService.js";
import { setupServerServices } from "./serverServices.js";
import { CacheControl, serveError, serveFile, WebClientServer } from "./webClientServer.js";
const require2 = createRequire(import.meta.url);
let RemoteExtensionHostAgentServer = class extends Disposable {
  constructor(_socketServer, _connectionToken, _vsdaMod, hasWebClient, serverBasePath, _environmentService, _productService, _logService, _instantiationService, _serverLifetimeService) {
    super();
    this._socketServer = _socketServer;
    this._connectionToken = _connectionToken;
    this._vsdaMod = _vsdaMod;
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._serverLifetimeService = _serverLifetimeService;
    this._extHostLifetimeTokens = this._register(new DisposableMap());
    this._webEndpointOriginChecker = WebEndpointOriginChecker.create(this._productService);
    if (serverBasePath !== void 0 && serverBasePath.charCodeAt(serverBasePath.length - 1) === CharCode.Slash) {
      serverBasePath = serverBasePath.substring(0, serverBasePath.length - 1);
    }
    this._serverBasePath = serverBasePath;
    this._serverProductPath = `/${getServerProductSegment(_productService)}`;
    this._extHostConnections = /* @__PURE__ */ Object.create(null);
    this._managementConnections = /* @__PURE__ */ Object.create(null);
    this._allReconnectionTokens = /* @__PURE__ */ new Set();
    this._webClientServer = hasWebClient ? this._instantiationService.createInstance(WebClientServer, this._connectionToken, serverBasePath ?? "/", this._serverProductPath) : null;
    this._logService.info(`Extension host agent started.`);
    this._reconnectionGraceTime = this._environmentService.reconnectionGraceTime;
  }
  async handleRequest(req, res) {
    if (req.method !== "GET") {
      return serveError(req, res, 405, `Unsupported method ${req.method}`);
    }
    if (!req.url) {
      return serveError(req, res, 400, `Bad request.`);
    }
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;
    if (!pathname) {
      return serveError(req, res, 400, `Bad request.`);
    }
    if (this._serverBasePath !== void 0 && pathname.startsWith(this._serverBasePath)) {
      pathname = pathname.substring(this._serverBasePath.length) || "/";
    }
    if (pathname.startsWith(this._serverProductPath) && pathname.charCodeAt(this._serverProductPath.length) === CharCode.Slash) {
      pathname = pathname.substring(this._serverProductPath.length);
    }
    if (pathname === "/version") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return void res.end(this._productService.commit || "");
    }
    if (pathname === "/delay-shutdown") {
      this._serverLifetimeService.delay();
      res.writeHead(200);
      return void res.end("OK");
    }
    if (!httpRequestHasValidConnectionToken(this._connectionToken, req, parsedUrl)) {
      return serveError(req, res, 403, `Forbidden.`);
    }
    if (pathname === "/vscode-remote-resource") {
      const desiredPath = parsedUrl.query["path"];
      if (typeof desiredPath !== "string") {
        return serveError(req, res, 400, `Bad request.`);
      }
      let filePath;
      try {
        filePath = URI.from({ scheme: Schemas.file, path: desiredPath }).fsPath;
      } catch (err) {
        return serveError(req, res, 400, `Bad request.`);
      }
      const responseHeaders = /* @__PURE__ */ Object.create(null);
      if (this._environmentService.isBuilt) {
        if (isEqualOrParent(filePath, this._environmentService.builtinExtensionsPath, !platform.isLinux) || isEqualOrParent(filePath, this._environmentService.extensionsPath, !platform.isLinux)) {
          responseHeaders["Cache-Control"] = "public, max-age=31536000";
        }
      }
      responseHeaders["Vary"] = "Origin";
      const requestOrigin = req.headers["origin"];
      if (requestOrigin && this._webEndpointOriginChecker.matches(requestOrigin)) {
        responseHeaders["Access-Control-Allow-Origin"] = requestOrigin;
      }
      return serveFile(filePath, CacheControl.ETAG, this._logService, req, res, responseHeaders);
    }
    if (this._webClientServer) {
      this._webClientServer.handle(req, res, parsedUrl, pathname);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    return void res.end("Not found");
  }
  handleUpgrade(req, socket) {
    let reconnectionToken = generateUuid();
    let isReconnection = false;
    let skipWebSocketFrames = false;
    if (req.url) {
      const query = url.parse(req.url, true).query;
      if (typeof query.reconnectionToken === "string") {
        reconnectionToken = query.reconnectionToken;
      }
      if (query.reconnection === "true") {
        isReconnection = true;
      }
      if (query.skipWebSocketFrames === "true") {
        skipWebSocketFrames = true;
      }
    }
    const upgraded = upgradeToISocket(req, socket, {
      debugLabel: `server-connection-${reconnectionToken}`,
      skipWebSocketFrames,
      disableWebSocketCompression: this._environmentService.args["disable-websocket-compression"]
    });
    if (!upgraded) {
      return;
    }
    this._handleWebSocketConnection(upgraded, isReconnection, reconnectionToken);
  }
  handleServerError(err) {
    this._logService.error(`Error occurred in server`);
    this._logService.error(err);
  }
  // Eventually cleanup
  _getRemoteAddress(socket) {
    let _socket;
    if (socket instanceof NodeSocket) {
      _socket = socket.socket;
    } else {
      _socket = socket.socket.socket;
    }
    return _socket.remoteAddress || `<unknown>`;
  }
  async _rejectWebSocketConnection(logPrefix, protocol, reason) {
    const socket = protocol.getSocket();
    this._logService.error(`${logPrefix} ${reason}.`);
    const errMessage = {
      type: "error",
      reason
    };
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(errMessage)));
    protocol.dispose();
    await socket.drain();
    socket.dispose();
  }
  /**
   * NOTE: Avoid using await in this method!
   * The problem is that await introduces a process.nextTick due to the implicit Promise.then
   * This can lead to some bytes being received and interpreted and a control message being emitted before the next listener has a chance to be registered.
   */
  _handleWebSocketConnection(socket, isReconnection, reconnectionToken) {
    const remoteAddress = this._getRemoteAddress(socket);
    const logPrefix = `[${remoteAddress}][${reconnectionToken.substr(0, 8)}]`;
    const protocol = new PersistentProtocol({ socket });
    const validator = this._vsdaMod ? new this._vsdaMod.validator() : null;
    const signer = this._vsdaMod ? new this._vsdaMod.signer() : null;
    let State;
    ((State2) => {
      State2[State2["WaitingForAuth"] = 0] = "WaitingForAuth";
      State2[State2["WaitingForConnectionType"] = 1] = "WaitingForConnectionType";
      State2[State2["Done"] = 2] = "Done";
      State2[State2["Error"] = 3] = "Error";
    })(State || (State = {}));
    let state = 0 /* WaitingForAuth */;
    const rejectWebSocketConnection = (msg) => {
      state = 3 /* Error */;
      listener.dispose();
      this._rejectWebSocketConnection(logPrefix, protocol, msg);
    };
    const listener = protocol.onControlMessage((raw) => {
      if (state === 0 /* WaitingForAuth */) {
        let msg1;
        try {
          msg1 = JSON.parse(raw.toString());
        } catch (err) {
          return rejectWebSocketConnection(`Malformed first message`);
        }
        if (msg1.type !== "auth") {
          return rejectWebSocketConnection(`Invalid first message`);
        }
        if (this._connectionToken.type === ServerConnectionTokenType.Mandatory && !this._connectionToken.validate(msg1.auth)) {
          return rejectWebSocketConnection(`Unauthorized client refused: auth mismatch`);
        }
        let signedData = generateUuid();
        if (signer) {
          try {
            signedData = signer.sign(msg1.data);
          } catch (e) {
          }
        }
        let someText = generateUuid();
        if (validator) {
          try {
            someText = validator.createNewMessage(someText);
          } catch (e) {
          }
        }
        const signRequest = {
          type: "sign",
          data: someText,
          signedData
        };
        protocol.sendControl(VSBuffer.fromString(JSON.stringify(signRequest)));
        state = 1 /* WaitingForConnectionType */;
      } else if (state === 1 /* WaitingForConnectionType */) {
        let msg2;
        try {
          msg2 = JSON.parse(raw.toString());
        } catch (err) {
          return rejectWebSocketConnection(`Malformed second message`);
        }
        if (msg2.type !== "connectionType") {
          return rejectWebSocketConnection(`Invalid second message`);
        }
        if (typeof msg2.signedData !== "string") {
          return rejectWebSocketConnection(`Invalid second message field type`);
        }
        const rendererCommit = msg2.commit;
        const myCommit = this._productService.commit;
        if (rendererCommit && myCommit) {
          if (rendererCommit !== myCommit) {
            return rejectWebSocketConnection(`Client refused: version mismatch`);
          }
        }
        let valid = false;
        if (!validator) {
          valid = true;
        } else if (this._connectionToken.validate(msg2.signedData)) {
          valid = true;
        } else {
          try {
            valid = validator.validate(msg2.signedData) === "ok";
          } catch (e) {
          }
        }
        if (!valid) {
          if (this._environmentService.isBuilt) {
            return rejectWebSocketConnection(`Unauthorized client refused`);
          } else {
            this._logService.error(`${logPrefix} Unauthorized client handshake failed but we proceed because of dev mode.`);
          }
        }
        for (const key in this._managementConnections) {
          const managementConnection = this._managementConnections[key];
          managementConnection.shortenReconnectionGraceTimeIfNecessary();
        }
        for (const key in this._extHostConnections) {
          const extHostConnection = this._extHostConnections[key];
          extHostConnection.shortenReconnectionGraceTimeIfNecessary();
        }
        state = 2 /* Done */;
        listener.dispose();
        this._handleConnectionType(remoteAddress, logPrefix, protocol, socket, isReconnection, reconnectionToken, msg2);
      }
    });
  }
  async _handleConnectionType(remoteAddress, _logPrefix, protocol, socket, isReconnection, reconnectionToken, msg) {
    const logPrefix = msg.desiredConnectionType === ConnectionType.Management ? `${_logPrefix}[ManagementConnection]` : msg.desiredConnectionType === ConnectionType.ExtensionHost ? `${_logPrefix}[ExtensionHostConnection]` : _logPrefix;
    if (msg.desiredConnectionType === ConnectionType.Management) {
      if (socket instanceof WebSocketNodeSocket) {
        socket.setRecordInflateBytes(false);
      }
      if (isReconnection) {
        if (!this._managementConnections[reconnectionToken]) {
          if (!this._allReconnectionTokens.has(reconnectionToken)) {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (never seen)`);
          } else {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (seen before)`);
          }
        }
        protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: "ok" })));
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        this._managementConnections[reconnectionToken].acceptReconnection(remoteAddress, socket, dataChunk);
      } else {
        if (this._managementConnections[reconnectionToken]) {
          return this._rejectWebSocketConnection(logPrefix, protocol, `Duplicate reconnection token`);
        }
        protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: "ok" })));
        const con = new ManagementConnection(this._logService, reconnectionToken, remoteAddress, protocol, this._reconnectionGraceTime);
        this._socketServer.acceptConnection(con.protocol, con.onClose);
        this._managementConnections[reconnectionToken] = con;
        this._allReconnectionTokens.add(reconnectionToken);
        con.onClose(() => {
          delete this._managementConnections[reconnectionToken];
        });
      }
    } else if (msg.desiredConnectionType === ConnectionType.ExtensionHost) {
      const startParams0 = msg.args || { language: "en" };
      const startParams = await this._updateWithFreeDebugPort(startParams0);
      if (startParams.port) {
        this._logService.trace(`${logPrefix} - startParams debug port ${startParams.port}`);
      }
      this._logService.trace(`${logPrefix} - startParams language: ${startParams.language}`);
      this._logService.trace(`${logPrefix} - startParams env: ${JSON.stringify(startParams.env)}`);
      if (isReconnection) {
        if (!this._extHostConnections[reconnectionToken]) {
          if (!this._allReconnectionTokens.has(reconnectionToken)) {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (never seen)`);
          } else {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (seen before)`);
          }
        }
        protocol.sendPause();
        protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        this._extHostConnections[reconnectionToken].acceptReconnection(remoteAddress, socket, dataChunk);
      } else {
        if (this._extHostConnections[reconnectionToken]) {
          return this._rejectWebSocketConnection(logPrefix, protocol, `Duplicate reconnection token`);
        }
        protocol.sendPause();
        protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        const con = this._instantiationService.createInstance(ExtensionHostConnection, reconnectionToken, remoteAddress, socket, dataChunk);
        this._extHostConnections[reconnectionToken] = con;
        this._allReconnectionTokens.add(reconnectionToken);
        this._extHostLifetimeTokens.set(reconnectionToken, this._serverLifetimeService.active(`ExtensionHost:${reconnectionToken.substring(0, 8)}`));
        con.onClose(() => {
          con.dispose();
          delete this._extHostConnections[reconnectionToken];
          this._extHostLifetimeTokens.deleteAndDispose(reconnectionToken);
        });
        con.start(startParams).catch((error) => {
          this._logService.error(`${logPrefix} Failed to start extension host connection:`, error);
        });
      }
    } else if (msg.desiredConnectionType === ConnectionType.Tunnel) {
      if (socket instanceof WebSocketNodeSocket) {
        socket.setRecordInflateBytes(false);
      }
      const tunnelStartParams = msg.args;
      this._createTunnel(protocol, tunnelStartParams);
    } else {
      return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown initial data received`);
    }
  }
  async _createTunnel(protocol, tunnelStartParams) {
    let localSocket;
    try {
      localSocket = await this._connectTunnelSocket(tunnelStartParams.host, tunnelStartParams.port);
    } catch (err) {
      this._logService.error(`[remote-connection] Failed to connect tunnel to ${tunnelStartParams.host}:${tunnelStartParams.port}:`, err);
      const reason = err instanceof Error ? err.message : String(err);
      const errorMessage = { type: "error", reason };
      protocol.sendControl(VSBuffer.fromString(JSON.stringify(errorMessage)));
      const socket = protocol.getSocket();
      protocol.dispose();
      await socket.drain();
      socket.dispose();
      return;
    }
    const okMessage = { type: "ok" };
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(okMessage)));
    const remoteNodeSocket = protocol.getSocket();
    const remoteSocket = remoteNodeSocket.socket;
    const dataChunk = protocol.readEntireBuffer();
    protocol.dispose();
    remoteNodeSocket.dispose(false);
    if (dataChunk.byteLength > 0) {
      localSocket.write(dataChunk.buffer);
    }
    localSocket.on("end", () => remoteSocket.end());
    localSocket.on("close", () => remoteSocket.end());
    localSocket.on("error", () => remoteSocket.destroy());
    remoteSocket.on("end", () => localSocket.end());
    remoteSocket.on("close", () => localSocket.end());
    remoteSocket.on("error", () => localSocket.destroy());
    localSocket.pipe(remoteSocket);
    remoteSocket.pipe(localSocket);
  }
  _connectTunnelSocket(host, port) {
    return new Promise((c, e) => {
      const socket = net.createConnection(
        {
          host,
          port,
          autoSelectFamily: true
        },
        () => {
          socket.removeListener("error", e);
          socket.pause();
          c(socket);
        }
      );
      socket.once("error", e);
    });
  }
  _updateWithFreeDebugPort(startParams) {
    if (typeof startParams.port === "number") {
      return findFreePort(
        startParams.port,
        10,
        5e3
        /* try up to 5 seconds */
      ).then((freePort) => {
        startParams.port = freePort;
        return startParams;
      });
    }
    startParams.debugId = void 0;
    startParams.port = void 0;
    startParams.break = void 0;
    return Promise.resolve(startParams);
  }
};
RemoteExtensionHostAgentServer = __decorateClass([
  __decorateParam(5, IServerEnvironmentService),
  __decorateParam(6, IProductService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IServerLifetimeService)
], RemoteExtensionHostAgentServer);
async function createServer(address, args, REMOTE_DATA_FOLDER) {
  const connectionToken = await determineServerConnectionToken(args);
  if (connectionToken instanceof ServerConnectionTokenParseError) {
    console.warn(connectionToken.message);
    process.exit(1);
  }
  function initUnexpectedErrorHandler(handler) {
    setUnexpectedErrorHandler((err) => {
      if (isSigPipeError(err) && err.stack && /unexpectedErrorHandler/.test(err.stack)) {
        return;
      }
      handler(err);
    });
  }
  const unloggedErrors = [];
  initUnexpectedErrorHandler((error) => {
    unloggedErrors.push(error);
    console.error(error);
  });
  let didLogAboutSIGPIPE = false;
  process.on("SIGPIPE", () => {
    if (!didLogAboutSIGPIPE) {
      didLogAboutSIGPIPE = true;
      onUnexpectedError(new Error(`Unexpected SIGPIPE`));
    }
  });
  const disposables = new DisposableStore();
  const { socketServer, instantiationService } = await setupServerServices(connectionToken, args, REMOTE_DATA_FOLDER, disposables);
  instantiationService.invokeFunction((accessor) => {
    const logService = accessor.get(ILogService);
    unloggedErrors.forEach((error) => logService.error(error));
    unloggedErrors.length = 0;
    initUnexpectedErrorHandler((error) => logService.error(error));
  });
  instantiationService.invokeFunction((accessor) => {
    const configurationService = accessor.get(IConfigurationService);
    if (platform.isWindows) {
      if (configurationService.getValue("security.restrictUNCAccess") === false) {
        disableUNCAccessRestrictions();
      } else {
        addUNCHostToAllowlist(configurationService.getValue("security.allowedUNCHosts"));
      }
    }
  });
  instantiationService.invokeFunction((accessor) => {
    const logService = accessor.get(ILogService);
    if (platform.isWindows && process.env.HOMEDRIVE && process.env.HOMEPATH) {
      const homeDirModulesPath = join(process.env.HOMEDRIVE, "node_modules");
      const userDir = dirname(join(process.env.HOMEDRIVE, process.env.HOMEPATH));
      const userDirModulesPath = join(userDir, "node_modules");
      if (fs.existsSync(homeDirModulesPath) || fs.existsSync(userDirModulesPath)) {
        const message = `

*
* !!!! Server terminated due to presence of CVE-2020-1416 !!!!
*
* Please remove the following directories and re-try
* ${homeDirModulesPath}
* ${userDirModulesPath}
*
* For more information on the vulnerability https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2020-1416
*

`;
        logService.warn(message);
        console.warn(message);
        process.exit(0);
      }
    }
  });
  const vsdaMod = instantiationService.invokeFunction((accessor) => {
    const logService = accessor.get(ILogService);
    const hasVSDA = fs.existsSync(join(FileAccess.asFileUri("").fsPath, "../node_modules/vsda"));
    if (hasVSDA) {
      try {
        return require2("vsda");
      } catch (err) {
        logService.error(err);
      }
    }
    return null;
  });
  let serverBasePath = args["server-base-path"];
  if (serverBasePath && !serverBasePath.startsWith("/")) {
    serverBasePath = `/${serverBasePath}`;
  }
  const hasWebClient = fs.existsSync(FileAccess.asFileUri(`vs/code/browser/workbench/workbench.html`).fsPath);
  if (hasWebClient && address && typeof address !== "string") {
    const queryPart = connectionToken.type !== ServerConnectionTokenType.None ? `?${connectionTokenQueryName}=${connectionToken.value}` : "";
    console.log(`Web UI available at http://localhost${address.port === 80 ? "" : `:${address.port}`}${serverBasePath ?? ""}${queryPart}`);
  }
  const remoteExtensionHostAgentServer = instantiationService.createInstance(RemoteExtensionHostAgentServer, socketServer, connectionToken, vsdaMod, hasWebClient, serverBasePath);
  perf.mark("code/server/ready");
  const currentTime = performance.now();
  const vscodeServerStartTime = global.vscodeServerStartTime;
  const vscodeServerListenTime = global.vscodeServerListenTime;
  const vscodeServerCodeLoadedTime = global.vscodeServerCodeLoadedTime;
  instantiationService.invokeFunction(async (accessor) => {
    const telemetryService = accessor.get(ITelemetryService);
    telemetryService.publicLog2("serverStart", {
      startTime: vscodeServerStartTime,
      startedTime: vscodeServerListenTime,
      codeLoadedTime: vscodeServerCodeLoadedTime,
      readyTime: currentTime
    });
    if (platform.isLinux) {
      const logService = accessor.get(ILogService);
      const releaseInfo = await getOSReleaseInfo(logService.error.bind(logService));
      if (releaseInfo) {
        telemetryService.publicLog2("serverPlatformInfo", {
          platformId: releaseInfo.id,
          platformVersionId: releaseInfo.version_id,
          platformIdLike: releaseInfo.id_like
        });
      }
    }
  });
  if (args["print-startup-performance"]) {
    let output = "";
    output += `Start-up time: ${vscodeServerListenTime - vscodeServerStartTime}
`;
    output += `Code loading time: ${vscodeServerCodeLoadedTime - vscodeServerStartTime}
`;
    output += `Initialized time: ${currentTime - vscodeServerStartTime}
`;
    output += `
`;
    console.log(output);
  }
  return remoteExtensionHostAgentServer;
}
class WebEndpointOriginChecker {
  constructor(_originRegExp) {
    this._originRegExp = _originRegExp;
  }
  static create(productService) {
    const webEndpointUrlTemplate = productService.webEndpointUrlTemplate;
    const commit = productService.commit;
    const quality = productService.quality;
    if (!webEndpointUrlTemplate || !commit || !quality) {
      return new WebEndpointOriginChecker(null);
    }
    const uuid = generateUuid();
    const exampleUrl = new URL(
      webEndpointUrlTemplate.replace("{{uuid}}", uuid).replace("{{commit}}", commit).replace("{{quality}}", quality)
    );
    const exampleOrigin = exampleUrl.origin;
    const originRegExpSource = escapeRegExpCharacters(exampleOrigin).replace(uuid, "[a-zA-Z0-9\\-]+");
    try {
      const originRegExp = createRegExp(`^${originRegExpSource}$`, true, { matchCase: false });
      return new WebEndpointOriginChecker(originRegExp);
    } catch (err) {
      return new WebEndpointOriginChecker(null);
    }
  }
  matches(origin) {
    if (!this._originRegExp) {
      return false;
    }
    return this._originRegExp.test(origin);
  }
}
export {
  createServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3NlcnZlci9ub2RlL3JlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudFNlcnZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ25vZGU6bW9kdWxlJztcbmltcG9ydCB7IHBlcmZvcm1hbmNlIH0gZnJvbSAncGVyZl9ob29rcyc7XG5pbXBvcnQgKiBhcyB1cmwgZnJvbSAndXJsJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgaXNTaWdQaXBlRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGlzRXF1YWxPclBhcmVudCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZSwgRmlsZUFjY2VzcywgZ2V0U2VydmVyUHJvZHVjdFNlZ21lbnQsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBlcmYgZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY3JlYXRlUmVnRXhwLCBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBnZXRPU1JlbGVhc2VJbmZvIH0gZnJvbSAnLi4vLi4vYmFzZS9ub2RlL29zUmVsZWFzZUluZm8uanMnO1xuaW1wb3J0IHsgZmluZEZyZWVQb3J0IH0gZnJvbSAnLi4vLi4vYmFzZS9ub2RlL3BvcnRzLmpzJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCwgZGlzYWJsZVVOQ0FjY2Vzc1Jlc3RyaWN0aW9ucyB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgUGVyc2lzdGVudFByb3RvY29sIH0gZnJvbSAnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgTm9kZVNvY2tldCwgdXBncmFkZVRvSVNvY2tldCwgV2ViU29ja2V0Tm9kZVNvY2tldCB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25uZWN0aW9uVHlwZSwgQ29ubmVjdGlvblR5cGVSZXF1ZXN0LCBFcnJvck1lc3NhZ2UsIEhhbmRzaGFrZU1lc3NhZ2UsIElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXMsIElUdW5uZWxDb25uZWN0aW9uU3RhcnRQYXJhbXMsIE9LTWVzc2FnZSwgU2lnblJlcXVlc3QgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudENvbm5lY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdENvbm5lY3Rpb24gfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IE1hbmFnZW1lbnRDb25uZWN0aW9uIH0gZnJvbSAnLi9yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGRldGVybWluZVNlcnZlckNvbm5lY3Rpb25Ub2tlbiwgcmVxdWVzdEhhc1ZhbGlkQ29ubmVjdGlvblRva2VuIGFzIGh0dHBSZXF1ZXN0SGFzVmFsaWRDb25uZWN0aW9uVG9rZW4sIFNlcnZlckNvbm5lY3Rpb25Ub2tlbiwgU2VydmVyQ29ubmVjdGlvblRva2VuUGFyc2VFcnJvciwgU2VydmVyQ29ubmVjdGlvblRva2VuVHlwZSB9IGZyb20gJy4vc2VydmVyQ29ubmVjdGlvblRva2VuLmpzJztcbmltcG9ydCB7IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UsIFNlcnZlclBhcnNlZEFyZ3MgfSBmcm9tICcuL3NlcnZlckVudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2VydmVyTGlmZXRpbWVTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2ZXJMaWZldGltZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2V0dXBTZXJ2ZXJTZXJ2aWNlcywgU29ja2V0U2VydmVyIH0gZnJvbSAnLi9zZXJ2ZXJTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDYWNoZUNvbnRyb2wsIHNlcnZlRXJyb3IsIHNlcnZlRmlsZSwgV2ViQ2xpZW50U2VydmVyIH0gZnJvbSAnLi93ZWJDbGllbnRTZXJ2ZXIuanMnO1xuY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcblxuZGVjbGFyZSBuYW1lc3BhY2UgdnNkYSB7XG5cdC8vIHRoZSBzaWduZXIgaXMgYSBuYXRpdmUgbW9kdWxlIHRoYXQgZm9yIGhpc3RvcmljYWwgcmVhc29ucyB1c2VzIGEgbG93ZXIgY2FzZSBjbGFzcyBuYW1lXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0ZXhwb3J0IGNsYXNzIHNpZ25lciB7XG5cdFx0c2lnbihhcmc6IHN0cmluZyk6IHN0cmluZztcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0ZXhwb3J0IGNsYXNzIHZhbGlkYXRvciB7XG5cdFx0Y3JlYXRlTmV3TWVzc2FnZShhcmc6IHN0cmluZyk6IHN0cmluZztcblx0XHR2YWxpZGF0ZShhcmc6IHN0cmluZyk6ICdvaycgfCAnZXJyb3InO1xuXHR9XG59XG5cbmNsYXNzIFJlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudFNlcnZlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VydmVyQVBJIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Q29ubmVjdGlvbnM6IHsgW3JlY29ubmVjdGlvblRva2VuOiBzdHJpbmddOiBFeHRlbnNpb25Ib3N0Q29ubmVjdGlvbiB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYW5hZ2VtZW50Q29ubmVjdGlvbnM6IHsgW3JlY29ubmVjdGlvblRva2VuOiBzdHJpbmddOiBNYW5hZ2VtZW50Q29ubmVjdGlvbiB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxSZWNvbm5lY3Rpb25Ub2tlbnM6IFNldDxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0TGlmZXRpbWVUb2tlbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93ZWJDbGllbnRTZXJ2ZXI6IFdlYkNsaWVudFNlcnZlciB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYkVuZHBvaW50T3JpZ2luQ2hlY2tlcjogV2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3Rpb25HcmFjZVRpbWU6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJCYXNlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJQcm9kdWN0UGF0aDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldFNlcnZlcjogU29ja2V0U2VydmVyPFJlbW90ZUFnZW50Q29ubmVjdGlvbkNvbnRleHQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25Ub2tlbjogU2VydmVyQ29ubmVjdGlvblRva2VuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZzZGFNb2Q6IHR5cGVvZiB2c2RhIHwgbnVsbCxcblx0XHRoYXNXZWJDbGllbnQ6IGJvb2xlYW4sXG5cdFx0c2VydmVyQmFzZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASVNlcnZlckVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXJ2ZXJMaWZldGltZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VydmVyTGlmZXRpbWVTZXJ2aWNlOiBJU2VydmVyTGlmZXRpbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3dlYkVuZHBvaW50T3JpZ2luQ2hlY2tlciA9IFdlYkVuZHBvaW50T3JpZ2luQ2hlY2tlci5jcmVhdGUodGhpcy5fcHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0aWYgKHNlcnZlckJhc2VQYXRoICE9PSB1bmRlZmluZWQgJiYgc2VydmVyQmFzZVBhdGguY2hhckNvZGVBdChzZXJ2ZXJCYXNlUGF0aC5sZW5ndGggLSAxKSA9PT0gQ2hhckNvZGUuU2xhc2gpIHtcblx0XHRcdC8vIFJlbW92ZSB0cmFpbGluZyBzbGFzaCBmcm9tIGJhc2UgcGF0aFxuXHRcdFx0c2VydmVyQmFzZVBhdGggPSBzZXJ2ZXJCYXNlUGF0aC5zdWJzdHJpbmcoMCwgc2VydmVyQmFzZVBhdGgubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NlcnZlckJhc2VQYXRoID0gc2VydmVyQmFzZVBhdGg7IC8vIHVuZGVmaW5lZCBvciBzdGFydHMgd2l0aCBhIHNsYXNoXG5cdFx0dGhpcy5fc2VydmVyUHJvZHVjdFBhdGggPSBgLyR7Z2V0U2VydmVyUHJvZHVjdFNlZ21lbnQoX3Byb2R1Y3RTZXJ2aWNlKX1gOyAvLyBzdGFydHMgd2l0aCBhIHNsYXNoXG5cdFx0dGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX2FsbFJlY29ubmVjdGlvblRva2VucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX3dlYkNsaWVudFNlcnZlciA9IChcblx0XHRcdGhhc1dlYkNsaWVudFxuXHRcdFx0XHQ/IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdlYkNsaWVudFNlcnZlciwgdGhpcy5fY29ubmVjdGlvblRva2VuLCBzZXJ2ZXJCYXNlUGF0aCA/PyAnLycsIHRoaXMuX3NlcnZlclByb2R1Y3RQYXRoKVxuXHRcdFx0XHQ6IG51bGxcblx0XHQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgRXh0ZW5zaW9uIGhvc3QgYWdlbnQgc3RhcnRlZC5gKTtcblx0XHR0aGlzLl9yZWNvbm5lY3Rpb25HcmFjZVRpbWUgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVjb25uZWN0aW9uR3JhY2VUaW1lO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZVJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT25seSBzZXJ2ZSBHRVQgcmVxdWVzdHNcblx0XHRpZiAocmVxLm1ldGhvZCAhPT0gJ0dFVCcpIHtcblx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDUsIGBVbnN1cHBvcnRlZCBtZXRob2QgJHtyZXEubWV0aG9kfWApO1xuXHRcdH1cblxuXHRcdGlmICghcmVxLnVybCkge1xuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMCwgYEJhZCByZXF1ZXN0LmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlZFVybCA9IHVybC5wYXJzZShyZXEudXJsLCB0cnVlKTtcblx0XHRsZXQgcGF0aG5hbWUgPSBwYXJzZWRVcmwucGF0aG5hbWU7XG5cblx0XHRpZiAoIXBhdGhuYW1lKSB7XG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgNDAwLCBgQmFkIHJlcXVlc3QuYCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2VydmUgZnJvbSBib3RoICcvJyBhbmQgc2VydmVyQmFzZVBhdGhcblx0XHRpZiAodGhpcy5fc2VydmVyQmFzZVBhdGggIT09IHVuZGVmaW5lZCAmJiBwYXRobmFtZS5zdGFydHNXaXRoKHRoaXMuX3NlcnZlckJhc2VQYXRoKSkge1xuXHRcdFx0cGF0aG5hbWUgPSBwYXRobmFtZS5zdWJzdHJpbmcodGhpcy5fc2VydmVyQmFzZVBhdGgubGVuZ3RoKSB8fCAnLyc7XG5cdFx0fVxuXHRcdC8vIGZvciBub3cgYWNjZXB0IGFsbCBwYXRocywgd2l0aCBvciB3aXRob3V0IHNlcnZlciBwcm9kdWN0IHBhdGhcblx0XHRpZiAocGF0aG5hbWUuc3RhcnRzV2l0aCh0aGlzLl9zZXJ2ZXJQcm9kdWN0UGF0aCkgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCh0aGlzLl9zZXJ2ZXJQcm9kdWN0UGF0aC5sZW5ndGgpID09PSBDaGFyQ29kZS5TbGFzaCkge1xuXHRcdFx0cGF0aG5hbWUgPSBwYXRobmFtZS5zdWJzdHJpbmcodGhpcy5fc2VydmVyUHJvZHVjdFBhdGgubGVuZ3RoKTtcblx0XHR9XG5cblx0XHQvLyBWZXJzaW9uXG5cdFx0aWYgKHBhdGhuYW1lID09PSAnL3ZlcnNpb24nKSB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuXHRcdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCh0aGlzLl9wcm9kdWN0U2VydmljZS5jb21taXQgfHwgJycpO1xuXHRcdH1cblxuXHRcdC8vIERlbGF5IHNodXRkb3duXG5cdFx0aWYgKHBhdGhuYW1lID09PSAnL2RlbGF5LXNodXRkb3duJykge1xuXHRcdFx0dGhpcy5fc2VydmVyTGlmZXRpbWVTZXJ2aWNlLmRlbGF5KCk7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCk7XG5cdFx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKCdPSycpO1xuXHRcdH1cblxuXHRcdGlmICghaHR0cFJlcXVlc3RIYXNWYWxpZENvbm5lY3Rpb25Ub2tlbih0aGlzLl9jb25uZWN0aW9uVG9rZW4sIHJlcSwgcGFyc2VkVXJsKSkge1xuXHRcdFx0Ly8gaW52YWxpZCBjb25uZWN0aW9uIHRva2VuXG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgNDAzLCBgRm9yYmlkZGVuLmApO1xuXHRcdH1cblxuXHRcdGlmIChwYXRobmFtZSA9PT0gJy92c2NvZGUtcmVtb3RlLXJlc291cmNlJykge1xuXHRcdFx0Ly8gSGFuZGxlIEhUVFAgcmVxdWVzdHMgZm9yIHJlc291cmNlcyByZW5kZXJlZCBpbiB0aGUgcmljaCBjbGllbnQgKGltYWdlcywgZm9udHMsIGV0Yy4pXG5cdFx0XHQvLyBUaGVzZSByZXNvdXJjZXMgY291bGQgYmUgZmlsZXMgc2hpcHBlZCB3aXRoIGV4dGVuc2lvbnMgb3IgZXZlbiB3b3Jrc3BhY2UgZmlsZXMuXG5cdFx0XHRjb25zdCBkZXNpcmVkUGF0aCA9IHBhcnNlZFVybC5xdWVyeVsncGF0aCddO1xuXHRcdFx0aWYgKHR5cGVvZiBkZXNpcmVkUGF0aCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMCwgYEJhZCByZXF1ZXN0LmApO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZmlsZVBhdGg6IHN0cmluZztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZpbGVQYXRoID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogZGVzaXJlZFBhdGggfSkuZnNQYXRoO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDAsIGBCYWQgcmVxdWVzdC5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzcG9uc2VIZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0XHRpZiAoaXNFcXVhbE9yUGFyZW50KGZpbGVQYXRoLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYnVpbHRpbkV4dGVuc2lvbnNQYXRoLCAhcGxhdGZvcm0uaXNMaW51eClcblx0XHRcdFx0XHR8fCBpc0VxdWFsT3JQYXJlbnQoZmlsZVBhdGgsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25zUGF0aCwgIXBsYXRmb3JtLmlzTGludXgpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHJlc3BvbnNlSGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ3B1YmxpYywgbWF4LWFnZT0zMTUzNjAwMCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQWxsb3cgY3Jvc3Mgb3JpZ2luIHJlcXVlc3RzIGZyb20gdGhlIHdlYiB3b3JrZXIgZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdHJlc3BvbnNlSGVhZGVyc1snVmFyeSddID0gJ09yaWdpbic7XG5cdFx0XHRjb25zdCByZXF1ZXN0T3JpZ2luID0gcmVxLmhlYWRlcnNbJ29yaWdpbiddO1xuXHRcdFx0aWYgKHJlcXVlc3RPcmlnaW4gJiYgdGhpcy5fd2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyLm1hdGNoZXMocmVxdWVzdE9yaWdpbikpIHtcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzWydBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nXSA9IHJlcXVlc3RPcmlnaW47XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2VydmVGaWxlKGZpbGVQYXRoLCBDYWNoZUNvbnRyb2wuRVRBRywgdGhpcy5fbG9nU2VydmljZSwgcmVxLCByZXMsIHJlc3BvbnNlSGVhZGVycyk7XG5cdFx0fVxuXG5cdFx0Ly8gd29ya2JlbmNoIHdlYiBVSVxuXHRcdGlmICh0aGlzLl93ZWJDbGllbnRTZXJ2ZXIpIHtcblx0XHRcdHRoaXMuX3dlYkNsaWVudFNlcnZlci5oYW5kbGUocmVxLCByZXMsIHBhcnNlZFVybCwgcGF0aG5hbWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcy53cml0ZUhlYWQoNDA0LCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCgnTm90IGZvdW5kJyk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlVXBncmFkZShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBzb2NrZXQ6IG5ldC5Tb2NrZXQpIHtcblx0XHRsZXQgcmVjb25uZWN0aW9uVG9rZW4gPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRsZXQgaXNSZWNvbm5lY3Rpb24gPSBmYWxzZTtcblx0XHRsZXQgc2tpcFdlYlNvY2tldEZyYW1lcyA9IGZhbHNlO1xuXG5cdFx0aWYgKHJlcS51cmwpIHtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gdXJsLnBhcnNlKHJlcS51cmwsIHRydWUpLnF1ZXJ5O1xuXHRcdFx0aWYgKHR5cGVvZiBxdWVyeS5yZWNvbm5lY3Rpb25Ub2tlbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW4gPSBxdWVyeS5yZWNvbm5lY3Rpb25Ub2tlbjtcblx0XHRcdH1cblx0XHRcdGlmIChxdWVyeS5yZWNvbm5lY3Rpb24gPT09ICd0cnVlJykge1xuXHRcdFx0XHRpc1JlY29ubmVjdGlvbiA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocXVlcnkuc2tpcFdlYlNvY2tldEZyYW1lcyA9PT0gJ3RydWUnKSB7XG5cdFx0XHRcdHNraXBXZWJTb2NrZXRGcmFtZXMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVwZ3JhZGVkID0gdXBncmFkZVRvSVNvY2tldChyZXEsIHNvY2tldCwge1xuXHRcdFx0ZGVidWdMYWJlbDogYHNlcnZlci1jb25uZWN0aW9uLSR7cmVjb25uZWN0aW9uVG9rZW59YCxcblx0XHRcdHNraXBXZWJTb2NrZXRGcmFtZXMsXG5cdFx0XHRkaXNhYmxlV2ViU29ja2V0Q29tcHJlc3Npb246IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydkaXNhYmxlLXdlYnNvY2tldC1jb21wcmVzc2lvbiddXG5cdFx0fSk7XG5cblx0XHRpZiAoIXVwZ3JhZGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faGFuZGxlV2ViU29ja2V0Q29ubmVjdGlvbih1cGdyYWRlZCwgaXNSZWNvbm5lY3Rpb24sIHJlY29ubmVjdGlvblRva2VuKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVTZXJ2ZXJFcnJvcihlcnI6IEVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRXJyb3Igb2NjdXJyZWQgaW4gc2VydmVyYCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHR9XG5cblx0Ly8gRXZlbnR1YWxseSBjbGVhbnVwXG5cblx0cHJpdmF0ZSBfZ2V0UmVtb3RlQWRkcmVzcyhzb2NrZXQ6IE5vZGVTb2NrZXQgfCBXZWJTb2NrZXROb2RlU29ja2V0KTogc3RyaW5nIHtcblx0XHRsZXQgX3NvY2tldDogbmV0LlNvY2tldDtcblx0XHRpZiAoc29ja2V0IGluc3RhbmNlb2YgTm9kZVNvY2tldCkge1xuXHRcdFx0X3NvY2tldCA9IHNvY2tldC5zb2NrZXQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdF9zb2NrZXQgPSBzb2NrZXQuc29ja2V0LnNvY2tldDtcblx0XHR9XG5cdFx0cmV0dXJuIF9zb2NrZXQucmVtb3RlQWRkcmVzcyB8fCBgPHVua25vd24+YDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4OiBzdHJpbmcsIHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wsIHJlYXNvbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc29ja2V0ID0gcHJvdG9jb2wuZ2V0U29ja2V0KCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9ICR7cmVhc29ufS5gKTtcblx0XHRjb25zdCBlcnJNZXNzYWdlOiBFcnJvck1lc3NhZ2UgPSB7XG5cdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0cmVhc29uOiByZWFzb25cblx0XHR9O1xuXHRcdHByb3RvY29sLnNlbmRDb250cm9sKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoZXJyTWVzc2FnZSkpKTtcblx0XHRwcm90b2NvbC5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgc29ja2V0LmRyYWluKCk7XG5cdFx0c29ja2V0LmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOT1RFOiBBdm9pZCB1c2luZyBhd2FpdCBpbiB0aGlzIG1ldGhvZCFcblx0ICogVGhlIHByb2JsZW0gaXMgdGhhdCBhd2FpdCBpbnRyb2R1Y2VzIGEgcHJvY2Vzcy5uZXh0VGljayBkdWUgdG8gdGhlIGltcGxpY2l0IFByb21pc2UudGhlblxuXHQgKiBUaGlzIGNhbiBsZWFkIHRvIHNvbWUgYnl0ZXMgYmVpbmcgcmVjZWl2ZWQgYW5kIGludGVycHJldGVkIGFuZCBhIGNvbnRyb2wgbWVzc2FnZSBiZWluZyBlbWl0dGVkIGJlZm9yZSB0aGUgbmV4dCBsaXN0ZW5lciBoYXMgYSBjaGFuY2UgdG8gYmUgcmVnaXN0ZXJlZC5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZVdlYlNvY2tldENvbm5lY3Rpb24oc29ja2V0OiBOb2RlU29ja2V0IHwgV2ViU29ja2V0Tm9kZVNvY2tldCwgaXNSZWNvbm5lY3Rpb246IGJvb2xlYW4sIHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByZW1vdGVBZGRyZXNzID0gdGhpcy5fZ2V0UmVtb3RlQWRkcmVzcyhzb2NrZXQpO1xuXHRcdGNvbnN0IGxvZ1ByZWZpeCA9IGBbJHtyZW1vdGVBZGRyZXNzfV1bJHtyZWNvbm5lY3Rpb25Ub2tlbi5zdWJzdHIoMCwgOCl9XWA7XG5cdFx0Y29uc3QgcHJvdG9jb2wgPSBuZXcgUGVyc2lzdGVudFByb3RvY29sKHsgc29ja2V0IH0pO1xuXG5cdFx0Y29uc3QgdmFsaWRhdG9yID0gdGhpcy5fdnNkYU1vZCA/IG5ldyB0aGlzLl92c2RhTW9kLnZhbGlkYXRvcigpIDogbnVsbDtcblx0XHRjb25zdCBzaWduZXIgPSB0aGlzLl92c2RhTW9kID8gbmV3IHRoaXMuX3ZzZGFNb2Quc2lnbmVyKCkgOiBudWxsO1xuXG5cdFx0Y29uc3QgZW51bSBTdGF0ZSB7XG5cdFx0XHRXYWl0aW5nRm9yQXV0aCxcblx0XHRcdFdhaXRpbmdGb3JDb25uZWN0aW9uVHlwZSxcblx0XHRcdERvbmUsXG5cdFx0XHRFcnJvclxuXHRcdH1cblx0XHRsZXQgc3RhdGUgPSBTdGF0ZS5XYWl0aW5nRm9yQXV0aDtcblxuXHRcdGNvbnN0IHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24gPSAobXNnOiBzdHJpbmcpID0+IHtcblx0XHRcdHN0YXRlID0gU3RhdGUuRXJyb3I7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9yZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGxvZ1ByZWZpeCwgcHJvdG9jb2wsIG1zZyk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gcHJvdG9jb2wub25Db250cm9sTWVzc2FnZSgocmF3KSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgPT09IFN0YXRlLldhaXRpbmdGb3JBdXRoKSB7XG5cdFx0XHRcdGxldCBtc2cxOiBIYW5kc2hha2VNZXNzYWdlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG1zZzEgPSA8SGFuZHNoYWtlTWVzc2FnZT5KU09OLnBhcnNlKHJhdy50b1N0cmluZygpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24oYE1hbGZvcm1lZCBmaXJzdCBtZXNzYWdlYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1zZzEudHlwZSAhPT0gJ2F1dGgnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24oYEludmFsaWQgZmlyc3QgbWVzc2FnZWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25Ub2tlbi50eXBlID09PSBTZXJ2ZXJDb25uZWN0aW9uVG9rZW5UeXBlLk1hbmRhdG9yeSAmJiAhdGhpcy5fY29ubmVjdGlvblRva2VuLnZhbGlkYXRlKG1zZzEuYXV0aCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0V2ViU29ja2V0Q29ubmVjdGlvbihgVW5hdXRob3JpemVkIGNsaWVudCByZWZ1c2VkOiBhdXRoIG1pc21hdGNoYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTZW5kIGBzaWduYCByZXF1ZXN0XG5cdFx0XHRcdGxldCBzaWduZWREYXRhID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdGlmIChzaWduZXIpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0c2lnbmVkRGF0YSA9IHNpZ25lci5zaWduKG1zZzEuZGF0YSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgc29tZVRleHQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0aWYgKHZhbGlkYXRvcikge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRzb21lVGV4dCA9IHZhbGlkYXRvci5jcmVhdGVOZXdNZXNzYWdlKHNvbWVUZXh0KTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNpZ25SZXF1ZXN0OiBTaWduUmVxdWVzdCA9IHtcblx0XHRcdFx0XHR0eXBlOiAnc2lnbicsXG5cdFx0XHRcdFx0ZGF0YTogc29tZVRleHQsXG5cdFx0XHRcdFx0c2lnbmVkRGF0YTogc2lnbmVkRGF0YVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHNpZ25SZXF1ZXN0KSkpO1xuXG5cdFx0XHRcdHN0YXRlID0gU3RhdGUuV2FpdGluZ0ZvckNvbm5lY3Rpb25UeXBlO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBTdGF0ZS5XYWl0aW5nRm9yQ29ubmVjdGlvblR5cGUpIHtcblxuXHRcdFx0XHRsZXQgbXNnMjogSGFuZHNoYWtlTWVzc2FnZTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRtc2cyID0gPEhhbmRzaGFrZU1lc3NhZ2U+SlNPTi5wYXJzZShyYXcudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJldHVybiByZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGBNYWxmb3JtZWQgc2Vjb25kIG1lc3NhZ2VgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobXNnMi50eXBlICE9PSAnY29ubmVjdGlvblR5cGUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24oYEludmFsaWQgc2Vjb25kIG1lc3NhZ2VgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIG1zZzIuc2lnbmVkRGF0YSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0V2ViU29ja2V0Q29ubmVjdGlvbihgSW52YWxpZCBzZWNvbmQgbWVzc2FnZSBmaWVsZCB0eXBlYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZW5kZXJlckNvbW1pdCA9IG1zZzIuY29tbWl0O1xuXHRcdFx0XHRjb25zdCBteUNvbW1pdCA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdDtcblx0XHRcdFx0aWYgKHJlbmRlcmVyQ29tbWl0ICYmIG15Q29tbWl0KSB7XG5cdFx0XHRcdFx0Ly8gUnVubmluZyBpbiB0aGUgYnVpbHQgdmVyc2lvbiB3aGVyZSBjb21taXRzIGFyZSBkZWZpbmVkXG5cdFx0XHRcdFx0aWYgKHJlbmRlcmVyQ29tbWl0ICE9PSBteUNvbW1pdCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24oYENsaWVudCByZWZ1c2VkOiB2ZXJzaW9uIG1pc21hdGNoYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHZhbGlkID0gZmFsc2U7XG5cdFx0XHRcdGlmICghdmFsaWRhdG9yKSB7XG5cdFx0XHRcdFx0dmFsaWQgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2Nvbm5lY3Rpb25Ub2tlbi52YWxpZGF0ZShtc2cyLnNpZ25lZERhdGEpKSB7XG5cdFx0XHRcdFx0Ly8gd2ViIGNsaWVudFxuXHRcdFx0XHRcdHZhbGlkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dmFsaWQgPSB2YWxpZGF0b3IudmFsaWRhdGUobXNnMi5zaWduZWREYXRhKSA9PT0gJ29rJztcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24oYFVuYXV0aG9yaXplZCBjbGllbnQgcmVmdXNlZGApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gVW5hdXRob3JpemVkIGNsaWVudCBoYW5kc2hha2UgZmFpbGVkIGJ1dCB3ZSBwcm9jZWVkIGJlY2F1c2Ugb2YgZGV2IG1vZGUuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2UgaGF2ZSByZWNlaXZlZCBhIG5ldyBjb25uZWN0aW9uLlxuXHRcdFx0XHQvLyBUaGlzIGluZGljYXRlcyB0aGF0IHRoZSBzZXJ2ZXIgb3duZXIgaGFzIGNvbm5lY3Rpdml0eS5cblx0XHRcdFx0Ly8gVGhlcmVmb3JlIHdlIHdpbGwgc2hvcnRlbiB0aGUgcmVjb25uZWN0aW9uIGdyYWNlIHBlcmlvZCBmb3IgZGlzY29ubmVjdGVkIGNvbm5lY3Rpb25zIVxuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiB0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBtYW5hZ2VtZW50Q29ubmVjdGlvbiA9IHRoaXMuX21hbmFnZW1lbnRDb25uZWN0aW9uc1trZXldO1xuXHRcdFx0XHRcdG1hbmFnZW1lbnRDb25uZWN0aW9uLnNob3J0ZW5SZWNvbm5lY3Rpb25HcmFjZVRpbWVJZk5lY2Vzc2FyeSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IGluIHRoaXMuX2V4dEhvc3RDb25uZWN0aW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IGV4dEhvc3RDb25uZWN0aW9uID0gdGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zW2tleV07XG5cdFx0XHRcdFx0ZXh0SG9zdENvbm5lY3Rpb24uc2hvcnRlblJlY29ubmVjdGlvbkdyYWNlVGltZUlmTmVjZXNzYXJ5KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzdGF0ZSA9IFN0YXRlLkRvbmU7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5faGFuZGxlQ29ubmVjdGlvblR5cGUocmVtb3RlQWRkcmVzcywgbG9nUHJlZml4LCBwcm90b2NvbCwgc29ja2V0LCBpc1JlY29ubmVjdGlvbiwgcmVjb25uZWN0aW9uVG9rZW4sIG1zZzIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQ29ubmVjdGlvblR5cGUocmVtb3RlQWRkcmVzczogc3RyaW5nLCBfbG9nUHJlZml4OiBzdHJpbmcsIHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wsIHNvY2tldDogTm9kZVNvY2tldCB8IFdlYlNvY2tldE5vZGVTb2NrZXQsIGlzUmVjb25uZWN0aW9uOiBib29sZWFuLCByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLCBtc2c6IENvbm5lY3Rpb25UeXBlUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxvZ1ByZWZpeCA9IChcblx0XHRcdG1zZy5kZXNpcmVkQ29ubmVjdGlvblR5cGUgPT09IENvbm5lY3Rpb25UeXBlLk1hbmFnZW1lbnRcblx0XHRcdFx0PyBgJHtfbG9nUHJlZml4fVtNYW5hZ2VtZW50Q29ubmVjdGlvbl1gXG5cdFx0XHRcdDogbXNnLmRlc2lyZWRDb25uZWN0aW9uVHlwZSA9PT0gQ29ubmVjdGlvblR5cGUuRXh0ZW5zaW9uSG9zdFxuXHRcdFx0XHRcdD8gYCR7X2xvZ1ByZWZpeH1bRXh0ZW5zaW9uSG9zdENvbm5lY3Rpb25dYFxuXHRcdFx0XHRcdDogX2xvZ1ByZWZpeFxuXHRcdCk7XG5cblx0XHRpZiAobXNnLmRlc2lyZWRDb25uZWN0aW9uVHlwZSA9PT0gQ29ubmVjdGlvblR5cGUuTWFuYWdlbWVudCkge1xuXHRcdFx0Ly8gVGhpcyBzaG91bGQgYmVjb21lIGEgbWFuYWdlbWVudCBjb25uZWN0aW9uXG5cdFx0XHRpZiAoc29ja2V0IGluc3RhbmNlb2YgV2ViU29ja2V0Tm9kZVNvY2tldCkge1xuXHRcdFx0XHRzb2NrZXQuc2V0UmVjb3JkSW5mbGF0ZUJ5dGVzKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzUmVjb25uZWN0aW9uKSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgYSByZWNvbm5lY3Rpb25cblx0XHRcdFx0aWYgKCF0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9hbGxSZWNvbm5lY3Rpb25Ub2tlbnMuaGFzKHJlY29ubmVjdGlvblRva2VuKSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBpcyBhbiB1bmtub3duIHJlY29ubmVjdGlvbiB0b2tlblxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4LCBwcm90b2NvbCwgYFVua25vd24gcmVjb25uZWN0aW9uIHRva2VuIChuZXZlciBzZWVuKWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBUaGlzIGlzIGEgY29ubmVjdGlvbiB0aGF0IHdhcyBzZWVuIGluIHRoZSBwYXN0LCBidXQgaXMgbm8gbG9uZ2VyIHZhbGlkXG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVqZWN0V2ViU29ja2V0Q29ubmVjdGlvbihsb2dQcmVmaXgsIHByb3RvY29sLCBgVW5rbm93biByZWNvbm5lY3Rpb24gdG9rZW4gKHNlZW4gYmVmb3JlKWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3RvY29sLnNlbmRDb250cm9sKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnb2snIH0pKSk7XG5cdFx0XHRcdGNvbnN0IGRhdGFDaHVuayA9IHByb3RvY29sLnJlYWRFbnRpcmVCdWZmZXIoKTtcblx0XHRcdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dLmFjY2VwdFJlY29ubmVjdGlvbihyZW1vdGVBZGRyZXNzLCBzb2NrZXQsIGRhdGFDaHVuayk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgYSBmcmVzaCBjb25uZWN0aW9uXG5cdFx0XHRcdGlmICh0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dKSB7XG5cdFx0XHRcdFx0Ly8gQ2Fubm90IGhhdmUgdHdvIGNvbmN1cnJlbnQgY29ubmVjdGlvbnMgdXNpbmcgdGhlIHNhbWUgcmVjb25uZWN0aW9uIHRva2VuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4LCBwcm90b2NvbCwgYER1cGxpY2F0ZSByZWNvbm5lY3Rpb24gdG9rZW5gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3RvY29sLnNlbmRDb250cm9sKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnb2snIH0pKSk7XG5cdFx0XHRcdGNvbnN0IGNvbiA9IG5ldyBNYW5hZ2VtZW50Q29ubmVjdGlvbih0aGlzLl9sb2dTZXJ2aWNlLCByZWNvbm5lY3Rpb25Ub2tlbiwgcmVtb3RlQWRkcmVzcywgcHJvdG9jb2wsIHRoaXMuX3JlY29ubmVjdGlvbkdyYWNlVGltZSk7XG5cdFx0XHRcdHRoaXMuX3NvY2tldFNlcnZlci5hY2NlcHRDb25uZWN0aW9uKGNvbi5wcm90b2NvbCwgY29uLm9uQ2xvc2UpO1xuXHRcdFx0XHR0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dID0gY29uO1xuXHRcdFx0XHR0aGlzLl9hbGxSZWNvbm5lY3Rpb25Ub2tlbnMuYWRkKHJlY29ubmVjdGlvblRva2VuKTtcblx0XHRcdFx0Y29uLm9uQ2xvc2UoKCkgPT4ge1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmIChtc2cuZGVzaXJlZENvbm5lY3Rpb25UeXBlID09PSBDb25uZWN0aW9uVHlwZS5FeHRlbnNpb25Ib3N0KSB7XG5cblx0XHRcdC8vIFRoaXMgc2hvdWxkIGJlY29tZSBhbiBleHRlbnNpb24gaG9zdCBjb25uZWN0aW9uXG5cdFx0XHRjb25zdCBzdGFydFBhcmFtczAgPSA8SVJlbW90ZUV4dGVuc2lvbkhvc3RTdGFydFBhcmFtcz5tc2cuYXJncyB8fCB7IGxhbmd1YWdlOiAnZW4nIH07XG5cdFx0XHRjb25zdCBzdGFydFBhcmFtcyA9IGF3YWl0IHRoaXMuX3VwZGF0ZVdpdGhGcmVlRGVidWdQb3J0KHN0YXJ0UGFyYW1zMCk7XG5cblx0XHRcdGlmIChzdGFydFBhcmFtcy5wb3J0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSAtIHN0YXJ0UGFyYW1zIGRlYnVnIHBvcnQgJHtzdGFydFBhcmFtcy5wb3J0fWApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IC0gc3RhcnRQYXJhbXMgbGFuZ3VhZ2U6ICR7c3RhcnRQYXJhbXMubGFuZ3VhZ2V9YCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gLSBzdGFydFBhcmFtcyBlbnY6ICR7SlNPTi5zdHJpbmdpZnkoc3RhcnRQYXJhbXMuZW52KX1gKTtcblxuXHRcdFx0aWYgKGlzUmVjb25uZWN0aW9uKSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgYSByZWNvbm5lY3Rpb25cblx0XHRcdFx0aWYgKCF0aGlzLl9leHRIb3N0Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9hbGxSZWNvbm5lY3Rpb25Ub2tlbnMuaGFzKHJlY29ubmVjdGlvblRva2VuKSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBpcyBhbiB1bmtub3duIHJlY29ubmVjdGlvbiB0b2tlblxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4LCBwcm90b2NvbCwgYFVua25vd24gcmVjb25uZWN0aW9uIHRva2VuIChuZXZlciBzZWVuKWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBUaGlzIGlzIGEgY29ubmVjdGlvbiB0aGF0IHdhcyBzZWVuIGluIHRoZSBwYXN0LCBidXQgaXMgbm8gbG9uZ2VyIHZhbGlkXG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVqZWN0V2ViU29ja2V0Q29ubmVjdGlvbihsb2dQcmVmaXgsIHByb3RvY29sLCBgVW5rbm93biByZWNvbm5lY3Rpb24gdG9rZW4gKHNlZW4gYmVmb3JlKWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3RvY29sLnNlbmRQYXVzZSgpO1xuXHRcdFx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHN0YXJ0UGFyYW1zLnBvcnQgPyB7IGRlYnVnUG9ydDogc3RhcnRQYXJhbXMucG9ydCB9IDoge30pKSk7XG5cdFx0XHRcdGNvbnN0IGRhdGFDaHVuayA9IHByb3RvY29sLnJlYWRFbnRpcmVCdWZmZXIoKTtcblx0XHRcdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9leHRIb3N0Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dLmFjY2VwdFJlY29ubmVjdGlvbihyZW1vdGVBZGRyZXNzLCBzb2NrZXQsIGRhdGFDaHVuayk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgYSBmcmVzaCBjb25uZWN0aW9uXG5cdFx0XHRcdGlmICh0aGlzLl9leHRIb3N0Q29ubmVjdGlvbnNbcmVjb25uZWN0aW9uVG9rZW5dKSB7XG5cdFx0XHRcdFx0Ly8gQ2Fubm90IGhhdmUgdHdvIGNvbmN1cnJlbnQgY29ubmVjdGlvbnMgdXNpbmcgdGhlIHNhbWUgcmVjb25uZWN0aW9uIHRva2VuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4LCBwcm90b2NvbCwgYER1cGxpY2F0ZSByZWNvbm5lY3Rpb24gdG9rZW5gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3RvY29sLnNlbmRQYXVzZSgpO1xuXHRcdFx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHN0YXJ0UGFyYW1zLnBvcnQgPyB7IGRlYnVnUG9ydDogc3RhcnRQYXJhbXMucG9ydCB9IDoge30pKSk7XG5cdFx0XHRcdGNvbnN0IGRhdGFDaHVuayA9IHByb3RvY29sLnJlYWRFbnRpcmVCdWZmZXIoKTtcblx0XHRcdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdFx0XHRjb25zdCBjb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25Ib3N0Q29ubmVjdGlvbiwgcmVjb25uZWN0aW9uVG9rZW4sIHJlbW90ZUFkZHJlc3MsIHNvY2tldCwgZGF0YUNodW5rKTtcblx0XHRcdFx0dGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXSA9IGNvbjtcblx0XHRcdFx0dGhpcy5fYWxsUmVjb25uZWN0aW9uVG9rZW5zLmFkZChyZWNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0XHRcdHRoaXMuX2V4dEhvc3RMaWZldGltZVRva2Vucy5zZXQocmVjb25uZWN0aW9uVG9rZW4sIHRoaXMuX3NlcnZlckxpZmV0aW1lU2VydmljZS5hY3RpdmUoYEV4dGVuc2lvbkhvc3Q6JHtyZWNvbm5lY3Rpb25Ub2tlbi5zdWJzdHJpbmcoMCwgOCl9YCkpO1xuXHRcdFx0XHRjb24ub25DbG9zZSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXTtcblx0XHRcdFx0XHR0aGlzLl9leHRIb3N0TGlmZXRpbWVUb2tlbnMuZGVsZXRlQW5kRGlzcG9zZShyZWNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb24uc3RhcnQoc3RhcnRQYXJhbXMpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gRmFpbGVkIHRvIHN0YXJ0IGV4dGVuc2lvbiBob3N0IGNvbm5lY3Rpb246YCwgZXJyb3IpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAobXNnLmRlc2lyZWRDb25uZWN0aW9uVHlwZSA9PT0gQ29ubmVjdGlvblR5cGUuVHVubmVsKSB7XG5cdFx0XHRpZiAoc29ja2V0IGluc3RhbmNlb2YgV2ViU29ja2V0Tm9kZVNvY2tldCkge1xuXHRcdFx0XHRzb2NrZXQuc2V0UmVjb3JkSW5mbGF0ZUJ5dGVzKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHVubmVsU3RhcnRQYXJhbXMgPSA8SVR1bm5lbENvbm5lY3Rpb25TdGFydFBhcmFtcz5tc2cuYXJncztcblx0XHRcdHRoaXMuX2NyZWF0ZVR1bm5lbChwcm90b2NvbCwgdHVubmVsU3RhcnRQYXJhbXMpO1xuXG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4LCBwcm90b2NvbCwgYFVua25vd24gaW5pdGlhbCBkYXRhIHJlY2VpdmVkYCk7XG5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVUdW5uZWwocHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbCwgdHVubmVsU3RhcnRQYXJhbXM6IElUdW5uZWxDb25uZWN0aW9uU3RhcnRQYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgbG9jYWxTb2NrZXQ6IG5ldC5Tb2NrZXQ7XG5cdFx0dHJ5IHtcblx0XHRcdGxvY2FsU29ja2V0ID0gYXdhaXQgdGhpcy5fY29ubmVjdFR1bm5lbFNvY2tldCh0dW5uZWxTdGFydFBhcmFtcy5ob3N0LCB0dW5uZWxTdGFydFBhcmFtcy5wb3J0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtyZW1vdGUtY29ubmVjdGlvbl0gRmFpbGVkIHRvIGNvbm5lY3QgdHVubmVsIHRvICR7dHVubmVsU3RhcnRQYXJhbXMuaG9zdH06JHt0dW5uZWxTdGFydFBhcmFtcy5wb3J0fTpgLCBlcnIpO1xuXHRcdFx0Y29uc3QgcmVhc29uID0gKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSk7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2U6IEVycm9yTWVzc2FnZSA9IHsgdHlwZTogJ2Vycm9yJywgcmVhc29uIH07XG5cdFx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGVycm9yTWVzc2FnZSkpKTtcblx0XHRcdGNvbnN0IHNvY2tldCA9IHByb3RvY29sLmdldFNvY2tldCgpO1xuXHRcdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgc29ja2V0LmRyYWluKCk7XG5cdFx0XHRzb2NrZXQuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9rTWVzc2FnZTogT0tNZXNzYWdlID0geyB0eXBlOiAnb2snIH07XG5cdFx0cHJvdG9jb2wuc2VuZENvbnRyb2woVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShva01lc3NhZ2UpKSk7XG5cblx0XHRjb25zdCByZW1vdGVOb2RlU29ja2V0ID0gPE5vZGVTb2NrZXQ+cHJvdG9jb2wuZ2V0U29ja2V0KCk7XG5cdFx0Y29uc3QgcmVtb3RlU29ja2V0ID0gcmVtb3RlTm9kZVNvY2tldC5zb2NrZXQ7XG5cdFx0Y29uc3QgZGF0YUNodW5rID0gcHJvdG9jb2wucmVhZEVudGlyZUJ1ZmZlcigpO1xuXHRcdHByb3RvY29sLmRpc3Bvc2UoKTtcblx0XHRyZW1vdGVOb2RlU29ja2V0LmRpc3Bvc2UoZmFsc2UpOyAvLyBgZmFsc2VgIHByZXZlbnRzIHRoZSB1bmRlcmx5aW5nIHNvY2tldCBmcm9tIGJlaW5nIGNsb3NlZFxuXG5cdFx0aWYgKGRhdGFDaHVuay5ieXRlTGVuZ3RoID4gMCkge1xuXHRcdFx0bG9jYWxTb2NrZXQud3JpdGUoZGF0YUNodW5rLmJ1ZmZlcik7XG5cdFx0fVxuXG5cdFx0bG9jYWxTb2NrZXQub24oJ2VuZCcsICgpID0+IHJlbW90ZVNvY2tldC5lbmQoKSk7XG5cdFx0bG9jYWxTb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4gcmVtb3RlU29ja2V0LmVuZCgpKTtcblx0XHRsb2NhbFNvY2tldC5vbignZXJyb3InLCAoKSA9PiByZW1vdGVTb2NrZXQuZGVzdHJveSgpKTtcblx0XHRyZW1vdGVTb2NrZXQub24oJ2VuZCcsICgpID0+IGxvY2FsU29ja2V0LmVuZCgpKTtcblx0XHRyZW1vdGVTb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4gbG9jYWxTb2NrZXQuZW5kKCkpO1xuXHRcdHJlbW90ZVNvY2tldC5vbignZXJyb3InLCAoKSA9PiBsb2NhbFNvY2tldC5kZXN0cm95KCkpO1xuXG5cdFx0bG9jYWxTb2NrZXQucGlwZShyZW1vdGVTb2NrZXQpO1xuXHRcdHJlbW90ZVNvY2tldC5waXBlKGxvY2FsU29ja2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2Nvbm5lY3RUdW5uZWxTb2NrZXQoaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBQcm9taXNlPG5ldC5Tb2NrZXQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8bmV0LlNvY2tldD4oKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IHNvY2tldCA9IG5ldC5jcmVhdGVDb25uZWN0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aG9zdDogaG9zdCxcblx0XHRcdFx0XHRwb3J0OiBwb3J0LFxuXHRcdFx0XHRcdGF1dG9TZWxlY3RGYW1pbHk6IHRydWVcblx0XHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRcdHNvY2tldC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBlKTtcblx0XHRcdFx0XHRzb2NrZXQucGF1c2UoKTtcblx0XHRcdFx0XHRjKHNvY2tldCk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdHNvY2tldC5vbmNlKCdlcnJvcicsIGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlV2l0aEZyZWVEZWJ1Z1BvcnQoc3RhcnRQYXJhbXM6IElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXMpOiBUaGVuYWJsZTxJUmVtb3RlRXh0ZW5zaW9uSG9zdFN0YXJ0UGFyYW1zPiB7XG5cdFx0aWYgKHR5cGVvZiBzdGFydFBhcmFtcy5wb3J0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIGZpbmRGcmVlUG9ydChzdGFydFBhcmFtcy5wb3J0LCAxMCAvKiB0cnkgMTAgcG9ydHMgKi8sIDUwMDAgLyogdHJ5IHVwIHRvIDUgc2Vjb25kcyAqLykudGhlbihmcmVlUG9ydCA9PiB7XG5cdFx0XHRcdHN0YXJ0UGFyYW1zLnBvcnQgPSBmcmVlUG9ydDtcblx0XHRcdFx0cmV0dXJuIHN0YXJ0UGFyYW1zO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdC8vIE5vIHBvcnQgY2xlYXIgZGVidWcgY29uZmlndXJhdGlvbi5cblx0XHRzdGFydFBhcmFtcy5kZWJ1Z0lkID0gdW5kZWZpbmVkO1xuXHRcdHN0YXJ0UGFyYW1zLnBvcnQgPSB1bmRlZmluZWQ7XG5cdFx0c3RhcnRQYXJhbXMuYnJlYWsgPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShzdGFydFBhcmFtcyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VydmVyQVBJIHtcblx0LyoqXG5cdCAqIERvIG5vdCByZW1vdmUhIS4gQ2FsbGVkIGZyb20gc2VydmVyLW1haW4uanNcblx0ICovXG5cdGhhbmRsZVJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPjtcblx0LyoqXG5cdCAqIERvIG5vdCByZW1vdmUhIS4gQ2FsbGVkIGZyb20gc2VydmVyLW1haW4uanNcblx0ICovXG5cdGhhbmRsZVVwZ3JhZGUocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgc29ja2V0OiBuZXQuU29ja2V0KTogdm9pZDtcblx0LyoqXG5cdCAqIERvIG5vdCByZW1vdmUhIS4gQ2FsbGVkIGZyb20gc2VydmVyLW1haW4uanNcblx0ICovXG5cdGhhbmRsZVNlcnZlckVycm9yKGVycjogRXJyb3IpOiB2b2lkO1xuXHQvKipcblx0ICogRG8gbm90IHJlbW92ZSEhLiBDYWxsZWQgZnJvbSBzZXJ2ZXItbWFpbi5qc1xuXHQgKi9cblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlU2VydmVyKGFkZHJlc3M6IHN0cmluZyB8IG5ldC5BZGRyZXNzSW5mbyB8IG51bGwsIGFyZ3M6IFNlcnZlclBhcnNlZEFyZ3MsIFJFTU9URV9EQVRBX0ZPTERFUjogc3RyaW5nKTogUHJvbWlzZTxJU2VydmVyQVBJPiB7XG5cblx0Y29uc3QgY29ubmVjdGlvblRva2VuID0gYXdhaXQgZGV0ZXJtaW5lU2VydmVyQ29ubmVjdGlvblRva2VuKGFyZ3MpO1xuXHRpZiAoY29ubmVjdGlvblRva2VuIGluc3RhbmNlb2YgU2VydmVyQ29ubmVjdGlvblRva2VuUGFyc2VFcnJvcikge1xuXHRcdGNvbnNvbGUud2Fybihjb25uZWN0aW9uVG9rZW4ubWVzc2FnZSk7XG5cdFx0cHJvY2Vzcy5leGl0KDEpO1xuXHR9XG5cblx0Ly8gc2V0dGluZyB1cCBlcnJvciBoYW5kbGVycywgZmlyc3Qgd2l0aCBjb25zb2xlLmVycm9yLCB0aGVuLCBvbmNlIGF2YWlsYWJsZSwgdXNpbmcgdGhlIGxvZyBzZXJ2aWNlXG5cblx0ZnVuY3Rpb24gaW5pdFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoaGFuZGxlcjogKGVycjogYW55KSA9PiB2b2lkKSB7XG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihlcnIgPT4ge1xuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXJlbW90ZS1yZWxlYXNlL2lzc3Vlcy82NDgxXG5cdFx0XHQvLyBJbiBzb21lIGNpcmN1bXN0YW5jZXMsIGNvbnNvbGUuZXJyb3Igd2lsbCB0aHJvdyBhbiBhc3luY2hyb25vdXMgZXJyb3IuIFRoaXMgYXN5bmNocm9ub3VzIGVycm9yXG5cdFx0XHQvLyB3aWxsIGVuZCB1cCBoZXJlLCBhbmQgdGhlbiBpdCB3aWxsIGJlIGxvZ2dlZCBhZ2FpbiwgdGh1cyBjcmVhdGluZyBhbiBlbmRsZXNzIGFzeW5jaHJvbm91cyBsb29wLlxuXHRcdFx0Ly8gSGVyZSB3ZSB0cnkgdG8gYnJlYWsgdGhlIGxvb3AgYnkgaWdub3JpbmcgRVBJUEUgZXJyb3JzIHRoYXQgaW5jbHVkZSBvdXIgb3duIHVuZXhwZWN0ZWQgZXJyb3IgaGFuZGxlciBpbiB0aGUgc3RhY2suXG5cdFx0XHRpZiAoaXNTaWdQaXBlRXJyb3IoZXJyKSAmJiBlcnIuc3RhY2sgJiYgL3VuZXhwZWN0ZWRFcnJvckhhbmRsZXIvLnRlc3QoZXJyLnN0YWNrKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRoYW5kbGVyKGVycik7XG5cdFx0fSk7XG5cdH1cblxuXHRjb25zdCB1bmxvZ2dlZEVycm9yczogYW55W10gPSBbXTtcblx0aW5pdFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKGVycm9yOiBhbnkpID0+IHtcblx0XHR1bmxvZ2dlZEVycm9ycy5wdXNoKGVycm9yKTtcblx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0fSk7XG5cdGxldCBkaWRMb2dBYm91dFNJR1BJUEUgPSBmYWxzZTtcblx0cHJvY2Vzcy5vbignU0lHUElQRScsICgpID0+IHtcblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtcmVtb3RlLXJlbGVhc2UvaXNzdWVzLzY1NDNcblx0XHQvLyBXZSB3b3VsZCBub3JtYWxseSBpbnN0YWxsIGEgU0lHUElQRSBsaXN0ZW5lciBpbiBib290c3RyYXAtbm9kZS5qc1xuXHRcdC8vIEJ1dCBpbiBjZXJ0YWluIHNpdHVhdGlvbnMsIHRoZSBjb25zb2xlIGl0c2VsZiBjYW4gYmUgaW4gYSBicm9rZW4gcGlwZSBzdGF0ZVxuXHRcdC8vIHNvIGxvZ2dpbmcgU0lHUElQRSB0byB0aGUgY29uc29sZSB3aWxsIGNhdXNlIGFuIGluZmluaXRlIGFzeW5jIGxvb3Bcblx0XHRpZiAoIWRpZExvZ0Fib3V0U0lHUElQRSkge1xuXHRcdFx0ZGlkTG9nQWJvdXRTSUdQSVBFID0gdHJ1ZTtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBFcnJvcihgVW5leHBlY3RlZCBTSUdQSVBFYCkpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHsgc29ja2V0U2VydmVyLCBpbnN0YW50aWF0aW9uU2VydmljZSB9ID0gYXdhaXQgc2V0dXBTZXJ2ZXJTZXJ2aWNlcyhjb25uZWN0aW9uVG9rZW4sIGFyZ3MsIFJFTU9URV9EQVRBX0ZPTERFUiwgZGlzcG9zYWJsZXMpO1xuXG5cdC8vIFNldCB0aGUgdW5leHBlY3RlZCBlcnJvciBoYW5kbGVyIGFmdGVyIHRoZSBzZXJ2aWNlcyBoYXZlIGJlZW4gaW5pdGlhbGl6ZWQsIHRvIGF2b2lkIGhhdmluZ1xuXHQvLyB0aGUgdGVsZW1ldHJ5IHNlcnZpY2Ugb3ZlcndyaXRlIG91ciBoYW5kbGVyXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdHVubG9nZ2VkRXJyb3JzLmZvckVhY2goZXJyb3IgPT4gbG9nU2VydmljZS5lcnJvcihlcnJvcikpO1xuXHRcdHVubG9nZ2VkRXJyb3JzLmxlbmd0aCA9IDA7XG5cblx0XHRpbml0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoZXJyb3I6IGFueSkgPT4gbG9nU2VydmljZS5lcnJvcihlcnJvcikpO1xuXHR9KTtcblxuXHQvLyBPbiBXaW5kb3dzLCBjb25maWd1cmUgdGhlIFVOQyBhbGxvdyBsaXN0IGJhc2VkIG9uIHNldHRpbmdzXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3NlY3VyaXR5LnJlc3RyaWN0VU5DQWNjZXNzJykgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGRpc2FibGVVTkNBY2Nlc3NSZXN0cmljdGlvbnMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFkZFVOQ0hvc3RUb0FsbG93bGlzdChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnc2VjdXJpdHkuYWxsb3dlZFVOQ0hvc3RzJykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Ly9cblx0Ly8gT24gV2luZG93cywgZXhpdCBlYXJseSB3aXRoIHdhcm5pbmcgbWVzc2FnZSB0byB1c2VycyBhYm91dCBwb3RlbnRpYWwgc2VjdXJpdHkgaXNzdWVcblx0Ly8gaWYgdGhlcmUgaXMgbm9kZV9tb2R1bGVzIGZvbGRlciB1bmRlciBob21lIGRyaXZlIG9yIFVzZXJzIGZvbGRlci5cblx0Ly9cblx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzICYmIHByb2Nlc3MuZW52LkhPTUVEUklWRSAmJiBwcm9jZXNzLmVudi5IT01FUEFUSCkge1xuXHRcdFx0Y29uc3QgaG9tZURpck1vZHVsZXNQYXRoID0gam9pbihwcm9jZXNzLmVudi5IT01FRFJJVkUsICdub2RlX21vZHVsZXMnKTtcblx0XHRcdGNvbnN0IHVzZXJEaXIgPSBkaXJuYW1lKGpvaW4ocHJvY2Vzcy5lbnYuSE9NRURSSVZFLCBwcm9jZXNzLmVudi5IT01FUEFUSCkpO1xuXHRcdFx0Y29uc3QgdXNlckRpck1vZHVsZXNQYXRoID0gam9pbih1c2VyRGlyLCAnbm9kZV9tb2R1bGVzJyk7XG5cdFx0XHRpZiAoZnMuZXhpc3RzU3luYyhob21lRGlyTW9kdWxlc1BhdGgpIHx8IGZzLmV4aXN0c1N5bmModXNlckRpck1vZHVsZXNQYXRoKSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gYFxuXG4qXG4qICEhISEgU2VydmVyIHRlcm1pbmF0ZWQgZHVlIHRvIHByZXNlbmNlIG9mIENWRS0yMDIwLTE0MTYgISEhIVxuKlxuKiBQbGVhc2UgcmVtb3ZlIHRoZSBmb2xsb3dpbmcgZGlyZWN0b3JpZXMgYW5kIHJlLXRyeVxuKiAke2hvbWVEaXJNb2R1bGVzUGF0aH1cbiogJHt1c2VyRGlyTW9kdWxlc1BhdGh9XG4qXG4qIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIHRoZSB2dWxuZXJhYmlsaXR5IGh0dHBzOi8vY3ZlLm1pdHJlLm9yZy9jZ2ktYmluL2N2ZW5hbWUuY2dpP25hbWU9Q1ZFLTIwMjAtMTQxNlxuKlxuXG5gO1xuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4obWVzc2FnZSk7XG5cdFx0XHRcdGNvbnNvbGUud2FybihtZXNzYWdlKTtcblx0XHRcdFx0cHJvY2Vzcy5leGl0KDApO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Y29uc3QgdnNkYU1vZCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGhhc1ZTREEgPSBmcy5leGlzdHNTeW5jKGpvaW4oRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLmZzUGF0aCwgJy4uL25vZGVfbW9kdWxlcy92c2RhJykpO1xuXHRcdGlmIChoYXNWU0RBKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gcmVxdWlyZSgndnNkYScpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH0pO1xuXG5cdGxldCBzZXJ2ZXJCYXNlUGF0aCA9IGFyZ3NbJ3NlcnZlci1iYXNlLXBhdGgnXTtcblx0aWYgKHNlcnZlckJhc2VQYXRoICYmICFzZXJ2ZXJCYXNlUGF0aC5zdGFydHNXaXRoKCcvJykpIHtcblx0XHRzZXJ2ZXJCYXNlUGF0aCA9IGAvJHtzZXJ2ZXJCYXNlUGF0aH1gO1xuXHR9XG5cblx0Y29uc3QgaGFzV2ViQ2xpZW50ID0gZnMuZXhpc3RzU3luYyhGaWxlQWNjZXNzLmFzRmlsZVVyaShgdnMvY29kZS9icm93c2VyL3dvcmtiZW5jaC93b3JrYmVuY2guaHRtbGApLmZzUGF0aCk7XG5cblx0aWYgKGhhc1dlYkNsaWVudCAmJiBhZGRyZXNzICYmIHR5cGVvZiBhZGRyZXNzICE9PSAnc3RyaW5nJykge1xuXHRcdC8vIHNoaXBzIHRoZSB3ZWIgdWkhXG5cdFx0Y29uc3QgcXVlcnlQYXJ0ID0gKGNvbm5lY3Rpb25Ub2tlbi50eXBlICE9PSBTZXJ2ZXJDb25uZWN0aW9uVG9rZW5UeXBlLk5vbmUgPyBgPyR7Y29ubmVjdGlvblRva2VuUXVlcnlOYW1lfT0ke2Nvbm5lY3Rpb25Ub2tlbi52YWx1ZX1gIDogJycpO1xuXHRcdGNvbnNvbGUubG9nKGBXZWIgVUkgYXZhaWxhYmxlIGF0IGh0dHA6Ly9sb2NhbGhvc3Qke2FkZHJlc3MucG9ydCA9PT0gODAgPyAnJyA6IGA6JHthZGRyZXNzLnBvcnR9YH0ke3NlcnZlckJhc2VQYXRoID8/ICcnfSR7cXVlcnlQYXJ0fWApO1xuXHR9XG5cblx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50U2VydmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50U2VydmVyLCBzb2NrZXRTZXJ2ZXIsIGNvbm5lY3Rpb25Ub2tlbiwgdnNkYU1vZCwgaGFzV2ViQ2xpZW50LCBzZXJ2ZXJCYXNlUGF0aCk7XG5cblx0cGVyZi5tYXJrKCdjb2RlL3NlcnZlci9yZWFkeScpO1xuXHRjb25zdCBjdXJyZW50VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0Y29uc3QgdnNjb2RlU2VydmVyU3RhcnRUaW1lOiBudW1iZXIgPSAoPGFueT5nbG9iYWwpLnZzY29kZVNlcnZlclN0YXJ0VGltZTtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGNvbnN0IHZzY29kZVNlcnZlckxpc3RlblRpbWU6IG51bWJlciA9ICg8YW55Pmdsb2JhbCkudnNjb2RlU2VydmVyTGlzdGVuVGltZTtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGNvbnN0IHZzY29kZVNlcnZlckNvZGVMb2FkZWRUaW1lOiBudW1iZXIgPSAoPGFueT5nbG9iYWwpLnZzY29kZVNlcnZlckNvZGVMb2FkZWRUaW1lO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0dHlwZSBTZXJ2ZXJTdGFydENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRjb21tZW50OiAnVGhlIHNlcnZlciBoYXMgc3RhcnRlZCB1cCc7XG5cdFx0XHRzdGFydFRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdGltZSB0aGUgc2VydmVyIHN0YXJ0ZWQgYXQuJyB9O1xuXHRcdFx0c3RhcnRlZFRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdGltZSB0aGUgc2VydmVyIGJlZ2FuIGxpc3RlbmluZyBmb3IgY29ubmVjdGlvbnMuJyB9O1xuXHRcdFx0Y29kZUxvYWRlZFRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdGltZSB3aGljaCB0aGUgY29kZSBsb2FkZWQgb24gdGhlIHNlcnZlcicgfTtcblx0XHRcdHJlYWR5VGltZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSB0aW1lIHdoZW4gdGhlIHNlcnZlciB3YXMgY29tcGxldGVseSByZWFkeScgfTtcblx0XHR9O1xuXHRcdHR5cGUgU2VydmVyU3RhcnRFdmVudCA9IHtcblx0XHRcdHN0YXJ0VGltZTogbnVtYmVyO1xuXHRcdFx0c3RhcnRlZFRpbWU6IG51bWJlcjtcblx0XHRcdGNvZGVMb2FkZWRUaW1lOiBudW1iZXI7XG5cdFx0XHRyZWFkeVRpbWU6IG51bWJlcjtcblx0XHR9O1xuXHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTZXJ2ZXJTdGFydEV2ZW50LCBTZXJ2ZXJTdGFydENsYXNzaWZpY2F0aW9uPignc2VydmVyU3RhcnQnLCB7XG5cdFx0XHRzdGFydFRpbWU6IHZzY29kZVNlcnZlclN0YXJ0VGltZSxcblx0XHRcdHN0YXJ0ZWRUaW1lOiB2c2NvZGVTZXJ2ZXJMaXN0ZW5UaW1lLFxuXHRcdFx0Y29kZUxvYWRlZFRpbWU6IHZzY29kZVNlcnZlckNvZGVMb2FkZWRUaW1lLFxuXHRcdFx0cmVhZHlUaW1lOiBjdXJyZW50VGltZVxuXHRcdH0pO1xuXG5cdFx0aWYgKHBsYXRmb3JtLmlzTGludXgpIHtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgcmVsZWFzZUluZm8gPSBhd2FpdCBnZXRPU1JlbGVhc2VJbmZvKGxvZ1NlcnZpY2UuZXJyb3IuYmluZChsb2dTZXJ2aWNlKSk7XG5cdFx0XHRpZiAocmVsZWFzZUluZm8pIHtcblx0XHRcdFx0dHlwZSBTZXJ2ZXJQbGF0Zm9ybUluZm9DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRwbGF0Zm9ybUlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQSBzdHJpbmcgaWRlbnRpZnlpbmcgdGhlIG9wZXJhdGluZyBzeXN0ZW0gd2l0aG91dCBhbnkgdmVyc2lvbiBpbmZvcm1hdGlvbi4nIH07XG5cdFx0XHRcdFx0cGxhdGZvcm1WZXJzaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdBIHN0cmluZyBpZGVudGlmeWluZyB0aGUgb3BlcmF0aW5nIHN5c3RlbSB2ZXJzaW9uIGV4Y2x1ZGluZyBhbnkgbmFtZSBpbmZvcm1hdGlvbiBvciByZWxlYXNlIGNvZGUuJyB9O1xuXHRcdFx0XHRcdHBsYXRmb3JtSWRMaWtlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQSBzdHJpbmcgaWRlbnRpZnlpbmcgdGhlIG9wZXJhdGluZyBzeXN0ZW0gdGhlIGN1cnJlbnQgT1MgZGVyaXZhdGUgaXMgY2xvc2VseSByZWxhdGVkIHRvLicgfTtcblx0XHRcdFx0XHRvd25lcjogJ2RlZXBhazE1NTYnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdQcm92aWRlcyBpbnNpZ2h0IGludG8gdGhlIGRpc3RybyBpbmZvcm1hdGlvbiBvbiBMaW51eC4nO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0eXBlIFNlcnZlclBsYXRmb3JtSW5mb0V2ZW50ID0ge1xuXHRcdFx0XHRcdHBsYXRmb3JtSWQ6IHN0cmluZztcblx0XHRcdFx0XHRwbGF0Zm9ybVZlcnNpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHBsYXRmb3JtSWRMaWtlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTZXJ2ZXJQbGF0Zm9ybUluZm9FdmVudCwgU2VydmVyUGxhdGZvcm1JbmZvQ2xhc3NpZmljYXRpb24+KCdzZXJ2ZXJQbGF0Zm9ybUluZm8nLCB7XG5cdFx0XHRcdFx0cGxhdGZvcm1JZDogcmVsZWFzZUluZm8uaWQsXG5cdFx0XHRcdFx0cGxhdGZvcm1WZXJzaW9uSWQ6IHJlbGVhc2VJbmZvLnZlcnNpb25faWQsXG5cdFx0XHRcdFx0cGxhdGZvcm1JZExpa2U6IHJlbGVhc2VJbmZvLmlkX2xpa2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRpZiAoYXJnc1sncHJpbnQtc3RhcnR1cC1wZXJmb3JtYW5jZSddKSB7XG5cdFx0bGV0IG91dHB1dCA9ICcnO1xuXHRcdG91dHB1dCArPSBgU3RhcnQtdXAgdGltZTogJHt2c2NvZGVTZXJ2ZXJMaXN0ZW5UaW1lIC0gdnNjb2RlU2VydmVyU3RhcnRUaW1lfVxcbmA7XG5cdFx0b3V0cHV0ICs9IGBDb2RlIGxvYWRpbmcgdGltZTogJHt2c2NvZGVTZXJ2ZXJDb2RlTG9hZGVkVGltZSAtIHZzY29kZVNlcnZlclN0YXJ0VGltZX1cXG5gO1xuXHRcdG91dHB1dCArPSBgSW5pdGlhbGl6ZWQgdGltZTogJHtjdXJyZW50VGltZSAtIHZzY29kZVNlcnZlclN0YXJ0VGltZX1cXG5gO1xuXHRcdG91dHB1dCArPSBgXFxuYDtcblx0XHRjb25zb2xlLmxvZyhvdXRwdXQpO1xuXHR9XG5cblx0cmV0dXJuIHJlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudFNlcnZlcjtcbn1cblxuY2xhc3MgV2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlKTogV2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyIHtcblx0XHRjb25zdCB3ZWJFbmRwb2ludFVybFRlbXBsYXRlID0gcHJvZHVjdFNlcnZpY2Uud2ViRW5kcG9pbnRVcmxUZW1wbGF0ZTtcblx0XHRjb25zdCBjb21taXQgPSBwcm9kdWN0U2VydmljZS5jb21taXQ7XG5cdFx0Y29uc3QgcXVhbGl0eSA9IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHk7XG5cdFx0aWYgKCF3ZWJFbmRwb2ludFVybFRlbXBsYXRlIHx8ICFjb21taXQgfHwgIXF1YWxpdHkpIHtcblx0XHRcdHJldHVybiBuZXcgV2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyKG51bGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHV1aWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBleGFtcGxlVXJsID0gbmV3IFVSTChcblx0XHRcdHdlYkVuZHBvaW50VXJsVGVtcGxhdGVcblx0XHRcdFx0LnJlcGxhY2UoJ3t7dXVpZH19JywgdXVpZClcblx0XHRcdFx0LnJlcGxhY2UoJ3t7Y29tbWl0fX0nLCBjb21taXQpXG5cdFx0XHRcdC5yZXBsYWNlKCd7e3F1YWxpdHl9fScsIHF1YWxpdHkpXG5cdFx0KTtcblx0XHRjb25zdCBleGFtcGxlT3JpZ2luID0gZXhhbXBsZVVybC5vcmlnaW47XG5cdFx0Y29uc3Qgb3JpZ2luUmVnRXhwU291cmNlID0gKFxuXHRcdFx0ZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhleGFtcGxlT3JpZ2luKVxuXHRcdFx0XHQucmVwbGFjZSh1dWlkLCAnW2EtekEtWjAtOVxcXFwtXSsnKVxuXHRcdCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9yaWdpblJlZ0V4cCA9IGNyZWF0ZVJlZ0V4cChgXiR7b3JpZ2luUmVnRXhwU291cmNlfSRgLCB0cnVlLCB7IG1hdGNoQ2FzZTogZmFsc2UgfSk7XG5cdFx0XHRyZXR1cm4gbmV3IFdlYkVuZHBvaW50T3JpZ2luQ2hlY2tlcihvcmlnaW5SZWdFeHApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIG5ldyBXZWJFbmRwb2ludE9yaWdpbkNoZWNrZXIobnVsbCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luUmVnRXhwOiBSZWdFeHAgfCBudWxsXG5cdCkgeyB9XG5cblx0cHVibGljIG1hdGNoZXMob3JpZ2luOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX29yaWdpblJlZ0V4cCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fb3JpZ2luUmVnRXhwLnRlc3Qob3JpZ2luKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFFcEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQixtQkFBbUIsaUNBQWlDO0FBQzdFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWSxlQUFlLHVCQUF1QjtBQUMzRCxTQUFTLDBCQUEwQixZQUFZLHlCQUF5QixlQUFlO0FBQ3ZGLFNBQVMsU0FBUyxZQUFZO0FBQzlCLFlBQVksVUFBVTtBQUN0QixZQUFZLGNBQWM7QUFDMUIsU0FBUyxjQUFjLDhCQUE4QjtBQUNyRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUIsb0NBQW9DO0FBQ3BFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsWUFBWSxrQkFBa0IsMkJBQTJCO0FBQ2xFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQW9LO0FBRTdLLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDLGtDQUFrQyxvQ0FBMkQsaUNBQWlDLGlDQUFpQztBQUN4TSxTQUFTLGlDQUFtRDtBQUM1RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDJCQUF5QztBQUNsRCxTQUFTLGNBQWMsWUFBWSxXQUFXLHVCQUF1QjtBQUNyRSxNQUFNQSxXQUFVLGNBQWMsWUFBWSxHQUFHO0FBZ0I3QyxJQUFNLGlDQUFOLGNBQTZDLFdBQWlDO0FBQUEs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O0FBQUEsTUFDYixnQkFBZ0I7QUFBQSxNQUNoQixXQUFXO0FBQUEsSUFDWixDQUFDO0FBRUQsUUFBSSxTQUFTLFNBQVM7QUFDckIsWUFBTSxhQUFhLFNBQVMsSUFBSSxXQUFXO0FBQzNDLFlBQU0sY0FBYyxNQUFNLGlCQUFpQixXQUFXLE1BQU0sS0FBSyxVQUFVLENBQUM7QUFDNUUsVUFBSSxhQUFhO0FBYWhCLHlCQUFpQixXQUFzRSxzQkFBc0I7QUFBQSxVQUM1RyxZQUFZLFlBQVk7QUFBQSxVQUN4QixtQkFBbUIsWUFBWTtBQUFBLFVBQy9CLGdCQUFnQixZQUFZO0FBQUEsUUFDN0IsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsTUFBSSxLQUFLLDJCQUEyQixHQUFHO0FBQ3RDLFFBQUksU0FBUztBQUNiLGNBQVUsa0JBQWtCLHlCQUF5QixxQkFBcUI7QUFBQTtBQUMxRSxjQUFVLHNCQUFzQiw2QkFBNkIscUJBQXFCO0FBQUE7QUFDbEYsY0FBVSxxQkFBcUIsY0FBYyxxQkFBcUI7QUFBQTtBQUNsRSxjQUFVO0FBQUE7QUFDVixZQUFRLElBQUksTUFBTTtBQUFBLEVBQ25CO0FBRUEsU0FBTztBQUNSO0FBRUEsTUFBTSx5QkFBeUI7QUFBQSxFQThCOUIsWUFDa0IsZUFDaEI7QUFEZ0I7QUFBQSxFQUNkO0FBQUEsRUE5QkosT0FBYyxPQUFPLGdCQUEyRDtBQUMvRSxVQUFNLHlCQUF5QixlQUFlO0FBQzlDLFVBQU0sU0FBUyxlQUFlO0FBQzlCLFVBQU0sVUFBVSxlQUFlO0FBQy9CLFFBQUksQ0FBQywwQkFBMEIsQ0FBQyxVQUFVLENBQUMsU0FBUztBQUNuRCxhQUFPLElBQUkseUJBQXlCLElBQUk7QUFBQSxJQUN6QztBQUVBLFVBQU0sT0FBTyxhQUFhO0FBQzFCLFVBQU0sYUFBYSxJQUFJO0FBQUEsTUFDdEIsdUJBQ0UsUUFBUSxZQUFZLElBQUksRUFDeEIsUUFBUSxjQUFjLE1BQU0sRUFDNUIsUUFBUSxlQUFlLE9BQU87QUFBQSxJQUNqQztBQUNBLFVBQU0sZ0JBQWdCLFdBQVc7QUFDakMsVUFBTSxxQkFDTCx1QkFBdUIsYUFBYSxFQUNsQyxRQUFRLE1BQU0saUJBQWlCO0FBRWxDLFFBQUk7QUFDSCxZQUFNLGVBQWUsYUFBYSxJQUFJLGtCQUFrQixLQUFLLE1BQU0sRUFBRSxXQUFXLE1BQU0sQ0FBQztBQUN2RixhQUFPLElBQUkseUJBQXlCLFlBQVk7QUFBQSxJQUNqRCxTQUFTLEtBQUs7QUFDYixhQUFPLElBQUkseUJBQXlCLElBQUk7QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFBQSxFQU1PLFFBQVEsUUFBeUI7QUFDdkMsUUFBSSxDQUFDLEtBQUssZUFBZTtBQUN4QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxjQUFjLEtBQUssTUFBTTtBQUFBLEVBQ3RDO0FBQ0Q7IiwKICAibmFtZXMiOiBbInJlcXVpcmUiLCAiU3RhdGUiXQp9Cg==
