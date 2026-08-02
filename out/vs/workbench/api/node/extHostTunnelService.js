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
import { exec } from "child_process";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { MovingAverage } from "../../../base/common/numbers.js";
import { isLinux } from "../../../base/common/platform.js";
import * as resources from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import * as pfs from "../../../base/node/pfs.js";
import { SocketCloseEventType } from "../../../base/parts/ipc/common/ipc.net.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ManagedSocket, connectManagedSocket } from "../../../platform/remote/common/managedSocket.js";
import { ManagedRemoteConnection } from "../../../platform/remote/common/remoteAuthorityResolver.js";
import { ISignService } from "../../../platform/sign/common/sign.js";
import { isAllInterfaces, isLocalhost } from "../../../platform/tunnel/common/tunnel.js";
import { NodeRemoteTunnel } from "../../../platform/tunnel/node/tunnelService.js";
import { IExtHostInitDataService } from "../common/extHostInitDataService.js";
import { IExtHostRpcService } from "../common/extHostRpcService.js";
import { ExtHostTunnelService } from "../common/extHostTunnelService.js";
import { parseAddress } from "../../services/remote/common/tunnelModel.js";
import { IExtHostConfiguration } from "../common/extHostConfiguration.js";
function getSockets(stdout) {
  const lines = stdout.trim().split("\n");
  const mapped = [];
  lines.forEach((line) => {
    const match = /\/proc\/(\d+)\/fd\/\d+ -> socket:\[(\d+)\]/.exec(line);
    if (match && match.length >= 3) {
      mapped.push({
        pid: parseInt(match[1], 10),
        socket: parseInt(match[2], 10)
      });
    }
  });
  const socketMap = mapped.reduce((m, socket) => {
    m[socket.socket] = socket;
    return m;
  }, {});
  return socketMap;
}
function loadListeningPorts(...stdouts) {
  const table = [].concat(...stdouts.map(loadConnectionTable));
  return [
    ...new Map(
      table.filter((row) => row.st === "0A").map((row) => {
        const address = row.local_address.split(":");
        return {
          socket: parseInt(row.inode, 10),
          ip: parseIpAddress(address[0]),
          port: parseInt(address[1], 16)
        };
      }).map((port) => [port.ip + ":" + port.port, port])
    ).values()
  ];
}
function parseIpAddress(hex) {
  let result = "";
  if (hex.length === 8) {
    for (let i = hex.length - 2; i >= 0; i -= 2) {
      result += parseInt(hex.substr(i, 2), 16);
      if (i !== 0) {
        result += ".";
      }
    }
  } else {
    for (let i = 0; i < hex.length; i += 8) {
      const word = hex.substring(i, i + 8);
      let subWord = "";
      for (let j = 8; j >= 2; j -= 2) {
        subWord += word.substring(j - 2, j);
        if (j === 6 || j === 2) {
          subWord = parseInt(subWord, 16).toString(16);
          result += `${subWord}`;
          subWord = "";
          if (i + j !== hex.length - 6) {
            result += ":";
          }
        }
      }
    }
  }
  return result;
}
function loadConnectionTable(stdout) {
  const lines = stdout.trim().split("\n");
  const names = lines.shift().trim().split(/\s+/).filter((name) => name !== "rx_queue" && name !== "tm->when");
  const table = lines.map((line) => line.trim().split(/\s+/).reduce((obj, value, i) => {
    obj[names[i] || i] = value;
    return obj;
  }, {}));
  return table;
}
function knownExcludeCmdline(command) {
  if (command.length > 500) {
    return false;
  }
  return !!command.match(/.*\.vscode-server-[a-zA-Z]+\/bin.*/) || command.indexOf("out/server-main.js") !== -1 || command.indexOf("_productName=VSCode") !== -1;
}
function getRootProcesses(stdout) {
  const lines = stdout.trim().split("\n");
  const mapped = [];
  lines.forEach((line) => {
    const match = /^\d+\s+\D+\s+root\s+(\d+)\s+(\d+).+\d+\:\d+\:\d+\s+(.+)$/.exec(line);
    if (match && match.length >= 4) {
      mapped.push({
        pid: parseInt(match[1], 10),
        ppid: parseInt(match[2]),
        cmd: match[3]
      });
    }
  });
  return mapped;
}
async function findPorts(connections, socketMap, processes) {
  const processMap = processes.reduce((m, process2) => {
    m[process2.pid] = process2;
    return m;
  }, {});
  const ports = [];
  connections.forEach(({ socket, ip, port }) => {
    const pid = socketMap[socket] ? socketMap[socket].pid : void 0;
    const command = pid ? processMap[pid]?.cmd : void 0;
    if (pid && command && !knownExcludeCmdline(command)) {
      ports.push({ host: ip, port, detail: command, pid });
    }
  });
  return ports;
}
function tryFindRootPorts(connections, rootProcessesStdout, previousPorts) {
  const ports = /* @__PURE__ */ new Map();
  const rootProcesses = getRootProcesses(rootProcessesStdout);
  for (const connection of connections) {
    const previousPort = previousPorts.get(connection.port);
    if (previousPort) {
      ports.set(connection.port, previousPort);
      continue;
    }
    const rootProcessMatch = rootProcesses.find((value) => value.cmd.includes(`${connection.port}`));
    if (rootProcessMatch) {
      let bestMatch = rootProcessMatch;
      let mostChild;
      do {
        mostChild = rootProcesses.find((value) => value.ppid === bestMatch.pid);
        if (mostChild) {
          bestMatch = mostChild;
        }
      } while (mostChild);
      ports.set(connection.port, { host: connection.ip, port: connection.port, pid: bestMatch.pid, detail: bestMatch.cmd, ppid: bestMatch.ppid });
    } else {
      ports.set(connection.port, { host: connection.ip, port: connection.port, ppid: Number.MAX_VALUE });
    }
  }
  return ports;
}
let NodeExtHostTunnelService = class extends ExtHostTunnelService {
  constructor(extHostRpc, initData, logService, signService, configurationService) {
    super(extHostRpc, initData, logService);
    this.initData = initData;
    this.signService = signService;
    this.configurationService = configurationService;
    this._initialCandidates = void 0;
    this._foundRootPorts = /* @__PURE__ */ new Map();
    this._candidateFindingEnabled = false;
    if (isLinux && initData.remote.isRemote && initData.remote.authority) {
      this._proxy.$setRemoteTunnelService(process.pid);
      this.setInitialCandidates();
    }
  }
  async $registerCandidateFinder(enable) {
    if (enable && this._candidateFindingEnabled) {
      return;
    }
    this._candidateFindingEnabled = enable;
    let oldPorts = void 0;
    if (this._initialCandidates) {
      oldPorts = this._initialCandidates;
      await this._proxy.$onFoundNewCandidates(this._initialCandidates);
    }
    const movingAverage = new MovingAverage();
    let scanCount = 0;
    while (this._candidateFindingEnabled) {
      const startTime = (/* @__PURE__ */ new Date()).getTime();
      const newPorts = (await this.findCandidatePorts()).filter((candidate) => isLocalhost(candidate.host) || isAllInterfaces(candidate.host));
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) found candidate ports ${newPorts.map((port) => port.port).join(", ")}`);
      const timeTaken = (/* @__PURE__ */ new Date()).getTime() - startTime;
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) candidate port scan took ${timeTaken} ms.`);
      if (scanCount++ > 3) {
        movingAverage.update(timeTaken);
      }
      if (!oldPorts || JSON.stringify(oldPorts) !== JSON.stringify(newPorts)) {
        oldPorts = newPorts;
        await this._proxy.$onFoundNewCandidates(oldPorts);
      }
      const delay = this.calculateDelay(movingAverage.value);
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) next candidate port scan in ${delay} ms.`);
      await new Promise((resolve) => setTimeout(() => resolve(), delay));
    }
  }
  calculateDelay(movingAverage) {
    return Math.max(movingAverage * 20, 2e3);
  }
  async setInitialCandidates() {
    this._initialCandidates = await this.findCandidatePorts();
    this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) Initial candidates found: ${this._initialCandidates.map((c) => c.port).join(", ")}`);
  }
  async findCandidatePorts() {
    let tcp = "";
    let tcp6 = "";
    try {
      tcp = await fs.promises.readFile("/proc/net/tcp", "utf8");
      tcp6 = await fs.promises.readFile("/proc/net/tcp6", "utf8");
    } catch (e) {
    }
    const connections = loadListeningPorts(tcp, tcp6);
    const procSockets = await new Promise((resolve) => {
      exec("ls -l /proc/[0-9]*/fd/[0-9]* | grep socket:", (error, stdout, stderr) => {
        resolve(stdout);
      });
    });
    const socketMap = getSockets(procSockets);
    const procChildren = await pfs.Promises.readdir("/proc");
    const processes = [];
    for (const childName of procChildren) {
      try {
        const pid = Number(childName);
        const childUri = resources.joinPath(URI.file("/proc"), childName);
        const childStat = await fs.promises.stat(childUri.fsPath);
        if (childStat.isDirectory() && !isNaN(pid)) {
          const cwd = await fs.promises.readlink(resources.joinPath(childUri, "cwd").fsPath);
          const cmd = await fs.promises.readFile(resources.joinPath(childUri, "cmdline").fsPath, "utf8");
          processes.push({ pid, cwd, cmd });
        }
      } catch (e) {
      }
    }
    const unFoundConnections = [];
    const filteredConnections = connections.filter(((connection) => {
      const foundConnection = socketMap[connection.socket];
      if (!foundConnection) {
        unFoundConnections.push(connection);
      }
      return foundConnection;
    }));
    const foundPorts = findPorts(filteredConnections, socketMap, processes);
    let heuristicPorts;
    this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) number of possible root ports ${unFoundConnections.length}`);
    if (unFoundConnections.length > 0) {
      const rootProcesses = await new Promise((resolve) => {
        exec("ps -F -A -l | grep root", (error, stdout, stderr) => {
          resolve(stdout);
        });
      });
      this._foundRootPorts = tryFindRootPorts(unFoundConnections, rootProcesses, this._foundRootPorts);
      heuristicPorts = Array.from(this._foundRootPorts.values());
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) heuristic ports ${heuristicPorts.map((heuristicPort) => heuristicPort.port).join(", ")}`);
    }
    return foundPorts.then((foundCandidates) => {
      if (heuristicPorts) {
        return foundCandidates.concat(heuristicPorts);
      } else {
        return foundCandidates;
      }
    });
  }
  async defaultTunnelHost() {
    const settingValue = (await this.configurationService.getConfigProvider()).getConfiguration("remote").get("localPortHost");
    return !settingValue || settingValue === "localhost" ? "127.0.0.1" : "0.0.0.0";
  }
  makeManagedTunnelFactory(authority) {
    return async (tunnelOptions) => {
      const t = new NodeRemoteTunnel(
        {
          commit: this.initData.commit,
          quality: this.initData.quality,
          logService: this.logService,
          ipcLogger: null,
          // services and address providers have stubs since we don't need
          // the connection identification that the renderer process uses
          remoteSocketFactoryService: {
            _serviceBrand: void 0,
            async connect(_connectTo, path, query, debugLabel) {
              const result = await authority.makeConnection();
              return ExtHostManagedSocket.connect(result, path, query, debugLabel);
            },
            register() {
              throw new Error("not implemented");
            }
          },
          addressProvider: {
            getAddress() {
              return Promise.resolve({
                connectTo: new ManagedRemoteConnection(0),
                connectionToken: authority.connectionToken
              });
            }
          },
          signService: this.signService
        },
        await this.defaultTunnelHost(),
        tunnelOptions.remoteAddress.host || "localhost",
        tunnelOptions.remoteAddress.port,
        tunnelOptions.localAddressPort
      );
      await t.waitForReady();
      const disposeEmitter = new Emitter();
      return {
        localAddress: parseAddress(t.localAddress) ?? t.localAddress,
        remoteAddress: { port: t.tunnelRemotePort, host: t.tunnelRemoteHost },
        onDidDispose: disposeEmitter.event,
        dispose: () => {
          t.dispose();
          disposeEmitter.fire();
          disposeEmitter.dispose();
        }
      };
    };
  }
};
NodeExtHostTunnelService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ISignService),
  __decorateParam(4, IExtHostConfiguration)
], NodeExtHostTunnelService);
class ExtHostManagedSocket extends ManagedSocket {
  constructor(passing, debugLabel, half) {
    super(debugLabel, half);
    this.passing = passing;
  }
  static connect(passing, path, query, debugLabel) {
    const d = new DisposableStore();
    const half = {
      onClose: d.add(new Emitter()),
      onData: d.add(new Emitter()),
      onEnd: d.add(new Emitter())
    };
    d.add(passing.onDidReceiveMessage((d2) => half.onData.fire(VSBuffer.wrap(d2))));
    d.add(passing.onDidEnd(() => half.onEnd.fire()));
    d.add(passing.onDidClose((error) => half.onClose.fire({
      type: SocketCloseEventType.NodeSocketCloseEvent,
      error,
      hadError: !!error
    })));
    const socket = new ExtHostManagedSocket(passing, debugLabel, half);
    socket._register(d);
    return connectManagedSocket(socket, path, query, debugLabel, half);
  }
  write(buffer) {
    this.passing.send(buffer.buffer);
  }
  closeRemote() {
    this.passing.end();
  }
  async drain() {
    await this.passing.drain?.();
  }
}
export {
  ExtHostManagedSocket,
  NodeExtHostTunnelService,
  findPorts,
  getRootProcesses,
  getSockets,
  loadConnectionTable,
  loadListeningPorts,
  parseIpAddress,
  tryFindRootPorts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRIb3N0VHVubmVsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTW92aW5nQXZlcmFnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIHBmcyBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElTb2NrZXQsIFNvY2tldENsb3NlRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNYW5hZ2VkU29ja2V0LCBSZW1vdGVTb2NrZXRIYWxmLCBjb25uZWN0TWFuYWdlZFNvY2tldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vbWFuYWdlZFNvY2tldC5qcyc7XG5pbXBvcnQgeyBNYW5hZ2VkUmVtb3RlQ29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVNpZ25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc2lnbi9jb21tb24vc2lnbi5qcyc7XG5pbXBvcnQgeyBpc0FsbEludGVyZmFjZXMsIGlzTG9jYWxob3N0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwuanMnO1xuaW1wb3J0IHsgTm9kZVJlbW90ZVR1bm5lbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9ub2RlL3R1bm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFR1bm5lbFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdFR1bm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuZGlkYXRlUG9ydCwgcGFyc2VBZGRyZXNzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi90dW5uZWxNb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IElFeHRIb3N0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0Q29uZmlndXJhdGlvbi5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTb2NrZXRzKHN0ZG91dDogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgeyBwaWQ6IG51bWJlcjsgc29ja2V0OiBudW1iZXIgfT4ge1xuXHRjb25zdCBsaW5lcyA9IHN0ZG91dC50cmltKCkuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBtYXBwZWQ6IHsgcGlkOiBudW1iZXI7IHNvY2tldDogbnVtYmVyIH1bXSA9IFtdO1xuXHRsaW5lcy5mb3JFYWNoKGxpbmUgPT4ge1xuXHRcdGNvbnN0IG1hdGNoID0gL1xcL3Byb2NcXC8oXFxkKylcXC9mZFxcL1xcZCsgLT4gc29ja2V0OlxcWyhcXGQrKVxcXS8uZXhlYyhsaW5lKSE7XG5cdFx0aWYgKG1hdGNoICYmIG1hdGNoLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRtYXBwZWQucHVzaCh7XG5cdFx0XHRcdHBpZDogcGFyc2VJbnQobWF0Y2hbMV0sIDEwKSxcblx0XHRcdFx0c29ja2V0OiBwYXJzZUludChtYXRjaFsyXSwgMTApXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXHRjb25zdCBzb2NrZXRNYXAgPSBtYXBwZWQucmVkdWNlKChtOiBSZWNvcmQ8c3RyaW5nLCB0eXBlb2YgbWFwcGVkWzBdPiwgc29ja2V0KSA9PiB7XG5cdFx0bVtzb2NrZXQuc29ja2V0XSA9IHNvY2tldDtcblx0XHRyZXR1cm4gbTtcblx0fSwge30pO1xuXHRyZXR1cm4gc29ja2V0TWFwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZExpc3RlbmluZ1BvcnRzKC4uLnN0ZG91dHM6IHN0cmluZ1tdKTogeyBzb2NrZXQ6IG51bWJlcjsgaXA6IHN0cmluZzsgcG9ydDogbnVtYmVyIH1bXSB7XG5cdGNvbnN0IHRhYmxlID0gKFtdIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSkuY29uY2F0KC4uLnN0ZG91dHMubWFwKGxvYWRDb25uZWN0aW9uVGFibGUpKTtcblx0cmV0dXJuIFtcblx0XHQuLi5uZXcgTWFwKFxuXHRcdFx0dGFibGUuZmlsdGVyKHJvdyA9PiByb3cuc3QgPT09ICcwQScpXG5cdFx0XHRcdC5tYXAocm93ID0+IHtcblx0XHRcdFx0XHRjb25zdCBhZGRyZXNzID0gcm93LmxvY2FsX2FkZHJlc3Muc3BsaXQoJzonKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0c29ja2V0OiBwYXJzZUludChyb3cuaW5vZGUsIDEwKSxcblx0XHRcdFx0XHRcdGlwOiBwYXJzZUlwQWRkcmVzcyhhZGRyZXNzWzBdKSxcblx0XHRcdFx0XHRcdHBvcnQ6IHBhcnNlSW50KGFkZHJlc3NbMV0sIDE2KVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pLm1hcChwb3J0ID0+IFtwb3J0LmlwICsgJzonICsgcG9ydC5wb3J0LCBwb3J0XSlcblx0XHQpLnZhbHVlcygpXG5cdF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUlwQWRkcmVzcyhoZXg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSAnJztcblx0aWYgKGhleC5sZW5ndGggPT09IDgpIHtcblx0XHRmb3IgKGxldCBpID0gaGV4Lmxlbmd0aCAtIDI7IGkgPj0gMDsgaSAtPSAyKSB7XG5cdFx0XHRyZXN1bHQgKz0gcGFyc2VJbnQoaGV4LnN1YnN0cihpLCAyKSwgMTYpO1xuXHRcdFx0aWYgKGkgIT09IDApIHtcblx0XHRcdFx0cmVzdWx0ICs9ICcuJztcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gTmljZSBleHBsYW5hdGlvbiBvZiBob3N0IGZvcm1hdCBpbiB0Y3A2IGZpbGU6IGh0dHBzOi8vc2VydmVyZmF1bHQuY29tL3F1ZXN0aW9ucy81OTI1NzQvd2h5LWRvZXMtcHJvYy1uZXQtdGNwNi1yZXByZXNlbnRzLTEtYXMtMTAwMFxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaGV4Lmxlbmd0aDsgaSArPSA4KSB7XG5cdFx0XHRjb25zdCB3b3JkID0gaGV4LnN1YnN0cmluZyhpLCBpICsgOCk7XG5cdFx0XHRsZXQgc3ViV29yZCA9ICcnO1xuXHRcdFx0Zm9yIChsZXQgaiA9IDg7IGogPj0gMjsgaiAtPSAyKSB7XG5cdFx0XHRcdHN1YldvcmQgKz0gd29yZC5zdWJzdHJpbmcoaiAtIDIsIGopO1xuXHRcdFx0XHRpZiAoKGogPT09IDYpIHx8IChqID09PSAyKSkge1xuXHRcdFx0XHRcdC8vIFRyaW0gbGVhZGluZyB6ZXJvc1xuXHRcdFx0XHRcdHN1YldvcmQgPSBwYXJzZUludChzdWJXb3JkLCAxNikudG9TdHJpbmcoMTYpO1xuXHRcdFx0XHRcdHJlc3VsdCArPSBgJHtzdWJXb3JkfWA7XG5cdFx0XHRcdFx0c3ViV29yZCA9ICcnO1xuXHRcdFx0XHRcdGlmIChpICsgaiAhPT0gaGV4Lmxlbmd0aCAtIDYpIHtcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnOic7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkQ29ubmVjdGlvblRhYmxlKHN0ZG91dDogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdIHtcblx0Y29uc3QgbGluZXMgPSBzdGRvdXQudHJpbSgpLnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgbmFtZXMgPSBsaW5lcy5zaGlmdCgpIS50cmltKCkuc3BsaXQoL1xccysvKVxuXHRcdC5maWx0ZXIobmFtZSA9PiBuYW1lICE9PSAncnhfcXVldWUnICYmIG5hbWUgIT09ICd0bS0+d2hlbicpO1xuXHRjb25zdCB0YWJsZSA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpLnNwbGl0KC9cXHMrLykucmVkdWNlKChvYmo6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIHZhbHVlLCBpKSA9PiB7XG5cdFx0b2JqW25hbWVzW2ldIHx8IGldID0gdmFsdWU7XG5cdFx0cmV0dXJuIG9iajtcblx0fSwge30pKTtcblx0cmV0dXJuIHRhYmxlO1xufVxuXG5mdW5jdGlvbiBrbm93bkV4Y2x1ZGVDbWRsaW5lKGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoY29tbWFuZC5sZW5ndGggPiA1MDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuICEhY29tbWFuZC5tYXRjaCgvLipcXC52c2NvZGUtc2VydmVyLVthLXpBLVpdK1xcL2Jpbi4qLylcblx0XHR8fCAoY29tbWFuZC5pbmRleE9mKCdvdXQvc2VydmVyLW1haW4uanMnKSAhPT0gLTEpXG5cdFx0fHwgKGNvbW1hbmQuaW5kZXhPZignX3Byb2R1Y3ROYW1lPVZTQ29kZScpICE9PSAtMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSb290UHJvY2Vzc2VzKHN0ZG91dDogc3RyaW5nKSB7XG5cdGNvbnN0IGxpbmVzID0gc3Rkb3V0LnRyaW0oKS5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IG1hcHBlZDogeyBwaWQ6IG51bWJlcjsgY21kOiBzdHJpbmc7IHBwaWQ6IG51bWJlciB9W10gPSBbXTtcblx0bGluZXMuZm9yRWFjaChsaW5lID0+IHtcblx0XHRjb25zdCBtYXRjaCA9IC9eXFxkK1xccytcXEQrXFxzK3Jvb3RcXHMrKFxcZCspXFxzKyhcXGQrKS4rXFxkK1xcOlxcZCtcXDpcXGQrXFxzKyguKykkLy5leGVjKGxpbmUpITtcblx0XHRpZiAobWF0Y2ggJiYgbWF0Y2gubGVuZ3RoID49IDQpIHtcblx0XHRcdG1hcHBlZC5wdXNoKHtcblx0XHRcdFx0cGlkOiBwYXJzZUludChtYXRjaFsxXSwgMTApLFxuXHRcdFx0XHRwcGlkOiBwYXJzZUludChtYXRjaFsyXSksXG5cdFx0XHRcdGNtZDogbWF0Y2hbM11cblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBtYXBwZWQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaW5kUG9ydHMoY29ubmVjdGlvbnM6IHsgc29ja2V0OiBudW1iZXI7IGlwOiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9W10sIHNvY2tldE1hcDogUmVjb3JkPHN0cmluZywgeyBwaWQ6IG51bWJlcjsgc29ja2V0OiBudW1iZXIgfT4sIHByb2Nlc3NlczogeyBwaWQ6IG51bWJlcjsgY3dkOiBzdHJpbmc7IGNtZDogc3RyaW5nIH1bXSk6IFByb21pc2U8Q2FuZGlkYXRlUG9ydFtdPiB7XG5cdGNvbnN0IHByb2Nlc3NNYXAgPSBwcm9jZXNzZXMucmVkdWNlKChtOiBSZWNvcmQ8c3RyaW5nLCB0eXBlb2YgcHJvY2Vzc2VzWzBdPiwgcHJvY2VzcykgPT4ge1xuXHRcdG1bcHJvY2Vzcy5waWRdID0gcHJvY2Vzcztcblx0XHRyZXR1cm4gbTtcblx0fSwge30pO1xuXG5cdGNvbnN0IHBvcnRzOiBDYW5kaWRhdGVQb3J0W10gPSBbXTtcblx0Y29ubmVjdGlvbnMuZm9yRWFjaCgoeyBzb2NrZXQsIGlwLCBwb3J0IH0pID0+IHtcblx0XHRjb25zdCBwaWQgPSBzb2NrZXRNYXBbc29ja2V0XSA/IHNvY2tldE1hcFtzb2NrZXRdLnBpZCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb21tYW5kOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBwaWQgPyBwcm9jZXNzTWFwW3BpZF0/LmNtZCA6IHVuZGVmaW5lZDtcblx0XHRpZiAocGlkICYmIGNvbW1hbmQgJiYgIWtub3duRXhjbHVkZUNtZGxpbmUoY29tbWFuZCkpIHtcblx0XHRcdHBvcnRzLnB1c2goeyBob3N0OiBpcCwgcG9ydCwgZGV0YWlsOiBjb21tYW5kLCBwaWQgfSk7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIHBvcnRzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJ5RmluZFJvb3RQb3J0cyhjb25uZWN0aW9uczogeyBzb2NrZXQ6IG51bWJlcjsgaXA6IHN0cmluZzsgcG9ydDogbnVtYmVyIH1bXSwgcm9vdFByb2Nlc3Nlc1N0ZG91dDogc3RyaW5nLCBwcmV2aW91c1BvcnRzOiBNYXA8bnVtYmVyLCBDYW5kaWRhdGVQb3J0ICYgeyBwcGlkOiBudW1iZXIgfT4pOiBNYXA8bnVtYmVyLCBDYW5kaWRhdGVQb3J0ICYgeyBwcGlkOiBudW1iZXIgfT4ge1xuXHRjb25zdCBwb3J0czogTWFwPG51bWJlciwgQ2FuZGlkYXRlUG9ydCAmIHsgcHBpZDogbnVtYmVyIH0+ID0gbmV3IE1hcCgpO1xuXHRjb25zdCByb290UHJvY2Vzc2VzID0gZ2V0Um9vdFByb2Nlc3Nlcyhyb290UHJvY2Vzc2VzU3Rkb3V0KTtcblxuXHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgY29ubmVjdGlvbnMpIHtcblx0XHRjb25zdCBwcmV2aW91c1BvcnQgPSBwcmV2aW91c1BvcnRzLmdldChjb25uZWN0aW9uLnBvcnQpO1xuXHRcdGlmIChwcmV2aW91c1BvcnQpIHtcblx0XHRcdHBvcnRzLnNldChjb25uZWN0aW9uLnBvcnQsIHByZXZpb3VzUG9ydCk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3Qgcm9vdFByb2Nlc3NNYXRjaCA9IHJvb3RQcm9jZXNzZXMuZmluZCgodmFsdWUpID0+IHZhbHVlLmNtZC5pbmNsdWRlcyhgJHtjb25uZWN0aW9uLnBvcnR9YCkpO1xuXHRcdGlmIChyb290UHJvY2Vzc01hdGNoKSB7XG5cdFx0XHRsZXQgYmVzdE1hdGNoID0gcm9vdFByb2Nlc3NNYXRjaDtcblx0XHRcdC8vIFRoZXJlIGFyZSBvZnRlbiBzZXZlcmFsIHByb2Nlc3NlcyB0aGF0IFwibG9va1wiIGxpa2UgdGhleSBjb3VsZCBtYXRjaCB0aGUgcG9ydC5cblx0XHRcdC8vIFRoZSBvbmUgd2Ugd2FudCBpcyB1c3VhbGx5IHRoZSBjaGlsZCBvZiB0aGUgb3RoZXIuIEZpbmQgdGhlIG1vc3QgY2hpbGQgcHJvY2Vzcy5cblx0XHRcdGxldCBtb3N0Q2hpbGQ6IHsgcGlkOiBudW1iZXI7IGNtZDogc3RyaW5nOyBwcGlkOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0XHRcdGRvIHtcblx0XHRcdFx0bW9zdENoaWxkID0gcm9vdFByb2Nlc3Nlcy5maW5kKHZhbHVlID0+IHZhbHVlLnBwaWQgPT09IGJlc3RNYXRjaC5waWQpO1xuXHRcdFx0XHRpZiAobW9zdENoaWxkKSB7XG5cdFx0XHRcdFx0YmVzdE1hdGNoID0gbW9zdENoaWxkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlIChtb3N0Q2hpbGQpO1xuXHRcdFx0cG9ydHMuc2V0KGNvbm5lY3Rpb24ucG9ydCwgeyBob3N0OiBjb25uZWN0aW9uLmlwLCBwb3J0OiBjb25uZWN0aW9uLnBvcnQsIHBpZDogYmVzdE1hdGNoLnBpZCwgZGV0YWlsOiBiZXN0TWF0Y2guY21kLCBwcGlkOiBiZXN0TWF0Y2gucHBpZCB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cG9ydHMuc2V0KGNvbm5lY3Rpb24ucG9ydCwgeyBob3N0OiBjb25uZWN0aW9uLmlwLCBwb3J0OiBjb25uZWN0aW9uLnBvcnQsIHBwaWQ6IE51bWJlci5NQVhfVkFMVUUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHBvcnRzO1xufVxuXG5leHBvcnQgY2xhc3MgTm9kZUV4dEhvc3RUdW5uZWxTZXJ2aWNlIGV4dGVuZHMgRXh0SG9zdFR1bm5lbFNlcnZpY2Uge1xuXHRwcml2YXRlIF9pbml0aWFsQ2FuZGlkYXRlczogQ2FuZGlkYXRlUG9ydFtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mb3VuZFJvb3RQb3J0czogTWFwPG51bWJlciwgQ2FuZGlkYXRlUG9ydCAmIHsgcHBpZDogbnVtYmVyIH0+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIF9jYW5kaWRhdGVGaW5kaW5nRW5hYmxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluaXREYXRhOiBJRXh0SG9zdEluaXREYXRhU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTaWduU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNpZ25TZXJ2aWNlOiBJU2lnblNlcnZpY2UsXG5cdFx0QElFeHRIb3N0Q29uZmlndXJhdGlvbiBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRXh0SG9zdENvbmZpZ3VyYXRpb24sXG5cdCkge1xuXHRcdHN1cGVyKGV4dEhvc3RScGMsIGluaXREYXRhLCBsb2dTZXJ2aWNlKTtcblx0XHRpZiAoaXNMaW51eCAmJiBpbml0RGF0YS5yZW1vdGUuaXNSZW1vdGUgJiYgaW5pdERhdGEucmVtb3RlLmF1dGhvcml0eSkge1xuXHRcdFx0dGhpcy5fcHJveHkuJHNldFJlbW90ZVR1bm5lbFNlcnZpY2UocHJvY2Vzcy5waWQpO1xuXHRcdFx0dGhpcy5zZXRJbml0aWFsQ2FuZGlkYXRlcygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jICRyZWdpc3RlckNhbmRpZGF0ZUZpbmRlcihlbmFibGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZW5hYmxlICYmIHRoaXMuX2NhbmRpZGF0ZUZpbmRpbmdFbmFibGVkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IGVuYWJsZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jYW5kaWRhdGVGaW5kaW5nRW5hYmxlZCA9IGVuYWJsZTtcblx0XHRsZXQgb2xkUG9ydHM6IHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXI7IGRldGFpbD86IHN0cmluZyB9W10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBJZiB3ZSBhbHJlYWR5IGhhdmUgZm91bmQgaW5pdGlhbCBjYW5kaWRhdGVzIHNlbmQgdGhvc2UgaW1tZWRpYXRlbHkuXG5cdFx0aWYgKHRoaXMuX2luaXRpYWxDYW5kaWRhdGVzKSB7XG5cdFx0XHRvbGRQb3J0cyA9IHRoaXMuX2luaXRpYWxDYW5kaWRhdGVzO1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJG9uRm91bmROZXdDYW5kaWRhdGVzKHRoaXMuX2luaXRpYWxDYW5kaWRhdGVzKTtcblx0XHR9XG5cblx0XHQvLyBSZWd1bGFybHkgc2NhbiB0byBzZWUgaWYgdGhlIGNhbmRpZGF0ZSBwb3J0cyBoYXZlIGNoYW5nZWQuXG5cdFx0Y29uc3QgbW92aW5nQXZlcmFnZSA9IG5ldyBNb3ZpbmdBdmVyYWdlKCk7XG5cdFx0bGV0IHNjYW5Db3VudCA9IDA7XG5cdFx0d2hpbGUgKHRoaXMuX2NhbmRpZGF0ZUZpbmRpbmdFbmFibGVkKSB7XG5cdFx0XHRjb25zdCBzdGFydFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblx0XHRcdGNvbnN0IG5ld1BvcnRzID0gKGF3YWl0IHRoaXMuZmluZENhbmRpZGF0ZVBvcnRzKCkpLmZpbHRlcihjYW5kaWRhdGUgPT4gKGlzTG9jYWxob3N0KGNhbmRpZGF0ZS5ob3N0KSB8fCBpc0FsbEludGVyZmFjZXMoY2FuZGlkYXRlLmhvc3QpKSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoRXh0SG9zdFR1bm5lbFNlcnZpY2UpIGZvdW5kIGNhbmRpZGF0ZSBwb3J0cyAke25ld1BvcnRzLm1hcChwb3J0ID0+IHBvcnQucG9ydCkuam9pbignLCAnKX1gKTtcblx0XHRcdGNvbnN0IHRpbWVUYWtlbiA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnRUaW1lO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKEV4dEhvc3RUdW5uZWxTZXJ2aWNlKSBjYW5kaWRhdGUgcG9ydCBzY2FuIHRvb2sgJHt0aW1lVGFrZW59IG1zLmApO1xuXHRcdFx0Ly8gRG8gbm90IGNvdW50IHRoZSBmaXJzdCBmZXcgc2NhbnMgdG93YXJkcyB0aGUgbW92aW5nIGF2ZXJhZ2UgYXMgdGhleSBhcmUgbGlrZWx5IHRvIGJlIHNsb3dlci5cblx0XHRcdGlmIChzY2FuQ291bnQrKyA+IDMpIHtcblx0XHRcdFx0bW92aW5nQXZlcmFnZS51cGRhdGUodGltZVRha2VuKTtcblx0XHRcdH1cblx0XHRcdGlmICghb2xkUG9ydHMgfHwgKEpTT04uc3RyaW5naWZ5KG9sZFBvcnRzKSAhPT0gSlNPTi5zdHJpbmdpZnkobmV3UG9ydHMpKSkge1xuXHRcdFx0XHRvbGRQb3J0cyA9IG5ld1BvcnRzO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kb25Gb3VuZE5ld0NhbmRpZGF0ZXMob2xkUG9ydHMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVsYXkgPSB0aGlzLmNhbGN1bGF0ZURlbGF5KG1vdmluZ0F2ZXJhZ2UudmFsdWUpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKEV4dEhvc3RUdW5uZWxTZXJ2aWNlKSBuZXh0IGNhbmRpZGF0ZSBwb3J0IHNjYW4gaW4gJHtkZWxheX0gbXMuYCk7XG5cdFx0XHRhd2FpdCAobmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoKSwgZGVsYXkpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjYWxjdWxhdGVEZWxheShtb3ZpbmdBdmVyYWdlOiBudW1iZXIpIHtcblx0XHQvLyBTb21lIGxvY2FsIHRlc3RpbmcgaW5kaWNhdGVkIHRoYXQgdGhlIG1vdmluZyBhdmVyYWdlIG1pZ2h0IGJlIGJldHdlZW4gNTAtMTAwIG1zLlxuXHRcdHJldHVybiBNYXRoLm1heChtb3ZpbmdBdmVyYWdlICogMjAsIDIwMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZXRJbml0aWFsQ2FuZGlkYXRlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9pbml0aWFsQ2FuZGlkYXRlcyA9IGF3YWl0IHRoaXMuZmluZENhbmRpZGF0ZVBvcnRzKCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKEV4dEhvc3RUdW5uZWxTZXJ2aWNlKSBJbml0aWFsIGNhbmRpZGF0ZXMgZm91bmQ6ICR7dGhpcy5faW5pdGlhbENhbmRpZGF0ZXMubWFwKGMgPT4gYy5wb3J0KS5qb2luKCcsICcpfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmaW5kQ2FuZGlkYXRlUG9ydHMoKTogUHJvbWlzZTxDYW5kaWRhdGVQb3J0W10+IHtcblx0XHRsZXQgdGNwOiBzdHJpbmcgPSAnJztcblx0XHRsZXQgdGNwNjogc3RyaW5nID0gJyc7XG5cdFx0dHJ5IHtcblx0XHRcdHRjcCA9IGF3YWl0IGZzLnByb21pc2VzLnJlYWRGaWxlKCcvcHJvYy9uZXQvdGNwJywgJ3V0ZjgnKTtcblx0XHRcdHRjcDYgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZSgnL3Byb2MvbmV0L3RjcDYnLCAndXRmOCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIEZpbGUgcmVhZGluZyBlcnJvci4gTm8gYWRkaXRpb25hbCBoYW5kbGluZyBuZWVkZWQuXG5cdFx0fVxuXHRcdGNvbnN0IGNvbm5lY3Rpb25zOiB7IHNvY2tldDogbnVtYmVyOyBpcDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfVtdID0gbG9hZExpc3RlbmluZ1BvcnRzKHRjcCwgdGNwNik7XG5cblx0XHRjb25zdCBwcm9jU29ja2V0czogc3RyaW5nID0gYXdhaXQgKG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0ZXhlYygnbHMgLWwgL3Byb2MvWzAtOV0qL2ZkL1swLTldKiB8IGdyZXAgc29ja2V0OicsIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHNvY2tldE1hcCA9IGdldFNvY2tldHMocHJvY1NvY2tldHMpO1xuXG5cdFx0Y29uc3QgcHJvY0NoaWxkcmVuID0gYXdhaXQgcGZzLlByb21pc2VzLnJlYWRkaXIoJy9wcm9jJyk7XG5cdFx0Y29uc3QgcHJvY2Vzc2VzOiB7XG5cdFx0XHRwaWQ6IG51bWJlcjsgY3dkOiBzdHJpbmc7IGNtZDogc3RyaW5nO1xuXHRcdH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGROYW1lIG9mIHByb2NDaGlsZHJlbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGlkOiBudW1iZXIgPSBOdW1iZXIoY2hpbGROYW1lKTtcblx0XHRcdFx0Y29uc3QgY2hpbGRVcmkgPSByZXNvdXJjZXMuam9pblBhdGgoVVJJLmZpbGUoJy9wcm9jJyksIGNoaWxkTmFtZSk7XG5cdFx0XHRcdGNvbnN0IGNoaWxkU3RhdCA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQoY2hpbGRVcmkuZnNQYXRoKTtcblx0XHRcdFx0aWYgKGNoaWxkU3RhdC5pc0RpcmVjdG9yeSgpICYmICFpc05hTihwaWQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3dkID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZGxpbmsocmVzb3VyY2VzLmpvaW5QYXRoKGNoaWxkVXJpLCAnY3dkJykuZnNQYXRoKTtcblx0XHRcdFx0XHRjb25zdCBjbWQgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShyZXNvdXJjZXMuam9pblBhdGgoY2hpbGRVcmksICdjbWRsaW5lJykuZnNQYXRoLCAndXRmOCcpO1xuXHRcdFx0XHRcdHByb2Nlc3Nlcy5wdXNoKHsgcGlkLCBjd2QsIGNtZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvL1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVuRm91bmRDb25uZWN0aW9uczogeyBzb2NrZXQ6IG51bWJlcjsgaXA6IHN0cmluZzsgcG9ydDogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGZpbHRlcmVkQ29ubmVjdGlvbnMgPSBjb25uZWN0aW9ucy5maWx0ZXIoKGNvbm5lY3Rpb24gPT4ge1xuXHRcdFx0Y29uc3QgZm91bmRDb25uZWN0aW9uID0gc29ja2V0TWFwW2Nvbm5lY3Rpb24uc29ja2V0XTtcblx0XHRcdGlmICghZm91bmRDb25uZWN0aW9uKSB7XG5cdFx0XHRcdHVuRm91bmRDb25uZWN0aW9ucy5wdXNoKGNvbm5lY3Rpb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZvdW5kQ29ubmVjdGlvbjtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBmb3VuZFBvcnRzID0gZmluZFBvcnRzKGZpbHRlcmVkQ29ubmVjdGlvbnMsIHNvY2tldE1hcCwgcHJvY2Vzc2VzKTtcblx0XHRsZXQgaGV1cmlzdGljUG9ydHM6IENhbmRpZGF0ZVBvcnRbXSB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoRXh0SG9zdFR1bm5lbFNlcnZpY2UpIG51bWJlciBvZiBwb3NzaWJsZSByb290IHBvcnRzICR7dW5Gb3VuZENvbm5lY3Rpb25zLmxlbmd0aH1gKTtcblx0XHRpZiAodW5Gb3VuZENvbm5lY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHJvb3RQcm9jZXNzZXM6IHN0cmluZyA9IGF3YWl0IChuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0ZXhlYygncHMgLUYgLUEgLWwgfCBncmVwIHJvb3QnLCAoZXJyb3IsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2ZvdW5kUm9vdFBvcnRzID0gdHJ5RmluZFJvb3RQb3J0cyh1bkZvdW5kQ29ubmVjdGlvbnMsIHJvb3RQcm9jZXNzZXMsIHRoaXMuX2ZvdW5kUm9vdFBvcnRzKTtcblx0XHRcdGhldXJpc3RpY1BvcnRzID0gQXJyYXkuZnJvbSh0aGlzLl9mb3VuZFJvb3RQb3J0cy52YWx1ZXMoKSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoRXh0SG9zdFR1bm5lbFNlcnZpY2UpIGhldXJpc3RpYyBwb3J0cyAke2hldXJpc3RpY1BvcnRzLm1hcChoZXVyaXN0aWNQb3J0ID0+IGhldXJpc3RpY1BvcnQucG9ydCkuam9pbignLCAnKX1gKTtcblxuXHRcdH1cblx0XHRyZXR1cm4gZm91bmRQb3J0cy50aGVuKGZvdW5kQ2FuZGlkYXRlcyA9PiB7XG5cdFx0XHRpZiAoaGV1cmlzdGljUG9ydHMpIHtcblx0XHRcdFx0cmV0dXJuIGZvdW5kQ2FuZGlkYXRlcy5jb25jYXQoaGV1cmlzdGljUG9ydHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGZvdW5kQ2FuZGlkYXRlcztcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVmYXVsdFR1bm5lbEhvc3QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzZXR0aW5nVmFsdWUgPSAoYXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRDb25maWdQcm92aWRlcigpKS5nZXRDb25maWd1cmF0aW9uKCdyZW1vdGUnKS5nZXQoJ2xvY2FsUG9ydEhvc3QnKTtcblx0XHRyZXR1cm4gKCFzZXR0aW5nVmFsdWUgfHwgc2V0dGluZ1ZhbHVlID09PSAnbG9jYWxob3N0JykgPyAnMTI3LjAuMC4xJyA6ICcwLjAuMC4wJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBtYWtlTWFuYWdlZFR1bm5lbEZhY3RvcnkoYXV0aG9yaXR5OiB2c2NvZGUuTWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5KTogdnNjb2RlLlJlbW90ZUF1dGhvcml0eVJlc29sdmVyWyd0dW5uZWxGYWN0b3J5J10ge1xuXHRcdHJldHVybiBhc3luYyAodHVubmVsT3B0aW9ucykgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IG5ldyBOb2RlUmVtb3RlVHVubmVsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29tbWl0OiB0aGlzLmluaXREYXRhLmNvbW1pdCxcblx0XHRcdFx0XHRxdWFsaXR5OiB0aGlzLmluaXREYXRhLnF1YWxpdHksXG5cdFx0XHRcdFx0bG9nU2VydmljZTogdGhpcy5sb2dTZXJ2aWNlLFxuXHRcdFx0XHRcdGlwY0xvZ2dlcjogbnVsbCxcblx0XHRcdFx0XHQvLyBzZXJ2aWNlcyBhbmQgYWRkcmVzcyBwcm92aWRlcnMgaGF2ZSBzdHVicyBzaW5jZSB3ZSBkb24ndCBuZWVkXG5cdFx0XHRcdFx0Ly8gdGhlIGNvbm5lY3Rpb24gaWRlbnRpZmljYXRpb24gdGhhdCB0aGUgcmVuZGVyZXIgcHJvY2VzcyB1c2VzXG5cdFx0XHRcdFx0cmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2U6IHtcblx0XHRcdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGFzeW5jIGNvbm5lY3QoX2Nvbm5lY3RUbzogTWFuYWdlZFJlbW90ZUNvbm5lY3Rpb24sIHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZywgZGVidWdMYWJlbDogc3RyaW5nKTogUHJvbWlzZTxJU29ja2V0PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGF1dGhvcml0eS5tYWtlQ29ubmVjdGlvbigpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdE1hbmFnZWRTb2NrZXQuY29ubmVjdChyZXN1bHQsIHBhdGgsIHF1ZXJ5LCBkZWJ1Z0xhYmVsKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRyZWdpc3RlcigpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhZGRyZXNzUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRcdGdldEFkZHJlc3MoKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRcdFx0XHRcdGNvbm5lY3RUbzogbmV3IE1hbmFnZWRSZW1vdGVDb25uZWN0aW9uKDApLFxuXHRcdFx0XHRcdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogYXV0aG9yaXR5LmNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c2lnblNlcnZpY2U6IHRoaXMuc2lnblNlcnZpY2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGF3YWl0IHRoaXMuZGVmYXVsdFR1bm5lbEhvc3QoKSxcblx0XHRcdFx0dHVubmVsT3B0aW9ucy5yZW1vdGVBZGRyZXNzLmhvc3QgfHwgJ2xvY2FsaG9zdCcsXG5cdFx0XHRcdHR1bm5lbE9wdGlvbnMucmVtb3RlQWRkcmVzcy5wb3J0LFxuXHRcdFx0XHR0dW5uZWxPcHRpb25zLmxvY2FsQWRkcmVzc1BvcnQsXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCB0LndhaXRGb3JSZWFkeSgpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxvY2FsQWRkcmVzczogcGFyc2VBZGRyZXNzKHQubG9jYWxBZGRyZXNzKSA/PyB0LmxvY2FsQWRkcmVzcyxcblx0XHRcdFx0cmVtb3RlQWRkcmVzczogeyBwb3J0OiB0LnR1bm5lbFJlbW90ZVBvcnQsIGhvc3Q6IHQudHVubmVsUmVtb3RlSG9zdCB9LFxuXHRcdFx0XHRvbkRpZERpc3Bvc2U6IGRpc3Bvc2VFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0dC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZGlzcG9zZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHRcdGRpc3Bvc2VFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdE1hbmFnZWRTb2NrZXQgZXh0ZW5kcyBNYW5hZ2VkU29ja2V0IHtcblx0cHVibGljIHN0YXRpYyBjb25uZWN0KFxuXHRcdHBhc3Npbmc6IHZzY29kZS5NYW5hZ2VkTWVzc2FnZVBhc3NpbmcsXG5cdFx0cGF0aDogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCBkZWJ1Z0xhYmVsOiBzdHJpbmcsXG5cdCk6IFByb21pc2U8RXh0SG9zdE1hbmFnZWRTb2NrZXQ+IHtcblx0XHRjb25zdCBkID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGhhbGY6IFJlbW90ZVNvY2tldEhhbGYgPSB7XG5cdFx0XHRvbkNsb3NlOiBkLmFkZChuZXcgRW1pdHRlcigpKSxcblx0XHRcdG9uRGF0YTogZC5hZGQobmV3IEVtaXR0ZXIoKSksXG5cdFx0XHRvbkVuZDogZC5hZGQobmV3IEVtaXR0ZXIoKSksXG5cdFx0fTtcblxuXHRcdGQuYWRkKHBhc3Npbmcub25EaWRSZWNlaXZlTWVzc2FnZShkID0+IGhhbGYub25EYXRhLmZpcmUoVlNCdWZmZXIud3JhcChkKSkpKTtcblx0XHRkLmFkZChwYXNzaW5nLm9uRGlkRW5kKCgpID0+IGhhbGYub25FbmQuZmlyZSgpKSk7XG5cdFx0ZC5hZGQocGFzc2luZy5vbkRpZENsb3NlKGVycm9yID0+IGhhbGYub25DbG9zZS5maXJlKHtcblx0XHRcdHR5cGU6IFNvY2tldENsb3NlRXZlbnRUeXBlLk5vZGVTb2NrZXRDbG9zZUV2ZW50LFxuXHRcdFx0ZXJyb3IsXG5cdFx0XHRoYWRFcnJvcjogISFlcnJvclxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBzb2NrZXQgPSBuZXcgRXh0SG9zdE1hbmFnZWRTb2NrZXQocGFzc2luZywgZGVidWdMYWJlbCwgaGFsZik7XG5cdFx0c29ja2V0Ll9yZWdpc3RlcihkKTtcblx0XHRyZXR1cm4gY29ubmVjdE1hbmFnZWRTb2NrZXQoc29ja2V0LCBwYXRoLCBxdWVyeSwgZGVidWdMYWJlbCwgaGFsZik7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhc3Npbmc6IHZzY29kZS5NYW5hZ2VkTWVzc2FnZVBhc3NpbmcsXG5cdFx0ZGVidWdMYWJlbDogc3RyaW5nLFxuXHRcdGhhbGY6IFJlbW90ZVNvY2tldEhhbGYsXG5cdCkge1xuXHRcdHN1cGVyKGRlYnVnTGFiZWwsIGhhbGYpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHdyaXRlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLnBhc3Npbmcuc2VuZChidWZmZXIuYnVmZmVyKTtcblx0fVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY2xvc2VSZW1vdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5wYXNzaW5nLmVuZCgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIGRyYWluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucGFzc2luZy5kcmFpbj8uKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlO0FBQ3hCLFlBQVksZUFBZTtBQUMzQixTQUFTLFdBQVc7QUFDcEIsWUFBWSxTQUFTO0FBQ3JCLFNBQWtCLDRCQUE0QjtBQUM5QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWlDLDRCQUE0QjtBQUN0RSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQixtQkFBbUI7QUFDN0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBd0Is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
