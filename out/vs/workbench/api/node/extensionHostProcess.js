import minimist from "minimist";
import * as net from "net";
import { ProcessTimeRunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { PendingMigrationError, isCancellationError, isSigPipeError, onUnexpectedError, onUnexpectedExternalError } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import * as performance from "../../../base/common/performance.js";
import { Promises } from "../../../base/node/pfs.js";
import { BufferedEmitter, PersistentProtocol, ProtocolConstants } from "../../../base/parts/ipc/common/ipc.net.js";
import { NodeSocket, WebSocketNodeSocket } from "../../../base/parts/ipc/node/ipc.net.js";
import { boolean } from "../../../editor/common/config/editorOptions.js";
import product from "../../../platform/product/common/product.js";
import { ExtensionHostMain } from "../common/extensionHostMain.js";
import { createURITransformer } from "../../../base/common/uriTransformer.js";
import { ExtHostConnectionType, readExtHostConnection } from "../../services/extensions/common/extensionHostEnv.js";
import { ExtensionHostExitCode, MessageType, createMessageOfType, isMessageOfType } from "../../services/extensions/common/extensionHostProtocol.js";
import "../common/extHost.common.services.js";
import "./extHost.node.services.js";
import { createRequire } from "node:module";
const require2 = createRequire(import.meta.url);
if (process.env.VSCODE_DEV) {
  const warningListeners = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.code === "ExperimentalWarning" || warning.name === "ExperimentalWarning" || warning.name === "DeprecationWarning") {
      console.debug(warning);
      return;
    }
    warningListeners[0](warning);
  });
}
(function removeInspectPort() {
  for (let i = 0; i < process.execArgv.length; i++) {
    if (process.execArgv[i] === "--inspect-port=0") {
      process.execArgv.splice(i, 1);
      i--;
    }
  }
})();
const args = minimist(process.argv.slice(2), {
  boolean: [
    "transformURIs",
    "skipWorkspaceStorageLock",
    "supportGlobalNavigator"
  ],
  string: [
    "useHostProxy"
    // 'true' | 'false' | undefined
  ]
});
(function() {
  const Module = require2("module");
  const originalLoad = Module._load;
  Module._load = function(request) {
    if (request === "natives") {
      throw new Error('Either the extension or an NPM dependency is using the [unsupported "natives" node module](https://go.microsoft.com/fwlink/?linkid=871887).');
    }
    return originalLoad.apply(this, arguments);
  };
})();
const nativeExit = process.exit.bind(process);
const nativeOn = process.on.bind(process);
function patchProcess(allowExit) {
  process.exit = function(code) {
    if (allowExit) {
      nativeExit(code);
    } else {
      const err = new Error("An extension called process.exit() and this was prevented.");
      console.warn(err.stack);
    }
  };
  process.crash = function() {
    const err = new Error("An extension called process.crash() and this was prevented.");
    console.warn(err.stack);
  };
  process.env["ELECTRON_RUN_AS_NODE"] = "1";
  process.on = function(event, listener) {
    if (event === "uncaughtException") {
      const actualListener = listener;
      listener = function(...args2) {
        try {
          return actualListener.apply(void 0, args2);
        } catch {
        }
      };
    }
    nativeOn(event, listener);
  };
}
if (!args.supportGlobalNavigator) {
  Object.defineProperty(globalThis, "navigator", {
    get: () => {
      onUnexpectedExternalError(new PendingMigrationError("navigator is now a global in nodejs, please see https://aka.ms/vscode-extensions/navigator for additional info on this error."));
      return void 0;
    }
  });
}
let onTerminate = function(reason) {
  nativeExit();
};
function readReconnectionValue(envKey, fallback) {
  const raw = process.env[envKey];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    console.log(`[reconnection-grace-time] Extension host: env var ${envKey} not set, using default: ${fallback}ms (${Math.floor(fallback / 1e3)}s)`);
    return fallback;
  }
  const parsed = Number(raw);
  if (!isFinite(parsed) || parsed < 0) {
    console.log(`[reconnection-grace-time] Extension host: env var ${envKey} invalid value '${raw}', using default: ${fallback}ms (${Math.floor(fallback / 1e3)}s)`);
    return fallback;
  }
  const millis = Math.floor(parsed);
  const result = millis > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : millis;
  console.log(`[reconnection-grace-time] Extension host: read ${envKey}=${raw}ms (${Math.floor(result / 1e3)}s)`);
  return result;
}
function _createExtHostProtocol() {
  const extHostConnection = readExtHostConnection(process.env);
  if (extHostConnection.type === ExtHostConnectionType.MessagePort) {
    return new Promise((resolve, reject) => {
      const withPorts = (ports) => {
        const port = ports[0];
        const onMessage = new BufferedEmitter();
        port.on("message", (e) => onMessage.fire(VSBuffer.wrap(e.data)));
        port.on("close", () => {
          onTerminate("renderer closed the MessagePort");
        });
        port.start();
        resolve({
          onMessage: onMessage.event,
          send: (message) => port.postMessage(message.buffer)
        });
      };
      process.parentPort.on("message", (e) => withPorts(e.ports));
    });
  } else if (extHostConnection.type === ExtHostConnectionType.Socket) {
    return new Promise((resolve, reject) => {
      let protocol = null;
      const timer = setTimeout(() => {
        onTerminate("VSCODE_EXTHOST_IPC_SOCKET timeout");
      }, 6e4);
      const reconnectionGraceTime = readReconnectionValue("VSCODE_RECONNECTION_GRACE_TIME", ProtocolConstants.ReconnectionGraceTime);
      const reconnectionShortGraceTime = reconnectionGraceTime > 0 ? Math.min(ProtocolConstants.ReconnectionShortGraceTime, reconnectionGraceTime) : 0;
      const disconnectRunner1 = new ProcessTimeRunOnceScheduler(() => onTerminate("renderer disconnected for too long (1)"), reconnectionGraceTime);
      const disconnectRunner2 = new ProcessTimeRunOnceScheduler(() => onTerminate("renderer disconnected for too long (2)"), reconnectionShortGraceTime);
      process.on("message", (msg, handle) => {
        if (msg && msg.type === "VSCODE_EXTHOST_IPC_SOCKET") {
          handle.setNoDelay(true);
          const initialDataChunk = VSBuffer.wrap(Buffer.from(msg.initialDataChunk, "base64"));
          let socket;
          if (msg.skipWebSocketFrames) {
            socket = new NodeSocket(handle, "extHost-socket");
          } else {
            const inflateBytes = VSBuffer.wrap(Buffer.from(msg.inflateBytes, "base64"));
            socket = new WebSocketNodeSocket(new NodeSocket(handle, "extHost-socket"), msg.permessageDeflate, inflateBytes, false);
          }
          if (protocol) {
            disconnectRunner1.cancel();
            disconnectRunner2.cancel();
            protocol.beginAcceptReconnection(socket, initialDataChunk);
            protocol.endAcceptReconnection();
            protocol.sendResume();
          } else {
            clearTimeout(timer);
            protocol = new PersistentProtocol({ socket, initialChunk: initialDataChunk });
            protocol.sendResume();
            Event.once(protocol.onDidDispose)(() => onTerminate("renderer disconnected"));
            resolve(protocol);
            protocol.onSocketClose(() => {
              disconnectRunner1.schedule();
            });
          }
        }
        if (msg && msg.type === "VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME") {
          if (disconnectRunner2.isScheduled()) {
            return;
          }
          if (disconnectRunner1.isScheduled()) {
            disconnectRunner2.schedule();
          }
        }
      });
      const req = { type: "VSCODE_EXTHOST_IPC_READY" };
      process.send?.(req);
    });
  } else {
    const pipeName = extHostConnection.pipeName;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(pipeName, () => {
        socket.removeListener("error", reject);
        const protocol = new PersistentProtocol({ socket: new NodeSocket(socket, "extHost-renderer") });
        protocol.sendResume();
        resolve(protocol);
      });
      socket.once("error", reject);
      socket.on("close", () => {
        onTerminate("renderer closed the socket");
      });
    });
  }
}
async function createExtHostProtocol() {
  const protocol = await _createExtHostProtocol();
  return new class {
    constructor() {
      this._onMessage = new BufferedEmitter();
      this.onMessage = this._onMessage.event;
      this._terminating = false;
      this._protocolListener = protocol.onMessage((msg) => {
        if (isMessageOfType(msg, MessageType.Terminate)) {
          this._terminating = true;
          this._protocolListener.dispose();
          onTerminate("received terminate message from renderer");
        } else {
          this._onMessage.fire(msg);
        }
      });
    }
    send(msg) {
      if (!this._terminating) {
        protocol.send(msg);
      }
    }
    async drain() {
      if (protocol.drain) {
        return protocol.drain();
      }
    }
  }();
}
function connectToRenderer(protocol) {
  return new Promise((c) => {
    const first = protocol.onMessage((raw) => {
      first.dispose();
      const initData = JSON.parse(raw.toString());
      const rendererCommit = initData.commit;
      const myCommit = product.commit;
      if (rendererCommit && myCommit) {
        if (rendererCommit !== myCommit) {
          nativeExit(ExtensionHostExitCode.VersionMismatch);
        }
      }
      if (initData.parentPid) {
        let epermErrors = 0;
        setInterval(function() {
          try {
            process.kill(initData.parentPid, 0);
            epermErrors = 0;
          } catch (e) {
            if (e && e.code === "EPERM") {
              epermErrors++;
              if (epermErrors >= 3) {
                onTerminate(`parent process ${initData.parentPid} does not exist anymore (3 x EPERM): ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
              }
            } else {
              onTerminate(`parent process ${initData.parentPid} does not exist anymore: ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
            }
          }
        }, 1e3);
        let watchdog;
        try {
          watchdog = require2("@vscode/native-watchdog");
          watchdog.start(initData.parentPid);
        } catch (err) {
          onUnexpectedError(err);
        }
      }
      protocol.send(createMessageOfType(MessageType.Initialized));
      c({ protocol, initData });
    });
    protocol.send(createMessageOfType(MessageType.Ready));
  });
}
async function startExtensionHostProcess() {
  const unhandledPromises = [];
  process.on("unhandledRejection", (reason, promise) => {
    unhandledPromises.push(promise);
    setTimeout(() => {
      const idx = unhandledPromises.indexOf(promise);
      if (idx >= 0) {
        promise.catch((e) => {
          unhandledPromises.splice(idx, 1);
          if (!isCancellationError(e)) {
            console.warn(`rejected promise not handled within 1 second: ${e}`);
            if (e && e.stack) {
              console.warn(`stack trace: ${e.stack}`);
            }
            if (reason) {
              onUnexpectedError(reason);
            }
          }
        });
      }
    }, 1e3);
  });
  process.on("rejectionHandled", (promise) => {
    const idx = unhandledPromises.indexOf(promise);
    if (idx >= 0) {
      unhandledPromises.splice(idx, 1);
    }
  });
  process.on("uncaughtException", function(err) {
    if (!isSigPipeError(err)) {
      onUnexpectedError(err);
    }
  });
  performance.mark(`code/extHost/willConnectToRenderer`);
  const protocol = await createExtHostProtocol();
  performance.mark(`code/extHost/didConnectToRenderer`);
  const renderer = await connectToRenderer(protocol);
  performance.mark(`code/extHost/didWaitForInitData`);
  const { initData } = renderer;
  patchProcess(!!initData.environment.extensionTestsLocationURI);
  initData.environment.useHostProxy = args.useHostProxy !== void 0 ? args.useHostProxy !== "false" : void 0;
  initData.environment.skipWorkspaceStorageLock = boolean(args.skipWorkspaceStorageLock, false);
  const hostUtils = new class NodeHost {
    constructor() {
      this.pid = process.pid;
    }
    exit(code) {
      nativeExit(code);
    }
    fsExists(path) {
      return Promises.exists(path);
    }
    fsRealpath(path) {
      return Promises.realpath(path);
    }
  }();
  let uriTransformer = null;
  if (initData.remote.authority && args.transformURIs) {
    uriTransformer = createURITransformer(initData.remote.authority);
  }
  const extensionHostMain = new ExtensionHostMain(
    renderer.protocol,
    initData,
    hostUtils,
    uriTransformer
  );
  onTerminate = (reason) => extensionHostMain.terminate(reason);
}
startExtensionHostProcess().catch((err) => console.log(err));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRlbnNpb25Ib3N0UHJvY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBtaW5pbWlzdCBmcm9tICdtaW5pbWlzdCc7XG5pbXBvcnQgKiBhcyBuYXRpdmVXYXRjaGRvZyBmcm9tICdAdnNjb2RlL25hdGl2ZS13YXRjaGRvZyc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCB7IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFBlbmRpbmdNaWdyYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciwgaXNTaWdQaXBlRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yLCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgcGVyZm9ybWFuY2UgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSVVSSVRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpSXBjLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgQnVmZmVyZWRFbWl0dGVyLCBQZXJzaXN0ZW50UHJvdG9jb2wsIFByb3RvY29sQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgTm9kZVNvY2tldCwgV2ViU29ja2V0Tm9kZVNvY2tldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgdHlwZSB7IE1lc3NhZ2VQb3J0TWFpbiwgTWVzc2FnZUV2ZW50IGFzIFV0aWxpdHlNZXNzYWdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL3NhbmRib3gvbm9kZS9lbGVjdHJvblR5cGVzLmpzJztcbmltcG9ydCB7IGJvb2xlYW4gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdE1haW4sIElFeGl0Rm4gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uSG9zdE1haW4uanMnO1xuaW1wb3J0IHsgSUhvc3RVdGlscyB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVVUklUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaVRyYW5zZm9ybWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb25uZWN0aW9uVHlwZSwgcmVhZEV4dEhvc3RDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdEVudi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0RXhpdENvZGUsIElFeHRIb3N0UmVhZHlNZXNzYWdlLCBJRXh0SG9zdFJlZHVjZUdyYWNlVGltZU1lc3NhZ2UsIElFeHRIb3N0U29ja2V0TWVzc2FnZSwgSUV4dGVuc2lvbkhvc3RJbml0RGF0YSwgTWVzc2FnZVR5cGUsIGNyZWF0ZU1lc3NhZ2VPZlR5cGUsIGlzTWVzc2FnZU9mVHlwZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgJy4uL2NvbW1vbi9leHRIb3N0LmNvbW1vbi5zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgJy4vZXh0SG9zdC5ub2RlLnNlcnZpY2VzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tICdub2RlOm1vZHVsZSc7XG5jb25zdCByZXF1aXJlID0gY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuXG5pbnRlcmZhY2UgUGFyc2VkRXh0SG9zdEFyZ3Mge1xuXHR0cmFuc2Zvcm1VUklzPzogYm9vbGVhbjtcblx0c2tpcFdvcmtzcGFjZVN0b3JhZ2VMb2NrPzogYm9vbGVhbjtcblx0c3VwcG9ydEdsb2JhbE5hdmlnYXRvcj86IGJvb2xlYW47IC8vIGVuYWJsZSBnbG9iYWwgbmF2aWdhdG9yIG9iamVjdCBpbiBub2RlanNcblx0dXNlSG9zdFByb3h5PzogJ3RydWUnIHwgJ2ZhbHNlJzsgLy8gdXNlIGEgc3RyaW5nLCBhcyB1bmRlZmluZWQgaXMgYWxzbyBhIHZhbGlkIHZhbHVlXG59XG5cbi8vIHNpbGVuY2UgZXhwZXJpbWVudGFsIHdhcm5pbmdzIHdoZW4gaW4gZGV2ZWxvcG1lbnRcbmlmIChwcm9jZXNzLmVudi5WU0NPREVfREVWKSB7XG5cdGNvbnN0IHdhcm5pbmdMaXN0ZW5lcnMgPSBwcm9jZXNzLmxpc3RlbmVycygnd2FybmluZycpO1xuXHRwcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycygnd2FybmluZycpO1xuXHRwcm9jZXNzLm9uKCd3YXJuaW5nJywgKHdhcm5pbmc6IGFueSkgPT4ge1xuXHRcdGlmICh3YXJuaW5nLmNvZGUgPT09ICdFeHBlcmltZW50YWxXYXJuaW5nJyB8fCB3YXJuaW5nLm5hbWUgPT09ICdFeHBlcmltZW50YWxXYXJuaW5nJyB8fCB3YXJuaW5nLm5hbWUgPT09ICdEZXByZWNhdGlvbldhcm5pbmcnKSB7XG5cdFx0XHRjb25zb2xlLmRlYnVnKHdhcm5pbmcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHdhcm5pbmdMaXN0ZW5lcnNbMF0od2FybmluZyk7XG5cdH0pO1xufVxuXG4vLyB3b3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODU0OTBcbi8vIHJlbW92ZSAtLWluc3BlY3QtcG9ydD0wIGFmdGVyIHN0YXJ0IHNvIHRoYXQgaXQgZG9lc24ndCB0cmlnZ2VyIExTUCBkZWJ1Z2dpbmdcbihmdW5jdGlvbiByZW1vdmVJbnNwZWN0UG9ydCgpIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwcm9jZXNzLmV4ZWNBcmd2Lmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKHByb2Nlc3MuZXhlY0FyZ3ZbaV0gPT09ICctLWluc3BlY3QtcG9ydD0wJykge1xuXHRcdFx0cHJvY2Vzcy5leGVjQXJndi5zcGxpY2UoaSwgMSk7XG5cdFx0XHRpLS07XG5cdFx0fVxuXHR9XG59KSgpO1xuXG5jb25zdCBhcmdzID0gbWluaW1pc3QocHJvY2Vzcy5hcmd2LnNsaWNlKDIpLCB7XG5cdGJvb2xlYW46IFtcblx0XHQndHJhbnNmb3JtVVJJcycsXG5cdFx0J3NraXBXb3Jrc3BhY2VTdG9yYWdlTG9jaycsXG5cdFx0J3N1cHBvcnRHbG9iYWxOYXZpZ2F0b3InLFxuXHRdLFxuXHRzdHJpbmc6IFtcblx0XHQndXNlSG9zdFByb3h5JyAvLyAndHJ1ZScgfCAnZmFsc2UnIHwgdW5kZWZpbmVkXG5cdF1cbn0pIGFzIFBhcnNlZEV4dEhvc3RBcmdzO1xuXG4vLyBXaXRoIEVsZWN0cm9uIDIueCBhbmQgbm9kZS5qcyA4LnggdGhlIFwibmF0aXZlc1wiIG1vZHVsZVxuLy8gY2FuIGNhdXNlIGEgbmF0aXZlIGNyYXNoIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8xOTg5MSBhbmRcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMTA5MDUpLiBUbyBwcmV2ZW50IHRoaXMgZnJvbVxuLy8gaGFwcGVuaW5nIHdlIGVzc2VudGlhbGx5IGJsb2NrbGlzdCB0aGlzIG1vZHVsZSBmcm9tIGdldHRpbmcgbG9hZGVkIGluIGFueVxuLy8gZXh0ZW5zaW9uIGJ5IHBhdGNoaW5nIHRoZSBub2RlIHJlcXVpcmUoKSBmdW5jdGlvbi5cbihmdW5jdGlvbiAoKSB7XG5cdGNvbnN0IE1vZHVsZSA9IHJlcXVpcmUoJ21vZHVsZScpO1xuXHRjb25zdCBvcmlnaW5hbExvYWQgPSBNb2R1bGUuX2xvYWQ7XG5cblx0TW9kdWxlLl9sb2FkID0gZnVuY3Rpb24gKHJlcXVlc3Q6IHN0cmluZykge1xuXHRcdGlmIChyZXF1ZXN0ID09PSAnbmF0aXZlcycpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRWl0aGVyIHRoZSBleHRlbnNpb24gb3IgYW4gTlBNIGRlcGVuZGVuY3kgaXMgdXNpbmcgdGhlIFt1bnN1cHBvcnRlZCBcIm5hdGl2ZXNcIiBub2RlIG1vZHVsZV0oaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/bGlua2lkPTg3MTg4NykuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9yaWdpbmFsTG9hZC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9O1xufSkoKTtcblxuLy8gY3VzdG9tIHByb2Nlc3MuZXhpdCBsb2dpYy4uLlxuY29uc3QgbmF0aXZlRXhpdDogSUV4aXRGbiA9IHByb2Nlc3MuZXhpdC5iaW5kKHByb2Nlc3MpO1xuY29uc3QgbmF0aXZlT24gPSBwcm9jZXNzLm9uLmJpbmQocHJvY2Vzcyk7XG5mdW5jdGlvbiBwYXRjaFByb2Nlc3MoYWxsb3dFeGl0OiBib29sZWFuKSB7XG5cdHByb2Nlc3MuZXhpdCA9IGZ1bmN0aW9uIChjb2RlPzogbnVtYmVyKSB7XG5cdFx0aWYgKGFsbG93RXhpdCkge1xuXHRcdFx0bmF0aXZlRXhpdChjb2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdBbiBleHRlbnNpb24gY2FsbGVkIHByb2Nlc3MuZXhpdCgpIGFuZCB0aGlzIHdhcyBwcmV2ZW50ZWQuJyk7XG5cdFx0XHRjb25zb2xlLndhcm4oZXJyLnN0YWNrKTtcblx0XHR9XG5cdH0gYXMgKGNvZGU/OiBudW1iZXIpID0+IG5ldmVyO1xuXG5cdC8vIG92ZXJyaWRlIEVsZWN0cm9uJ3MgcHJvY2Vzcy5jcmFzaCgpIG1ldGhvZFxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0KHByb2Nlc3MgYXMgYW55IC8qIGJ5cGFzcyBsYXllciBjaGVja2VyICovKS5jcmFzaCA9IGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0FuIGV4dGVuc2lvbiBjYWxsZWQgcHJvY2Vzcy5jcmFzaCgpIGFuZCB0aGlzIHdhcyBwcmV2ZW50ZWQuJyk7XG5cdFx0Y29uc29sZS53YXJuKGVyci5zdGFjayk7XG5cdH07XG5cblx0Ly8gU2V0IEVMRUNUUk9OX1JVTl9BU19OT0RFIGVudmlyb25tZW50IHZhcmlhYmxlIGZvciBleHRlbnNpb25zIHRoYXQgdXNlXG5cdC8vIGNoaWxkX3Byb2Nlc3Muc3Bhd24gd2l0aCBwcm9jZXNzLmV4ZWNQYXRoIGFuZCBleHBlY3QgdG8gcnVuIGFzIG5vZGUgcHJvY2Vzc1xuXHQvLyBvbiB0aGUgZGVza3RvcC5cblx0Ly8gUmVmcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTUxMDEyI2lzc3VlY29tbWVudC0xMTU2NTkzMjI4XG5cdHByb2Nlc3MuZW52WydFTEVDVFJPTl9SVU5fQVNfTk9ERSddID0gJzEnO1xuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRwcm9jZXNzLm9uID0gPGFueT5mdW5jdGlvbiAoZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpIHtcblx0XHRpZiAoZXZlbnQgPT09ICd1bmNhdWdodEV4Y2VwdGlvbicpIHtcblx0XHRcdGNvbnN0IGFjdHVhbExpc3RlbmVyID0gbGlzdGVuZXI7XG5cdFx0XHRsaXN0ZW5lciA9IGZ1bmN0aW9uICguLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gYWN0dWFsTGlzdGVuZXIuYXBwbHkodW5kZWZpbmVkLCBhcmdzKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gRE8gTk9UIEhBTkRMRSBOT1IgUFJJTlQgdGhlIGVycm9yIGhlcmUgYmVjYXVzZSB0aGlzIGNhbiBhbmQgd2lsbCBsZWFkIHRvXG5cdFx0XHRcdFx0Ly8gbW9yZSBlcnJvcnMgd2hpY2ggd2lsbCBjYXVzZSBlcnJvciBoYW5kbGluZyB0byBiZSByZWVudHJhbnQgYW5kIGV2ZW50dWFsbHlcblx0XHRcdFx0XHQvLyBvdmVyZmxvd2luZyB0aGUgc3RhY2suIERvIG5vdCBiZSBzYWQsIHdlIGRvIGhhbmRsZSBhbmQgYW5ub3RhdGUgdW5jYXVnaHRcblx0XHRcdFx0XHQvLyBlcnJvcnMgcHJvcGVybHkgaW4gJ2V4dGVuc2lvbkhvc3RNYWluJ1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRuYXRpdmVPbihldmVudCwgbGlzdGVuZXIpO1xuXHR9O1xuXG59XG5cbi8vIE5vZGVKUyBzaW5jZSB2MjEgZGVmaW5lcyBuYXZpZ2F0b3IgYXMgYSBnbG9iYWwgb2JqZWN0LiBUaGlzIHdpbGwgbGlrZWx5IHN1cnByaXNlIG1hbnkgZXh0ZW5zaW9ucyBhbmQgcG90ZW50aWFsbHkgYnJlYWsgdGhlbVxuLy8gYmVjYXVzZSBgbmF2aWdhdG9yYCBoYXMgaGlzdG9yaWNhbGx5IG9mdGVuIGJlZW4gdXNlZCB0byBjaGVjayBpZiBydW5uaW5nIGluIGEgYnJvd3NlciAodnMgcnVubmluZyBpbnNpZGUgTm9kZUpTKVxuaWYgKCFhcmdzLnN1cHBvcnRHbG9iYWxOYXZpZ2F0b3IpIHtcblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGdsb2JhbFRoaXMsICduYXZpZ2F0b3InLCB7XG5cdFx0Z2V0OiAoKSA9PiB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKG5ldyBQZW5kaW5nTWlncmF0aW9uRXJyb3IoJ25hdmlnYXRvciBpcyBub3cgYSBnbG9iYWwgaW4gbm9kZWpzLCBwbGVhc2Ugc2VlIGh0dHBzOi8vYWthLm1zL3ZzY29kZS1leHRlbnNpb25zL25hdmlnYXRvciBmb3IgYWRkaXRpb25hbCBpbmZvIG9uIHRoaXMgZXJyb3IuJykpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pO1xufVxuXG5cbmludGVyZmFjZSBJUmVuZGVyZXJDb25uZWN0aW9uIHtcblx0cHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sO1xuXHRpbml0RGF0YTogSUV4dGVuc2lvbkhvc3RJbml0RGF0YTtcbn1cblxuLy8gVGhpcyBjYWxscyBleGl0IGRpcmVjdGx5IGluIGNhc2UgdGhlIGluaXRpYWxpemF0aW9uIGlzIG5vdCBmaW5pc2hlZCBhbmQgd2UgbmVlZCB0byBleGl0XG4vLyBPdGhlcndpc2UsIGlmIGluaXRpYWxpemF0aW9uIGNvbXBsZXRlZCB3ZSBnbyB0byBleHRlbnNpb25Ib3N0TWFpbi50ZXJtaW5hdGUoKVxubGV0IG9uVGVybWluYXRlID0gZnVuY3Rpb24gKHJlYXNvbjogc3RyaW5nKSB7XG5cdG5hdGl2ZUV4aXQoKTtcbn07XG5cbmZ1bmN0aW9uIHJlYWRSZWNvbm5lY3Rpb25WYWx1ZShlbnZLZXk6IHN0cmluZywgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHJhdyA9IHByb2Nlc3MuZW52W2VudktleV07XG5cdGlmICh0eXBlb2YgcmF3ICE9PSAnc3RyaW5nJyB8fCByYXcudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdGNvbnNvbGUubG9nKGBbcmVjb25uZWN0aW9uLWdyYWNlLXRpbWVdIEV4dGVuc2lvbiBob3N0OiBlbnYgdmFyICR7ZW52S2V5fSBub3Qgc2V0LCB1c2luZyBkZWZhdWx0OiAke2ZhbGxiYWNrfW1zICgke01hdGguZmxvb3IoZmFsbGJhY2sgLyAxMDAwKX1zKWApO1xuXHRcdHJldHVybiBmYWxsYmFjaztcblx0fVxuXHRjb25zdCBwYXJzZWQgPSBOdW1iZXIocmF3KTtcblx0aWYgKCFpc0Zpbml0ZShwYXJzZWQpIHx8IHBhcnNlZCA8IDApIHtcblx0XHRjb25zb2xlLmxvZyhgW3JlY29ubmVjdGlvbi1ncmFjZS10aW1lXSBFeHRlbnNpb24gaG9zdDogZW52IHZhciAke2VudktleX0gaW52YWxpZCB2YWx1ZSAnJHtyYXd9JywgdXNpbmcgZGVmYXVsdDogJHtmYWxsYmFja31tcyAoJHtNYXRoLmZsb29yKGZhbGxiYWNrIC8gMTAwMCl9cylgKTtcblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblx0Y29uc3QgbWlsbGlzID0gTWF0aC5mbG9vcihwYXJzZWQpO1xuXHRjb25zdCByZXN1bHQgPSBtaWxsaXMgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA/IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSIDogbWlsbGlzO1xuXHRjb25zb2xlLmxvZyhgW3JlY29ubmVjdGlvbi1ncmFjZS10aW1lXSBFeHRlbnNpb24gaG9zdDogcmVhZCAke2VudktleX09JHtyYXd9bXMgKCR7TWF0aC5mbG9vcihyZXN1bHQgLyAxMDAwKX1zKWApO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBfY3JlYXRlRXh0SG9zdFByb3RvY29sKCk6IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+IHtcblx0Y29uc3QgZXh0SG9zdENvbm5lY3Rpb24gPSByZWFkRXh0SG9zdENvbm5lY3Rpb24ocHJvY2Vzcy5lbnYpO1xuXG5cdGlmIChleHRIb3N0Q29ubmVjdGlvbi50eXBlID09PSBFeHRIb3N0Q29ubmVjdGlvblR5cGUuTWVzc2FnZVBvcnQpIHtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRjb25zdCB3aXRoUG9ydHMgPSAocG9ydHM6IE1lc3NhZ2VQb3J0TWFpbltdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBvcnQgPSBwb3J0c1swXTtcblx0XHRcdFx0Y29uc3Qgb25NZXNzYWdlID0gbmV3IEJ1ZmZlcmVkRW1pdHRlcjxWU0J1ZmZlcj4oKTtcblx0XHRcdFx0cG9ydC5vbignbWVzc2FnZScsIChlKSA9PiBvbk1lc3NhZ2UuZmlyZShWU0J1ZmZlci53cmFwKGUuZGF0YSBhcyBVaW50OEFycmF5KSkpO1xuXHRcdFx0XHRwb3J0Lm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdFx0XHRvblRlcm1pbmF0ZSgncmVuZGVyZXIgY2xvc2VkIHRoZSBNZXNzYWdlUG9ydCcpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cG9ydC5zdGFydCgpO1xuXG5cdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdG9uTWVzc2FnZTogb25NZXNzYWdlLmV2ZW50LFxuXHRcdFx0XHRcdHNlbmQ6IG1lc3NhZ2UgPT4gcG9ydC5wb3N0TWVzc2FnZShtZXNzYWdlLmJ1ZmZlcilcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQocHJvY2VzcyBhcyB1bmtub3duIGFzIHsgcGFyZW50UG9ydDogeyBvbjogKGV2ZW50OiAnbWVzc2FnZScsIGxpc3RlbmVyOiAobWVzc2FnZUV2ZW50OiBVdGlsaXR5TWVzc2FnZUV2ZW50KSA9PiB2b2lkKSA9PiB2b2lkIH0gfSkucGFyZW50UG9ydC5vbignbWVzc2FnZScsIChlOiBVdGlsaXR5TWVzc2FnZUV2ZW50KSA9PiB3aXRoUG9ydHMoZS5wb3J0cykpO1xuXHRcdH0pO1xuXG5cdH0gZWxzZSBpZiAoZXh0SG9zdENvbm5lY3Rpb24udHlwZSA9PT0gRXh0SG9zdENvbm5lY3Rpb25UeXBlLlNvY2tldCkge1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFBlcnNpc3RlbnRQcm90b2NvbD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRsZXQgcHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbCB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRvblRlcm1pbmF0ZSgnVlNDT0RFX0VYVEhPU1RfSVBDX1NPQ0tFVCB0aW1lb3V0Jyk7XG5cdFx0XHR9LCA2MDAwMCk7XG5cblx0XHRcdGNvbnN0IHJlY29ubmVjdGlvbkdyYWNlVGltZSA9IHJlYWRSZWNvbm5lY3Rpb25WYWx1ZSgnVlNDT0RFX1JFQ09OTkVDVElPTl9HUkFDRV9USU1FJywgUHJvdG9jb2xDb25zdGFudHMuUmVjb25uZWN0aW9uR3JhY2VUaW1lKTtcblx0XHRcdGNvbnN0IHJlY29ubmVjdGlvblNob3J0R3JhY2VUaW1lID0gcmVjb25uZWN0aW9uR3JhY2VUaW1lID4gMCA/IE1hdGgubWluKFByb3RvY29sQ29uc3RhbnRzLlJlY29ubmVjdGlvblNob3J0R3JhY2VUaW1lLCByZWNvbm5lY3Rpb25HcmFjZVRpbWUpIDogMDtcblx0XHRcdGNvbnN0IGRpc2Nvbm5lY3RSdW5uZXIxID0gbmV3IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlcigoKSA9PiBvblRlcm1pbmF0ZSgncmVuZGVyZXIgZGlzY29ubmVjdGVkIGZvciB0b28gbG9uZyAoMSknKSwgcmVjb25uZWN0aW9uR3JhY2VUaW1lKTtcblx0XHRcdGNvbnN0IGRpc2Nvbm5lY3RSdW5uZXIyID0gbmV3IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlcigoKSA9PiBvblRlcm1pbmF0ZSgncmVuZGVyZXIgZGlzY29ubmVjdGVkIGZvciB0b28gbG9uZyAoMiknKSwgcmVjb25uZWN0aW9uU2hvcnRHcmFjZVRpbWUpO1xuXG5cdFx0XHRwcm9jZXNzLm9uKCdtZXNzYWdlJywgKG1zZzogSUV4dEhvc3RTb2NrZXRNZXNzYWdlIHwgSUV4dEhvc3RSZWR1Y2VHcmFjZVRpbWVNZXNzYWdlLCBoYW5kbGU6IG5ldC5Tb2NrZXQpID0+IHtcblx0XHRcdFx0aWYgKG1zZyAmJiBtc2cudHlwZSA9PT0gJ1ZTQ09ERV9FWFRIT1NUX0lQQ19TT0NLRVQnKSB7XG5cdFx0XHRcdFx0Ly8gRGlzYWJsZSBOYWdsZSdzIGFsZ29yaXRobS4gV2UgYWxzbyBkbyB0aGlzIG9uIHRoZSBzZXJ2ZXIgcHJvY2Vzcyxcblx0XHRcdFx0XHQvLyBidXQgbm9kZWpzIGRvZXNuJ3QgZG9jdW1lbnQgaWYgdGhpcyBvcHRpb24gaXMgdHJhbnNmZXJyZWQgd2l0aCB0aGUgc29ja2V0XG5cdFx0XHRcdFx0aGFuZGxlLnNldE5vRGVsYXkodHJ1ZSk7XG5cblx0XHRcdFx0XHRjb25zdCBpbml0aWFsRGF0YUNodW5rID0gVlNCdWZmZXIud3JhcChCdWZmZXIuZnJvbShtc2cuaW5pdGlhbERhdGFDaHVuaywgJ2Jhc2U2NCcpKTtcblx0XHRcdFx0XHRsZXQgc29ja2V0OiBOb2RlU29ja2V0IHwgV2ViU29ja2V0Tm9kZVNvY2tldDtcblx0XHRcdFx0XHRpZiAobXNnLnNraXBXZWJTb2NrZXRGcmFtZXMpIHtcblx0XHRcdFx0XHRcdHNvY2tldCA9IG5ldyBOb2RlU29ja2V0KGhhbmRsZSwgJ2V4dEhvc3Qtc29ja2V0Jyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGluZmxhdGVCeXRlcyA9IFZTQnVmZmVyLndyYXAoQnVmZmVyLmZyb20obXNnLmluZmxhdGVCeXRlcywgJ2Jhc2U2NCcpKTtcblx0XHRcdFx0XHRcdHNvY2tldCA9IG5ldyBXZWJTb2NrZXROb2RlU29ja2V0KG5ldyBOb2RlU29ja2V0KGhhbmRsZSwgJ2V4dEhvc3Qtc29ja2V0JyksIG1zZy5wZXJtZXNzYWdlRGVmbGF0ZSwgaW5mbGF0ZUJ5dGVzLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChwcm90b2NvbCkge1xuXHRcdFx0XHRcdFx0Ly8gcmVjb25uZWN0aW9uIGNhc2Vcblx0XHRcdFx0XHRcdGRpc2Nvbm5lY3RSdW5uZXIxLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0ZGlzY29ubmVjdFJ1bm5lcjIuY2FuY2VsKCk7XG5cdFx0XHRcdFx0XHRwcm90b2NvbC5iZWdpbkFjY2VwdFJlY29ubmVjdGlvbihzb2NrZXQsIGluaXRpYWxEYXRhQ2h1bmspO1xuXHRcdFx0XHRcdFx0cHJvdG9jb2wuZW5kQWNjZXB0UmVjb25uZWN0aW9uKCk7XG5cdFx0XHRcdFx0XHRwcm90b2NvbC5zZW5kUmVzdW1lKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRcdFx0XHRwcm90b2NvbCA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQsIGluaXRpYWxDaHVuazogaW5pdGlhbERhdGFDaHVuayB9KTtcblx0XHRcdFx0XHRcdHByb3RvY29sLnNlbmRSZXN1bWUoKTtcblx0XHRcdFx0XHRcdEV2ZW50Lm9uY2UocHJvdG9jb2wub25EaWREaXNwb3NlKSgoKSA9PiBvblRlcm1pbmF0ZSgncmVuZGVyZXIgZGlzY29ubmVjdGVkJykpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZShwcm90b2NvbCk7XG5cblx0XHRcdFx0XHRcdC8vIFdhaXQgZm9yIHJpY2ggY2xpZW50IHRvIHJlY29ubmVjdFxuXHRcdFx0XHRcdFx0cHJvdG9jb2wub25Tb2NrZXRDbG9zZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIFRoZSBzb2NrZXQgaGFzIGNsb3NlZCwgbGV0J3MgZ2l2ZSB0aGUgcmVuZGVyZXIgYSBjZXJ0YWluIGFtb3VudCBvZiB0aW1lIHRvIHJlY29ubmVjdFxuXHRcdFx0XHRcdFx0XHRkaXNjb25uZWN0UnVubmVyMS5zY2hlZHVsZSgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtc2cgJiYgbXNnLnR5cGUgPT09ICdWU0NPREVfRVhUSE9TVF9JUENfUkVEVUNFX0dSQUNFX1RJTUUnKSB7XG5cdFx0XHRcdFx0aWYgKGRpc2Nvbm5lY3RSdW5uZXIyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0XHRcdC8vIHdlIGFyZSBkaXNjb25uZWN0ZWQgYW5kIGFscmVhZHkgcnVubmluZyB0aGUgc2hvcnQgcmVjb25uZWN0aW9uIHRpbWVyXG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkaXNjb25uZWN0UnVubmVyMS5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdFx0XHQvLyB3ZSBhcmUgZGlzY29ubmVjdGVkIGFuZCBydW5uaW5nIHRoZSBsb25nIHJlY29ubmVjdGlvbiB0aW1lclxuXHRcdFx0XHRcdFx0ZGlzY29ubmVjdFJ1bm5lcjIuc2NoZWR1bGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBOb3cgdGhhdCB3ZSBoYXZlIG1hbmFnZWQgdG8gaW5zdGFsbCBhIG1lc3NhZ2UgbGlzdGVuZXIsIGFzayB0aGUgb3RoZXIgc2lkZSB0byBzZW5kIHVzIHRoZSBzb2NrZXRcblx0XHRcdGNvbnN0IHJlcTogSUV4dEhvc3RSZWFkeU1lc3NhZ2UgPSB7IHR5cGU6ICdWU0NPREVfRVhUSE9TVF9JUENfUkVBRFknIH07XG5cdFx0XHRwcm9jZXNzLnNlbmQ/LihyZXEpO1xuXHRcdH0pO1xuXG5cdH0gZWxzZSB7XG5cblx0XHRjb25zdCBwaXBlTmFtZSA9IGV4dEhvc3RDb25uZWN0aW9uLnBpcGVOYW1lO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFBlcnNpc3RlbnRQcm90b2NvbD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbihwaXBlTmFtZSwgKCkgPT4ge1xuXHRcdFx0XHRzb2NrZXQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdFx0Y29uc3QgcHJvdG9jb2wgPSBuZXcgUGVyc2lzdGVudFByb3RvY29sKHsgc29ja2V0OiBuZXcgTm9kZVNvY2tldChzb2NrZXQsICdleHRIb3N0LXJlbmRlcmVyJykgfSk7XG5cdFx0XHRcdHByb3RvY29sLnNlbmRSZXN1bWUoKTtcblx0XHRcdFx0cmVzb2x2ZShwcm90b2NvbCk7XG5cdFx0XHR9KTtcblx0XHRcdHNvY2tldC5vbmNlKCdlcnJvcicsIHJlamVjdCk7XG5cblx0XHRcdHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB7XG5cdFx0XHRcdG9uVGVybWluYXRlKCdyZW5kZXJlciBjbG9zZWQgdGhlIHNvY2tldCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlRXh0SG9zdFByb3RvY29sKCk6IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+IHtcblxuXHRjb25zdCBwcm90b2NvbCA9IGF3YWl0IF9jcmVhdGVFeHRIb3N0UHJvdG9jb2woKTtcblxuXHRyZXR1cm4gbmV3IGNsYXNzIGltcGxlbWVudHMgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25NZXNzYWdlID0gbmV3IEJ1ZmZlcmVkRW1pdHRlcjxWU0J1ZmZlcj4oKTtcblx0XHRyZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PFZTQnVmZmVyPiA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblxuXHRcdHByaXZhdGUgX3Rlcm1pbmF0aW5nOiBib29sZWFuO1xuXHRcdHByaXZhdGUgX3Byb3RvY29sTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hdGluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fcHJvdG9jb2xMaXN0ZW5lciA9IHByb3RvY29sLm9uTWVzc2FnZSgobXNnKSA9PiB7XG5cdFx0XHRcdGlmIChpc01lc3NhZ2VPZlR5cGUobXNnLCBNZXNzYWdlVHlwZS5UZXJtaW5hdGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYXRpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3Byb3RvY29sTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG9uVGVybWluYXRlKCdyZWNlaXZlZCB0ZXJtaW5hdGUgbWVzc2FnZSBmcm9tIHJlbmRlcmVyJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUobXNnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0c2VuZChtc2c6IGFueSk6IHZvaWQge1xuXHRcdFx0aWYgKCF0aGlzLl90ZXJtaW5hdGluZykge1xuXHRcdFx0XHRwcm90b2NvbC5zZW5kKG1zZyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXN5bmMgZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRpZiAocHJvdG9jb2wuZHJhaW4pIHtcblx0XHRcdFx0cmV0dXJuIHByb3RvY29sLmRyYWluKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBjb25uZWN0VG9SZW5kZXJlcihwcm90b2NvbDogSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wpOiBQcm9taXNlPElSZW5kZXJlckNvbm5lY3Rpb24+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPElSZW5kZXJlckNvbm5lY3Rpb24+KChjKSA9PiB7XG5cblx0XHQvLyBMaXN0ZW4gaW5pdCBkYXRhIG1lc3NhZ2Vcblx0XHRjb25zdCBmaXJzdCA9IHByb3RvY29sLm9uTWVzc2FnZShyYXcgPT4ge1xuXHRcdFx0Zmlyc3QuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCBpbml0RGF0YSA9IDxJRXh0ZW5zaW9uSG9zdEluaXREYXRhPkpTT04ucGFyc2UocmF3LnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRjb25zdCByZW5kZXJlckNvbW1pdCA9IGluaXREYXRhLmNvbW1pdDtcblx0XHRcdGNvbnN0IG15Q29tbWl0ID0gcHJvZHVjdC5jb21taXQ7XG5cblx0XHRcdGlmIChyZW5kZXJlckNvbW1pdCAmJiBteUNvbW1pdCkge1xuXHRcdFx0XHQvLyBSdW5uaW5nIGluIHRoZSBidWlsdCB2ZXJzaW9uIHdoZXJlIGNvbW1pdHMgYXJlIGRlZmluZWRcblx0XHRcdFx0aWYgKHJlbmRlcmVyQ29tbWl0ICE9PSBteUNvbW1pdCkge1xuXHRcdFx0XHRcdG5hdGl2ZUV4aXQoRXh0ZW5zaW9uSG9zdEV4aXRDb2RlLlZlcnNpb25NaXNtYXRjaCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGluaXREYXRhLnBhcmVudFBpZCkge1xuXHRcdFx0XHQvLyBLaWxsIG9uZXNlbGYgaWYgb25lJ3MgcGFyZW50IGRpZXMuIE11Y2ggZHJhbWEuXG5cdFx0XHRcdGxldCBlcGVybUVycm9ycyA9IDA7XG5cdFx0XHRcdHNldEludGVydmFsKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cHJvY2Vzcy5raWxsKGluaXREYXRhLnBhcmVudFBpZCwgMCk7IC8vIHRocm93cyBhbiBleGNlcHRpb24gaWYgdGhlIG1haW4gcHJvY2VzcyBkb2Vzbid0IGV4aXN0IGFueW1vcmUuXG5cdFx0XHRcdFx0XHRlcGVybUVycm9ycyA9IDA7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0aWYgKGUgJiYgZS5jb2RlID09PSAnRVBFUk0nKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEV2ZW4gaWYgdGhlIHBhcmVudCBwcm9jZXNzIGlzIHN0aWxsIGFsaXZlLFxuXHRcdFx0XHRcdFx0XHQvLyBzb21lIGFudGl2aXJ1cyBzb2Z0d2FyZSBjYW4gbGVhZCB0byBhbiBFUEVSTSBlcnJvciB0byBiZSB0aHJvd24gaGVyZS5cblx0XHRcdFx0XHRcdFx0Ly8gTGV0J3MgdGVybWluYXRlIG9ubHkgaWYgd2UgZ2V0IDMgY29uc2VjdXRpdmUgRVBFUk0gZXJyb3JzLlxuXHRcdFx0XHRcdFx0XHRlcGVybUVycm9ycysrO1xuXHRcdFx0XHRcdFx0XHRpZiAoZXBlcm1FcnJvcnMgPj0gMykge1xuXHRcdFx0XHRcdFx0XHRcdG9uVGVybWluYXRlKGBwYXJlbnQgcHJvY2VzcyAke2luaXREYXRhLnBhcmVudFBpZH0gZG9lcyBub3QgZXhpc3QgYW55bW9yZSAoMyB4IEVQRVJNKTogJHtlLm1lc3NhZ2V9IChjb2RlOiAke2UuY29kZX0pIChlcnJubzogJHtlLmVycm5vfSlgKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0b25UZXJtaW5hdGUoYHBhcmVudCBwcm9jZXNzICR7aW5pdERhdGEucGFyZW50UGlkfSBkb2VzIG5vdCBleGlzdCBhbnltb3JlOiAke2UubWVzc2FnZX0gKGNvZGU6ICR7ZS5jb2RlfSkgKGVycm5vOiAke2UuZXJybm99KWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMTAwMCk7XG5cblx0XHRcdFx0Ly8gSW4gY2VydGFpbiBjYXNlcywgdGhlIGV2ZW50IGxvb3AgY2FuIGJlY29tZSBidXN5IGFuZCBuZXZlciB5aWVsZFxuXHRcdFx0XHQvLyBlLmcuIHdoaWxlLXRydWUgb3IgcHJvY2Vzcy5uZXh0VGljayBlbmRsZXNzIGxvb3BzXG5cdFx0XHRcdC8vIFNvIGFsc28gdXNlIHRoZSBuYXRpdmUgbm9kZSBtb2R1bGUgdG8gZG8gaXQgZnJvbSBhIHNlcGFyYXRlIHRocmVhZFxuXHRcdFx0XHRsZXQgd2F0Y2hkb2c6IHR5cGVvZiBuYXRpdmVXYXRjaGRvZztcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR3YXRjaGRvZyA9IHJlcXVpcmUoJ0B2c2NvZGUvbmF0aXZlLXdhdGNoZG9nJyk7XG5cdFx0XHRcdFx0d2F0Y2hkb2cuc3RhcnQoaW5pdERhdGEucGFyZW50UGlkKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gbm8gcHJvYmxlbS4uLlxuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVGVsbCB0aGUgb3V0c2lkZSB0aGF0IHdlIGFyZSBpbml0aWFsaXplZFxuXHRcdFx0cHJvdG9jb2wuc2VuZChjcmVhdGVNZXNzYWdlT2ZUeXBlKE1lc3NhZ2VUeXBlLkluaXRpYWxpemVkKSk7XG5cblx0XHRcdGMoeyBwcm90b2NvbCwgaW5pdERhdGEgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyBUZWxsIHRoZSBvdXRzaWRlIHRoYXQgd2UgYXJlIHJlYWR5IHRvIHJlY2VpdmUgbWVzc2FnZXNcblx0XHRwcm90b2NvbC5zZW5kKGNyZWF0ZU1lc3NhZ2VPZlR5cGUoTWVzc2FnZVR5cGUuUmVhZHkpKTtcblx0fSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0RXh0ZW5zaW9uSG9zdFByb2Nlc3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0Ly8gUHJpbnQgYSBjb25zb2xlIG1lc3NhZ2Ugd2hlbiByZWplY3Rpb24gaXNuJ3QgaGFuZGxlZCB3aXRoaW4gTiBzZWNvbmRzLiBGb3IgZGV0YWlsczpcblx0Ly8gc2VlIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfZXZlbnRfdW5oYW5kbGVkcmVqZWN0aW9uXG5cdC8vIGFuZCBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX2V2ZW50X3JlamVjdGlvbmhhbmRsZWRcblx0Y29uc3QgdW5oYW5kbGVkUHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cdHByb2Nlc3Mub24oJ3VuaGFuZGxlZFJlamVjdGlvbicsIChyZWFzb246IGFueSwgcHJvbWlzZTogUHJvbWlzZTxhbnk+KSA9PiB7XG5cdFx0dW5oYW5kbGVkUHJvbWlzZXMucHVzaChwcm9taXNlKTtcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNvbnN0IGlkeCA9IHVuaGFuZGxlZFByb21pc2VzLmluZGV4T2YocHJvbWlzZSk7XG5cdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0cHJvbWlzZS5jYXRjaChlID0+IHtcblx0XHRcdFx0XHR1bmhhbmRsZWRQcm9taXNlcy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUud2FybihgcmVqZWN0ZWQgcHJvbWlzZSBub3QgaGFuZGxlZCB3aXRoaW4gMSBzZWNvbmQ6ICR7ZX1gKTtcblx0XHRcdFx0XHRcdGlmIChlICYmIGUuc3RhY2spIHtcblx0XHRcdFx0XHRcdFx0Y29uc29sZS53YXJuKGBzdGFjayB0cmFjZTogJHtlLnN0YWNrfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHJlYXNvbikge1xuXHRcdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihyZWFzb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSwgMTAwMCk7XG5cdH0pO1xuXG5cdHByb2Nlc3Mub24oJ3JlamVjdGlvbkhhbmRsZWQnLCAocHJvbWlzZTogUHJvbWlzZTxhbnk+KSA9PiB7XG5cdFx0Y29uc3QgaWR4ID0gdW5oYW5kbGVkUHJvbWlzZXMuaW5kZXhPZihwcm9taXNlKTtcblx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdHVuaGFuZGxlZFByb21pc2VzLnNwbGljZShpZHgsIDEpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gUHJpbnQgYSBjb25zb2xlIG1lc3NhZ2Ugd2hlbiBhbiBleGNlcHRpb24gaXNuJ3QgaGFuZGxlZC5cblx0cHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBmdW5jdGlvbiAoZXJyOiBFcnJvcikge1xuXHRcdGlmICghaXNTaWdQaXBlRXJyb3IoZXJyKSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHR9XG5cdH0pO1xuXG5cdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZXh0SG9zdC93aWxsQ29ubmVjdFRvUmVuZGVyZXJgKTtcblx0Y29uc3QgcHJvdG9jb2wgPSBhd2FpdCBjcmVhdGVFeHRIb3N0UHJvdG9jb2woKTtcblx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9leHRIb3N0L2RpZENvbm5lY3RUb1JlbmRlcmVyYCk7XG5cdGNvbnN0IHJlbmRlcmVyID0gYXdhaXQgY29ubmVjdFRvUmVuZGVyZXIocHJvdG9jb2wpO1xuXHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2V4dEhvc3QvZGlkV2FpdEZvckluaXREYXRhYCk7XG5cdGNvbnN0IHsgaW5pdERhdGEgfSA9IHJlbmRlcmVyO1xuXHQvLyBzZXR1cCB0aGluZ3Ncblx0cGF0Y2hQcm9jZXNzKCEhaW5pdERhdGEuZW52aXJvbm1lbnQuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSk7IC8vIHRvIHN1cHBvcnQgb3RoZXIgdGVzdCBmcmFtZXdvcmtzIGxpa2UgSmFzbWluIHRoYXQgdXNlIHByb2Nlc3MuZXhpdCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzM3NzA4KVxuXHRpbml0RGF0YS5lbnZpcm9ubWVudC51c2VIb3N0UHJveHkgPSBhcmdzLnVzZUhvc3RQcm94eSAhPT0gdW5kZWZpbmVkID8gYXJncy51c2VIb3N0UHJveHkgIT09ICdmYWxzZScgOiB1bmRlZmluZWQ7XG5cdGluaXREYXRhLmVudmlyb25tZW50LnNraXBXb3Jrc3BhY2VTdG9yYWdlTG9jayA9IGJvb2xlYW4oYXJncy5za2lwV29ya3NwYWNlU3RvcmFnZUxvY2ssIGZhbHNlKTtcblxuXHQvLyBob3N0IGFic3RyYWN0aW9uXG5cdGNvbnN0IGhvc3RVdGlscyA9IG5ldyBjbGFzcyBOb2RlSG9zdCBpbXBsZW1lbnRzIElIb3N0VXRpbHMge1xuXHRcdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdHB1YmxpYyByZWFkb25seSBwaWQgPSBwcm9jZXNzLnBpZDtcblx0XHRleGl0KGNvZGU6IG51bWJlcikgeyBuYXRpdmVFeGl0KGNvZGUpOyB9XG5cdFx0ZnNFeGlzdHMocGF0aDogc3RyaW5nKSB7IHJldHVybiBQcm9taXNlcy5leGlzdHMocGF0aCk7IH1cblx0XHRmc1JlYWxwYXRoKHBhdGg6IHN0cmluZykgeyByZXR1cm4gUHJvbWlzZXMucmVhbHBhdGgocGF0aCk7IH1cblx0fTtcblxuXHQvLyBBdHRlbXB0IHRvIGxvYWQgdXJpIHRyYW5zZm9ybWVyXG5cdGxldCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCA9IG51bGw7XG5cdGlmIChpbml0RGF0YS5yZW1vdGUuYXV0aG9yaXR5ICYmIGFyZ3MudHJhbnNmb3JtVVJJcykge1xuXHRcdHVyaVRyYW5zZm9ybWVyID0gY3JlYXRlVVJJVHJhbnNmb3JtZXIoaW5pdERhdGEucmVtb3RlLmF1dGhvcml0eSk7XG5cdH1cblxuXHRjb25zdCBleHRlbnNpb25Ib3N0TWFpbiA9IG5ldyBFeHRlbnNpb25Ib3N0TWFpbihcblx0XHRyZW5kZXJlci5wcm90b2NvbCxcblx0XHRpbml0RGF0YSxcblx0XHRob3N0VXRpbHMsXG5cdFx0dXJpVHJhbnNmb3JtZXJcblx0KTtcblxuXHQvLyByZXdyaXRlIG9uVGVybWluYXRlLWZ1bmN0aW9uIHRvIGJlIGEgcHJvcGVyIHNodXRkb3duXG5cdG9uVGVybWluYXRlID0gKHJlYXNvbjogc3RyaW5nKSA9PiBleHRlbnNpb25Ib3N0TWFpbi50ZXJtaW5hdGUocmVhc29uKTtcbn1cblxuc3RhcnRFeHRlbnNpb25Ib3N0UHJvY2VzcygpLmNhdGNoKChlcnIpID0+IGNvbnNvbGUubG9nKGVycikpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxjQUFjO0FBRXJCLFlBQVksU0FBUztBQUNyQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QixxQkFBcUIsZ0JBQWdCLG1CQUFtQixpQ0FBaUM7QUFDekgsU0FBUyxhQUFhO0FBQ3RCLFlBQVksaUJBQWlCO0FBRTdCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUJBQWlCLG9CQUFvQix5QkFBeUI7QUFDdkUsU0FBUyxZQUFZLDJCQUEyQjtBQUVoRCxTQUFTLGVBQWU7QUFDeEIsT0FBTyxhQUFhO0FBQ3BCLFNBQVMseUJBQWtDO0FBRTNDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCLDZCQUE2QjtBQUM3RCxTQUFTLHVCQUE0SCxhQUFhLHFCQUFxQix1QkFBdUI7QUFFOUwsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLHFCQUFxQjtBQUM5QixNQUFNQSxXQUFVLGNBQWMsWUFBWSxHQUFHO0FBVTdDLElBQUksUUFBUSxJQUFJLFlBQVk7QUFDM0IsUUFBTSxtQkFBbUIsUUFBUSxVQUFVLFNBQVM7QUFDcEQsVUFBUSxtQkFBbUIsU0FBUztBQUNwQyxVQUFRLEdBQUcsV0FBVyxDQUFDLFlBQWlCO0FBQ3ZDLFFBQUksUUFBUSxTQUFTLHlCQUF5QixRQUFRLFNBQVMseUJBQXlCLFFBQVEsU0FBUyxzQkFBc0I7QUFDOUgsY0FBUSxNQUFNLE9BQU87QUFDckI7QUFBQSxJQUNEO0FBRUEscUJBQWlCLENBQUMs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
