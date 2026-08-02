import * as cp from "child_process";
import * as net from "net";
import * as objects from "../../../../base/common/objects.js";
import * as path from "../../../../base/common/path.js";
import * as platform from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import { Promises } from "../../../../base/node/pfs.js";
import * as nls from "../../../../nls.js";
import { AbstractDebugAdapter } from "../common/abstractDebugAdapter.js";
import { killTree } from "../../../../base/node/processes.js";
const _StreamDebugAdapter = class _StreamDebugAdapter extends AbstractDebugAdapter {
  constructor() {
    super();
    this.rawData = Buffer.allocUnsafe(0);
    this.contentLength = -1;
  }
  connect(readable, writable) {
    this.outputStream = writable;
    this.rawData = Buffer.allocUnsafe(0);
    this.contentLength = -1;
    readable.on("data", (data) => this.handleData(data));
  }
  sendMessage(message) {
    if (this.outputStream) {
      const json = JSON.stringify(message);
      this.outputStream.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}${_StreamDebugAdapter.TWO_CRLF}${json}`, "utf8");
    }
  }
  handleData(data) {
    this.rawData = Buffer.concat([this.rawData, data]);
    while (true) {
      if (this.contentLength >= 0) {
        if (this.rawData.length >= this.contentLength) {
          const message = this.rawData.toString("utf8", 0, this.contentLength);
          this.rawData = this.rawData.slice(this.contentLength);
          this.contentLength = -1;
          if (message.length > 0) {
            try {
              this.acceptMessage(JSON.parse(message));
            } catch (e) {
              this._onError.fire(new Error((e.message || e) + "\n" + message));
            }
          }
          continue;
        }
      } else {
        const idx = this.rawData.indexOf(_StreamDebugAdapter.TWO_CRLF);
        if (idx !== -1) {
          const header = this.rawData.toString("utf8", 0, idx);
          const lines = header.split(_StreamDebugAdapter.HEADER_LINESEPARATOR);
          for (const h of lines) {
            const kvPair = h.split(_StreamDebugAdapter.HEADER_FIELDSEPARATOR);
            if (kvPair[0] === "Content-Length") {
              this.contentLength = Number(kvPair[1]);
            }
          }
          this.rawData = this.rawData.slice(idx + _StreamDebugAdapter.TWO_CRLF.length);
          continue;
        }
      }
      break;
    }
  }
};
_StreamDebugAdapter.TWO_CRLF = "\r\n\r\n";
_StreamDebugAdapter.HEADER_LINESEPARATOR = /\r?\n/;
// allow for non-RFC 2822 conforming line separators
_StreamDebugAdapter.HEADER_FIELDSEPARATOR = /: */;
let StreamDebugAdapter = _StreamDebugAdapter;
class NetworkDebugAdapter extends StreamDebugAdapter {
  startSession() {
    return new Promise((resolve, reject) => {
      let connected = false;
      this.socket = this.createConnection(() => {
        this.connect(this.socket, this.socket);
        resolve();
        connected = true;
      });
      this.socket.on("close", () => {
        if (connected) {
          this._onError.fire(new Error("connection closed"));
        } else {
          reject(new Error("connection closed"));
        }
      });
      this.socket.on("error", (error) => {
        if (error instanceof AggregateError) {
          error = error.errors[0];
        }
        if (connected) {
          this._onError.fire(error);
        } else {
          reject(error);
        }
      });
    });
  }
  async stopSession() {
    await this.cancelPendingRequests();
    if (this.socket) {
      this.socket.end();
      this.socket = void 0;
    }
  }
}
class SocketDebugAdapter extends NetworkDebugAdapter {
  constructor(adapterServer) {
    super();
    this.adapterServer = adapterServer;
  }
  createConnection(connectionListener) {
    return net.createConnection(this.adapterServer.port, this.adapterServer.host || "127.0.0.1", connectionListener);
  }
}
class NamedPipeDebugAdapter extends NetworkDebugAdapter {
  constructor(adapterServer) {
    super();
    this.adapterServer = adapterServer;
  }
  createConnection(connectionListener) {
    return net.createConnection(this.adapterServer.path, connectionListener);
  }
}
class ExecutableDebugAdapter extends StreamDebugAdapter {
  constructor(adapterExecutable, debugType) {
    super();
    this.adapterExecutable = adapterExecutable;
    this.debugType = debugType;
  }
  async startSession() {
    const command = this.adapterExecutable.command;
    const args = this.adapterExecutable.args;
    const options = this.adapterExecutable.options || {};
    try {
      if (command) {
        if (path.isAbsolute(command)) {
          const commandExists = await Promises.exists(command);
          if (!commandExists) {
            throw new Error(nls.localize("debugAdapterBinNotFound", "Debug adapter executable '{0}' does not exist.", command));
          }
        } else {
          if (command.indexOf("/") < 0 && command.indexOf("\\") < 0) {
          }
        }
      } else {
        throw new Error(nls.localize(
          { key: "debugAdapterCannotDetermineExecutable", comment: ["Adapter executable file not found"] },
          "Cannot determine executable for debug adapter '{0}'.",
          this.debugType
        ));
      }
      let env = process.env;
      if (options.env && Object.keys(options.env).length > 0) {
        env = objects.mixin(objects.deepClone(process.env), options.env);
      }
      if (command === "node") {
        if (Array.isArray(args) && args.length > 0) {
          const isElectron = !!process.env["ELECTRON_RUN_AS_NODE"] || !!process.versions["electron"];
          const forkOptions = {
            env,
            execArgv: isElectron ? ["-e", "delete process.env.ELECTRON_RUN_AS_NODE;require(process.argv[1])"] : [],
            silent: true
          };
          if (options.cwd) {
            forkOptions.cwd = options.cwd;
          }
          const child = cp.fork(args[0], args.slice(1), forkOptions);
          if (!child.pid) {
            throw new Error(nls.localize("unableToLaunchDebugAdapter", "Unable to launch debug adapter from '{0}'.", args[0]));
          }
          this.serverProcess = child;
        } else {
          throw new Error(nls.localize("unableToLaunchDebugAdapterNoArgs", "Unable to launch debug adapter."));
        }
      } else {
        let spawnCommand = command;
        let spawnArgs = args;
        const spawnOptions = {
          env
        };
        if (options.cwd) {
          spawnOptions.cwd = options.cwd;
        }
        if (platform.isWindows && (command.endsWith(".bat") || command.endsWith(".cmd"))) {
          spawnOptions.shell = true;
          spawnCommand = `"${command}"`;
          spawnArgs = args.map((a) => {
            a = a.replace(/"/g, '\\"');
            return `"${a}"`;
          });
        }
        this.serverProcess = cp.spawn(spawnCommand, spawnArgs, spawnOptions);
      }
      this.serverProcess.on("error", (err) => {
        this._onError.fire(err);
      });
      this.serverProcess.on("exit", (code, signal) => {
        this._onExit.fire(code);
      });
      this.serverProcess.stdout.on("close", () => {
        this._onError.fire(new Error("read error"));
      });
      this.serverProcess.stdout.on("error", (error) => {
        this._onError.fire(error);
      });
      this.serverProcess.stdin.on("error", (error) => {
        this._onError.fire(error);
      });
      this.serverProcess.stderr.resume();
      this.connect(this.serverProcess.stdout, this.serverProcess.stdin);
    } catch (err) {
      this._onError.fire(err);
    }
  }
  async stopSession() {
    if (!this.serverProcess) {
      return Promise.resolve(void 0);
    }
    await this.cancelPendingRequests();
    if (platform.isWindows) {
      return killTree(this.serverProcess.pid, true).catch(() => {
        this.serverProcess?.kill();
      });
    } else {
      this.serverProcess.kill("SIGTERM");
      return Promise.resolve(void 0);
    }
  }
  static extract(platformContribution, extensionFolderPath) {
    if (!platformContribution) {
      return void 0;
    }
    const result = /* @__PURE__ */ Object.create(null);
    if (platformContribution.runtime) {
      if (platformContribution.runtime.indexOf("./") === 0) {
        result.runtime = path.join(extensionFolderPath, platformContribution.runtime);
      } else {
        result.runtime = platformContribution.runtime;
      }
    }
    if (platformContribution.runtimeArgs) {
      result.runtimeArgs = platformContribution.runtimeArgs;
    }
    if (platformContribution.program) {
      if (!path.isAbsolute(platformContribution.program)) {
        result.program = path.join(extensionFolderPath, platformContribution.program);
      } else {
        result.program = platformContribution.program;
      }
    }
    if (platformContribution.args) {
      result.args = platformContribution.args;
    }
    const contribution = platformContribution;
    if (contribution.win) {
      result.win = ExecutableDebugAdapter.extract(contribution.win, extensionFolderPath);
    }
    if (contribution.winx86) {
      result.winx86 = ExecutableDebugAdapter.extract(contribution.winx86, extensionFolderPath);
    }
    if (contribution.windows) {
      result.windows = ExecutableDebugAdapter.extract(contribution.windows, extensionFolderPath);
    }
    if (contribution.osx) {
      result.osx = ExecutableDebugAdapter.extract(contribution.osx, extensionFolderPath);
    }
    if (contribution.linux) {
      result.linux = ExecutableDebugAdapter.extract(contribution.linux, extensionFolderPath);
    }
    return result;
  }
  static platformAdapterExecutable(extensionDescriptions, debugType) {
    let result = /* @__PURE__ */ Object.create(null);
    debugType = debugType.toLowerCase();
    for (const ed of extensionDescriptions) {
      if (ed.contributes) {
        const debuggers = ed.contributes["debuggers"];
        if (debuggers && debuggers.length > 0) {
          debuggers.filter((dbg) => typeof dbg.type === "string" && strings.equalsIgnoreCase(dbg.type, debugType)).forEach((dbg) => {
            const extractedDbg = ExecutableDebugAdapter.extract(dbg, ed.extensionLocation.fsPath);
            result = objects.mixin(result, extractedDbg, ed.isBuiltin);
          });
        }
      }
    }
    let platformInfo;
    if (platform.isWindows && !process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432")) {
      platformInfo = result.winx86 || result.win || result.windows;
    } else if (platform.isWindows) {
      platformInfo = result.win || result.windows;
    } else if (platform.isMacintosh) {
      platformInfo = result.osx;
    } else if (platform.isLinux) {
      platformInfo = result.linux;
    }
    platformInfo = platformInfo || result;
    const program = platformInfo.program || result.program;
    const args = platformInfo.args || result.args;
    const runtime = platformInfo.runtime || result.runtime;
    const runtimeArgs = platformInfo.runtimeArgs || result.runtimeArgs;
    if (runtime) {
      return {
        type: "executable",
        command: runtime,
        args: (runtimeArgs || []).concat(typeof program === "string" ? [program] : []).concat(args || [])
      };
    } else if (program) {
      return {
        type: "executable",
        command: program,
        args: args || []
      };
    }
    return void 0;
  }
}
export {
  ExecutableDebugAdapter,
  NamedPipeDebugAdapter,
  NetworkDebugAdapter,
  SocketDebugAdapter,
  StreamDebugAdapter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL25vZGUvZGVidWdBZGFwdGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCAqIGFzIHN0cmVhbSBmcm9tICdzdHJlYW0nO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRGVidWdBZGFwdGVyRXhlY3V0YWJsZSwgSURlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlciwgSURlYnVnQWRhcHRlclNlcnZlciwgSURlYnVnZ2VyQ29udHJpYnV0aW9uLCBJUGxhdGZvcm1TcGVjaWZpY0FkYXB0ZXJDb250cmlidXRpb24gfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3REZWJ1Z0FkYXB0ZXIgfSBmcm9tICcuLi9jb21tb24vYWJzdHJhY3REZWJ1Z0FkYXB0ZXIuanMnO1xuaW1wb3J0IHsga2lsbFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcHJvY2Vzc2VzLmpzJztcblxuLyoqXG4gKiBBbiBpbXBsZW1lbnRhdGlvbiB0aGF0IGNvbW11bmljYXRlcyB2aWEgdHdvIHN0cmVhbXMgd2l0aCB0aGUgZGVidWcgYWRhcHRlci5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFN0cmVhbURlYnVnQWRhcHRlciBleHRlbmRzIEFic3RyYWN0RGVidWdBZGFwdGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBUV09fQ1JMRiA9ICdcXHJcXG5cXHJcXG4nO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBIRUFERVJfTElORVNFUEFSQVRPUiA9IC9cXHI/XFxuLztcdC8vIGFsbG93IGZvciBub24tUkZDIDI4MjIgY29uZm9ybWluZyBsaW5lIHNlcGFyYXRvcnNcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSEVBREVSX0ZJRUxEU0VQQVJBVE9SID0gLzogKi87XG5cblx0cHJpdmF0ZSBvdXRwdXRTdHJlYW0hOiBzdHJlYW0uV3JpdGFibGU7XG5cdHByaXZhdGUgcmF3RGF0YSA9IEJ1ZmZlci5hbGxvY1Vuc2FmZSgwKTtcblx0cHJpdmF0ZSBjb250ZW50TGVuZ3RoID0gLTE7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb25uZWN0KHJlYWRhYmxlOiBzdHJlYW0uUmVhZGFibGUsIHdyaXRhYmxlOiBzdHJlYW0uV3JpdGFibGUpOiB2b2lkIHtcblxuXHRcdHRoaXMub3V0cHV0U3RyZWFtID0gd3JpdGFibGU7XG5cdFx0dGhpcy5yYXdEYXRhID0gQnVmZmVyLmFsbG9jVW5zYWZlKDApO1xuXHRcdHRoaXMuY29udGVudExlbmd0aCA9IC0xO1xuXG5cdFx0cmVhZGFibGUub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB0aGlzLmhhbmRsZURhdGEoZGF0YSkpO1xuXHR9XG5cblx0c2VuZE1lc3NhZ2UobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblxuXHRcdGlmICh0aGlzLm91dHB1dFN0cmVhbSkge1xuXHRcdFx0Y29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpO1xuXHRcdFx0dGhpcy5vdXRwdXRTdHJlYW0ud3JpdGUoYENvbnRlbnQtTGVuZ3RoOiAke0J1ZmZlci5ieXRlTGVuZ3RoKGpzb24sICd1dGY4Jyl9JHtTdHJlYW1EZWJ1Z0FkYXB0ZXIuVFdPX0NSTEZ9JHtqc29ufWAsICd1dGY4Jyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVEYXRhKGRhdGE6IEJ1ZmZlcik6IHZvaWQge1xuXG5cdFx0dGhpcy5yYXdEYXRhID0gQnVmZmVyLmNvbmNhdChbdGhpcy5yYXdEYXRhLCBkYXRhXSk7XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHRoaXMuY29udGVudExlbmd0aCA+PSAwKSB7XG5cdFx0XHRcdGlmICh0aGlzLnJhd0RhdGEubGVuZ3RoID49IHRoaXMuY29udGVudExlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnJhd0RhdGEudG9TdHJpbmcoJ3V0ZjgnLCAwLCB0aGlzLmNvbnRlbnRMZW5ndGgpO1xuXHRcdFx0XHRcdHRoaXMucmF3RGF0YSA9IHRoaXMucmF3RGF0YS5zbGljZSh0aGlzLmNvbnRlbnRMZW5ndGgpO1xuXHRcdFx0XHRcdHRoaXMuY29udGVudExlbmd0aCA9IC0xO1xuXHRcdFx0XHRcdGlmIChtZXNzYWdlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuYWNjZXB0TWVzc2FnZSg8RGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2U+SlNPTi5wYXJzZShtZXNzYWdlKSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShuZXcgRXJyb3IoKGUubWVzc2FnZSB8fCBlKSArICdcXG4nICsgbWVzc2FnZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcdC8vIHRoZXJlIG1heSBiZSBtb3JlIGNvbXBsZXRlIG1lc3NhZ2VzIHRvIHByb2Nlc3Ncblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5yYXdEYXRhLmluZGV4T2YoU3RyZWFtRGVidWdBZGFwdGVyLlRXT19DUkxGKTtcblx0XHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0XHRjb25zdCBoZWFkZXIgPSB0aGlzLnJhd0RhdGEudG9TdHJpbmcoJ3V0ZjgnLCAwLCBpZHgpO1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVzID0gaGVhZGVyLnNwbGl0KFN0cmVhbURlYnVnQWRhcHRlci5IRUFERVJfTElORVNFUEFSQVRPUik7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBoIG9mIGxpbmVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBrdlBhaXIgPSBoLnNwbGl0KFN0cmVhbURlYnVnQWRhcHRlci5IRUFERVJfRklFTERTRVBBUkFUT1IpO1xuXHRcdFx0XHRcdFx0aWYgKGt2UGFpclswXSA9PT0gJ0NvbnRlbnQtTGVuZ3RoJykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNvbnRlbnRMZW5ndGggPSBOdW1iZXIoa3ZQYWlyWzFdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5yYXdEYXRhID0gdGhpcy5yYXdEYXRhLnNsaWNlKGlkeCArIFN0cmVhbURlYnVnQWRhcHRlci5UV09fQ1JMRi5sZW5ndGgpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE5ldHdvcmtEZWJ1Z0FkYXB0ZXIgZXh0ZW5kcyBTdHJlYW1EZWJ1Z0FkYXB0ZXIge1xuXG5cdHByb3RlY3RlZCBzb2NrZXQ/OiBuZXQuU29ja2V0O1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBjcmVhdGVDb25uZWN0aW9uKGNvbm5lY3Rpb25MaXN0ZW5lcjogKCkgPT4gdm9pZCk6IG5ldC5Tb2NrZXQ7XG5cblx0c3RhcnRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgY29ubmVjdGVkID0gZmFsc2U7XG5cblx0XHRcdHRoaXMuc29ja2V0ID0gdGhpcy5jcmVhdGVDb25uZWN0aW9uKCgpID0+IHtcblx0XHRcdFx0dGhpcy5jb25uZWN0KHRoaXMuc29ja2V0ISwgdGhpcy5zb2NrZXQhKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRjb25uZWN0ZWQgPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdFx0aWYgKGNvbm5lY3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShuZXcgRXJyb3IoJ2Nvbm5lY3Rpb24gY2xvc2VkJykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ2Nvbm5lY3Rpb24gY2xvc2VkJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5zb2NrZXQub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0XHQvLyBPbiBpcHY2IHBvc2l4IHRoaXMgY2FuIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yIHdoaWNoIGxhY2tzIGEgbWVzc2FnZS4gVXNlIHRoZSBmaXJzdC5cblx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IpIHtcblx0XHRcdFx0XHRlcnJvciA9IGVycm9yLmVycm9yc1swXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb25uZWN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkVycm9yLmZpcmUoZXJyb3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgc3RvcFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jYW5jZWxQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRpZiAodGhpcy5zb2NrZXQpIHtcblx0XHRcdHRoaXMuc29ja2V0LmVuZCgpO1xuXHRcdFx0dGhpcy5zb2NrZXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQW4gaW1wbGVtZW50YXRpb24gdGhhdCBjb25uZWN0cyB0byBhIGRlYnVnIGFkYXB0ZXIgdmlhIGEgc29ja2V0LlxuKi9cbmV4cG9ydCBjbGFzcyBTb2NrZXREZWJ1Z0FkYXB0ZXIgZXh0ZW5kcyBOZXR3b3JrRGVidWdBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGFkYXB0ZXJTZXJ2ZXI6IElEZWJ1Z0FkYXB0ZXJTZXJ2ZXIpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUNvbm5lY3Rpb24oY29ubmVjdGlvbkxpc3RlbmVyOiAoKSA9PiB2b2lkKTogbmV0LlNvY2tldCB7XG5cdFx0cmV0dXJuIG5ldC5jcmVhdGVDb25uZWN0aW9uKHRoaXMuYWRhcHRlclNlcnZlci5wb3J0LCB0aGlzLmFkYXB0ZXJTZXJ2ZXIuaG9zdCB8fCAnMTI3LjAuMC4xJywgY29ubmVjdGlvbkxpc3RlbmVyKTtcblx0fVxufVxuXG4vKipcbiAqIEFuIGltcGxlbWVudGF0aW9uIHRoYXQgY29ubmVjdHMgdG8gYSBkZWJ1ZyBhZGFwdGVyIHZpYSBhIE5hbWVkUGlwZSAob24gV2luZG93cykvVU5JWCBEb21haW4gU29ja2V0IChvbiBub24tV2luZG93cykuXG4gKi9cbmV4cG9ydCBjbGFzcyBOYW1lZFBpcGVEZWJ1Z0FkYXB0ZXIgZXh0ZW5kcyBOZXR3b3JrRGVidWdBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGFkYXB0ZXJTZXJ2ZXI6IElEZWJ1Z0FkYXB0ZXJOYW1lZFBpcGVTZXJ2ZXIpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUNvbm5lY3Rpb24oY29ubmVjdGlvbkxpc3RlbmVyOiAoKSA9PiB2b2lkKTogbmV0LlNvY2tldCB7XG5cdFx0cmV0dXJuIG5ldC5jcmVhdGVDb25uZWN0aW9uKHRoaXMuYWRhcHRlclNlcnZlci5wYXRoLCBjb25uZWN0aW9uTGlzdGVuZXIpO1xuXHR9XG59XG5cbi8qKlxuICogQW4gaW1wbGVtZW50YXRpb24gdGhhdCBsYXVuY2hlcyB0aGUgZGVidWcgYWRhcHRlciBhcyBhIHNlcGFyYXRlIHByb2Nlc3MgYW5kIGNvbW11bmljYXRlcyB2aWEgc3RkaW4vc3Rkb3V0LlxuKi9cbmV4cG9ydCBjbGFzcyBFeGVjdXRhYmxlRGVidWdBZGFwdGVyIGV4dGVuZHMgU3RyZWFtRGVidWdBZGFwdGVyIHtcblxuXHRwcml2YXRlIHNlcnZlclByb2Nlc3M6IGNwLkNoaWxkUHJvY2VzcyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGFkYXB0ZXJFeGVjdXRhYmxlOiBJRGVidWdBZGFwdGVyRXhlY3V0YWJsZSwgcHJpdmF0ZSBkZWJ1Z1R5cGU6IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBzdGFydFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5hZGFwdGVyRXhlY3V0YWJsZS5jb21tYW5kO1xuXHRcdGNvbnN0IGFyZ3MgPSB0aGlzLmFkYXB0ZXJFeGVjdXRhYmxlLmFyZ3M7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuYWRhcHRlckV4ZWN1dGFibGUub3B0aW9ucyB8fCB7fTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyB2ZXJpZnkgZXhlY3V0YWJsZXMgYXN5bmNocm9ub3VzbHlcblx0XHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRcdGlmIChwYXRoLmlzQWJzb2x1dGUoY29tbWFuZCkpIHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kRXhpc3RzID0gYXdhaXQgUHJvbWlzZXMuZXhpc3RzKGNvbW1hbmQpO1xuXHRcdFx0XHRcdGlmICghY29tbWFuZEV4aXN0cykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZGVidWdBZGFwdGVyQmluTm90Rm91bmQnLCBcIkRlYnVnIGFkYXB0ZXIgZXhlY3V0YWJsZSAnezB9JyBkb2VzIG5vdCBleGlzdC5cIiwgY29tbWFuZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyByZWxhdGl2ZSBwYXRoXG5cdFx0XHRcdFx0aWYgKGNvbW1hbmQuaW5kZXhPZignLycpIDwgMCAmJiBjb21tYW5kLmluZGV4T2YoJ1xcXFwnKSA8IDApIHtcblx0XHRcdFx0XHRcdC8vIG5vIHNlcGFyYXRvcnM6IGNvbW1hbmQgbG9va3MgbGlrZSBhIHJ1bnRpbWUgbmFtZSBsaWtlICdub2RlJyBvciAnbW9ubydcblx0XHRcdFx0XHRcdC8vIFRPRE86IGNoZWNrIHRoYXQgdGhlIHJ1bnRpbWUgaXMgYXZhaWxhYmxlIG9uIFBBVEhcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoeyBrZXk6ICdkZWJ1Z0FkYXB0ZXJDYW5ub3REZXRlcm1pbmVFeGVjdXRhYmxlJywgY29tbWVudDogWydBZGFwdGVyIGV4ZWN1dGFibGUgZmlsZSBub3QgZm91bmQnXSB9LFxuXHRcdFx0XHRcdFwiQ2Fubm90IGRldGVybWluZSBleGVjdXRhYmxlIGZvciBkZWJ1ZyBhZGFwdGVyICd7MH0nLlwiLCB0aGlzLmRlYnVnVHlwZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZW52ID0gcHJvY2Vzcy5lbnY7XG5cdFx0XHRpZiAob3B0aW9ucy5lbnYgJiYgT2JqZWN0LmtleXMob3B0aW9ucy5lbnYpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZW52ID0gb2JqZWN0cy5taXhpbihvYmplY3RzLmRlZXBDbG9uZShwcm9jZXNzLmVudiksIG9wdGlvbnMuZW52KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbW1hbmQgPT09ICdub2RlJykge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShhcmdzKSAmJiBhcmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBpc0VsZWN0cm9uID0gISFwcm9jZXNzLmVudlsnRUxFQ1RST05fUlVOX0FTX05PREUnXSB8fCAhIXByb2Nlc3MudmVyc2lvbnNbJ2VsZWN0cm9uJ107XG5cdFx0XHRcdFx0Y29uc3QgZm9ya09wdGlvbnM6IGNwLkZvcmtPcHRpb25zID0ge1xuXHRcdFx0XHRcdFx0ZW52OiBlbnYsXG5cdFx0XHRcdFx0XHRleGVjQXJndjogaXNFbGVjdHJvbiA/IFsnLWUnLCAnZGVsZXRlIHByb2Nlc3MuZW52LkVMRUNUUk9OX1JVTl9BU19OT0RFO3JlcXVpcmUocHJvY2Vzcy5hcmd2WzFdKSddIDogW10sXG5cdFx0XHRcdFx0XHRzaWxlbnQ6IHRydWVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLmN3ZCkge1xuXHRcdFx0XHRcdFx0Zm9ya09wdGlvbnMuY3dkID0gb3B0aW9ucy5jd2Q7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNoaWxkID0gY3AuZm9yayhhcmdzWzBdLCBhcmdzLnNsaWNlKDEpLCBmb3JrT3B0aW9ucyk7XG5cdFx0XHRcdFx0aWYgKCFjaGlsZC5waWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ3VuYWJsZVRvTGF1bmNoRGVidWdBZGFwdGVyJywgXCJVbmFibGUgdG8gbGF1bmNoIGRlYnVnIGFkYXB0ZXIgZnJvbSAnezB9Jy5cIiwgYXJnc1swXSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnNlcnZlclByb2Nlc3MgPSBjaGlsZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCd1bmFibGVUb0xhdW5jaERlYnVnQWRhcHRlck5vQXJncycsIFwiVW5hYmxlIHRvIGxhdW5jaCBkZWJ1ZyBhZGFwdGVyLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBzcGF3bkNvbW1hbmQgPSBjb21tYW5kO1xuXHRcdFx0XHRsZXQgc3Bhd25BcmdzID0gYXJncztcblx0XHRcdFx0Y29uc3Qgc3Bhd25PcHRpb25zOiBjcC5TcGF3bk9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0ZW52OiBlbnZcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKG9wdGlvbnMuY3dkKSB7XG5cdFx0XHRcdFx0c3Bhd25PcHRpb25zLmN3ZCA9IG9wdGlvbnMuY3dkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MgJiYgKGNvbW1hbmQuZW5kc1dpdGgoJy5iYXQnKSB8fCBjb21tYW5kLmVuZHNXaXRoKCcuY21kJykpKSB7XG5cdFx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyNDE4NFxuXHRcdFx0XHRcdHNwYXduT3B0aW9ucy5zaGVsbCA9IHRydWU7XG5cdFx0XHRcdFx0c3Bhd25Db21tYW5kID0gYFwiJHtjb21tYW5kfVwiYDtcblx0XHRcdFx0XHRzcGF3bkFyZ3MgPSBhcmdzLm1hcChhID0+IHtcblx0XHRcdFx0XHRcdGEgPSBhLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKTsgLy8gRXNjYXBlIGV4aXN0aW5nIGRvdWJsZSBxdW90ZXMgd2l0aCBcXFxuXHRcdFx0XHRcdFx0Ly8gV3JhcCBpbiBkb3VibGUgcXVvdGVzXG5cdFx0XHRcdFx0XHRyZXR1cm4gYFwiJHthfVwiYDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuc2VydmVyUHJvY2VzcyA9IGNwLnNwYXduKHNwYXduQ29tbWFuZCwgc3Bhd25BcmdzLCBzcGF3bk9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNlcnZlclByb2Nlc3Mub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fb25FcnJvci5maXJlKGVycik7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuc2VydmVyUHJvY2Vzcy5vbignZXhpdCcsIChjb2RlLCBzaWduYWwpID0+IHtcblx0XHRcdFx0dGhpcy5fb25FeGl0LmZpcmUoY29kZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5zZXJ2ZXJQcm9jZXNzLnN0ZG91dCEub24oJ2Nsb3NlJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkVycm9yLmZpcmUobmV3IEVycm9yKCdyZWFkIGVycm9yJykpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLnNlcnZlclByb2Nlc3Muc3Rkb3V0IS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShlcnJvcik7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5zZXJ2ZXJQcm9jZXNzLnN0ZGluIS5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShlcnJvcik7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5zZXJ2ZXJQcm9jZXNzLnN0ZGVyciEucmVzdW1lKCk7XG5cblx0XHRcdC8vIGZpbmFsbHkgY29ubmVjdCB0byB0aGUgREFcblx0XHRcdHRoaXMuY29ubmVjdCh0aGlzLnNlcnZlclByb2Nlc3Muc3Rkb3V0ISwgdGhpcy5zZXJ2ZXJQcm9jZXNzLnN0ZGluISk7XG5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShlcnIpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0b3BTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKCF0aGlzLnNlcnZlclByb2Nlc3MpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyB3aGVuIGtpbGxpbmcgYSBwcm9jZXNzIGluIHdpbmRvd3MgaXRzIGNoaWxkXG5cdFx0Ly8gcHJvY2Vzc2VzIGFyZSAqbm90KiBraWxsZWQgYnV0IGJlY29tZSByb290XG5cdFx0Ly8gcHJvY2Vzc2VzLiBUaGVyZWZvcmUgd2UgdXNlIFRBU0tLSUxMLkVYRVxuXHRcdGF3YWl0IHRoaXMuY2FuY2VsUGVuZGluZ1JlcXVlc3RzKCk7XG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0cmV0dXJuIGtpbGxUcmVlKHRoaXMuc2VydmVyUHJvY2VzcyEucGlkISwgdHJ1ZSkuY2F0Y2goKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlcnZlclByb2Nlc3M/LmtpbGwoKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNlcnZlclByb2Nlc3Mua2lsbCgnU0lHVEVSTScpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGV4dHJhY3QocGxhdGZvcm1Db250cmlidXRpb246IElQbGF0Zm9ybVNwZWNpZmljQWRhcHRlckNvbnRyaWJ1dGlvbiwgZXh0ZW5zaW9uRm9sZGVyUGF0aDogc3RyaW5nKTogSURlYnVnZ2VyQ29udHJpYnV0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXBsYXRmb3JtQ29udHJpYnV0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSURlYnVnZ2VyQ29udHJpYnV0aW9uID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRpZiAocGxhdGZvcm1Db250cmlidXRpb24ucnVudGltZSkge1xuXHRcdFx0aWYgKHBsYXRmb3JtQ29udHJpYnV0aW9uLnJ1bnRpbWUuaW5kZXhPZignLi8nKSA9PT0gMCkge1x0Ly8gVE9ET1xuXHRcdFx0XHRyZXN1bHQucnVudGltZSA9IHBhdGguam9pbihleHRlbnNpb25Gb2xkZXJQYXRoLCBwbGF0Zm9ybUNvbnRyaWJ1dGlvbi5ydW50aW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5ydW50aW1lID0gcGxhdGZvcm1Db250cmlidXRpb24ucnVudGltZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBsYXRmb3JtQ29udHJpYnV0aW9uLnJ1bnRpbWVBcmdzKSB7XG5cdFx0XHRyZXN1bHQucnVudGltZUFyZ3MgPSBwbGF0Zm9ybUNvbnRyaWJ1dGlvbi5ydW50aW1lQXJncztcblx0XHR9XG5cdFx0aWYgKHBsYXRmb3JtQ29udHJpYnV0aW9uLnByb2dyYW0pIHtcblx0XHRcdGlmICghcGF0aC5pc0Fic29sdXRlKHBsYXRmb3JtQ29udHJpYnV0aW9uLnByb2dyYW0pKSB7XG5cdFx0XHRcdHJlc3VsdC5wcm9ncmFtID0gcGF0aC5qb2luKGV4dGVuc2lvbkZvbGRlclBhdGgsIHBsYXRmb3JtQ29udHJpYnV0aW9uLnByb2dyYW0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnByb2dyYW0gPSBwbGF0Zm9ybUNvbnRyaWJ1dGlvbi5wcm9ncmFtO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocGxhdGZvcm1Db250cmlidXRpb24uYXJncykge1xuXHRcdFx0cmVzdWx0LmFyZ3MgPSBwbGF0Zm9ybUNvbnRyaWJ1dGlvbi5hcmdzO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHBsYXRmb3JtQ29udHJpYnV0aW9uIGFzIElEZWJ1Z2dlckNvbnRyaWJ1dGlvbjtcblxuXHRcdGlmIChjb250cmlidXRpb24ud2luKSB7XG5cdFx0XHRyZXN1bHQud2luID0gRXhlY3V0YWJsZURlYnVnQWRhcHRlci5leHRyYWN0KGNvbnRyaWJ1dGlvbi53aW4sIGV4dGVuc2lvbkZvbGRlclBhdGgpO1xuXHRcdH1cblx0XHRpZiAoY29udHJpYnV0aW9uLndpbng4Nikge1xuXHRcdFx0cmVzdWx0Lndpbng4NiA9IEV4ZWN1dGFibGVEZWJ1Z0FkYXB0ZXIuZXh0cmFjdChjb250cmlidXRpb24ud2lueDg2LCBleHRlbnNpb25Gb2xkZXJQYXRoKTtcblx0XHR9XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbi53aW5kb3dzKSB7XG5cdFx0XHRyZXN1bHQud2luZG93cyA9IEV4ZWN1dGFibGVEZWJ1Z0FkYXB0ZXIuZXh0cmFjdChjb250cmlidXRpb24ud2luZG93cywgZXh0ZW5zaW9uRm9sZGVyUGF0aCk7XG5cdFx0fVxuXHRcdGlmIChjb250cmlidXRpb24ub3N4KSB7XG5cdFx0XHRyZXN1bHQub3N4ID0gRXhlY3V0YWJsZURlYnVnQWRhcHRlci5leHRyYWN0KGNvbnRyaWJ1dGlvbi5vc3gsIGV4dGVuc2lvbkZvbGRlclBhdGgpO1xuXHRcdH1cblx0XHRpZiAoY29udHJpYnV0aW9uLmxpbnV4KSB7XG5cdFx0XHRyZXN1bHQubGludXggPSBFeGVjdXRhYmxlRGVidWdBZGFwdGVyLmV4dHJhY3QoY29udHJpYnV0aW9uLmxpbnV4LCBleHRlbnNpb25Gb2xkZXJQYXRoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHN0YXRpYyBwbGF0Zm9ybUFkYXB0ZXJFeGVjdXRhYmxlKGV4dGVuc2lvbkRlc2NyaXB0aW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIGRlYnVnVHlwZTogc3RyaW5nKTogSURlYnVnQWRhcHRlckV4ZWN1dGFibGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IElEZWJ1Z2dlckNvbnRyaWJ1dGlvbiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0ZGVidWdUeXBlID0gZGVidWdUeXBlLnRvTG93ZXJDYXNlKCk7XG5cblx0XHQvLyBtZXJnZSBhbGwgY29udHJpYnV0aW9ucyBpbnRvIG9uZVxuXHRcdGZvciAoY29uc3QgZWQgb2YgZXh0ZW5zaW9uRGVzY3JpcHRpb25zKSB7XG5cdFx0XHRpZiAoZWQuY29udHJpYnV0ZXMpIHtcblx0XHRcdFx0Y29uc3QgZGVidWdnZXJzID0gPElEZWJ1Z2dlckNvbnRyaWJ1dGlvbltdPmVkLmNvbnRyaWJ1dGVzWydkZWJ1Z2dlcnMnXTtcblx0XHRcdFx0aWYgKGRlYnVnZ2VycyAmJiBkZWJ1Z2dlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGRlYnVnZ2Vycy5maWx0ZXIoZGJnID0+IHR5cGVvZiBkYmcudHlwZSA9PT0gJ3N0cmluZycgJiYgc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKGRiZy50eXBlLCBkZWJ1Z1R5cGUpKS5mb3JFYWNoKGRiZyA9PiB7XG5cdFx0XHRcdFx0XHQvLyBleHRyYWN0IHJlbGV2YW50IGF0dHJpYnV0ZXMgYW5kIG1ha2UgdGhlbSBhYnNvbHV0ZSB3aGVyZSBuZWVkZWRcblx0XHRcdFx0XHRcdGNvbnN0IGV4dHJhY3RlZERiZyA9IEV4ZWN1dGFibGVEZWJ1Z0FkYXB0ZXIuZXh0cmFjdChkYmcsIGVkLmV4dGVuc2lvbkxvY2F0aW9uLmZzUGF0aCk7XG5cblx0XHRcdFx0XHRcdC8vIG1lcmdlXG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBvYmplY3RzLm1peGluKHJlc3VsdCwgZXh0cmFjdGVkRGJnLCBlZC5pc0J1aWx0aW4pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc2VsZWN0IHRoZSByaWdodCBwbGF0Zm9ybVxuXHRcdGxldCBwbGF0Zm9ybUluZm86IElQbGF0Zm9ybVNwZWNpZmljQWRhcHRlckNvbnRyaWJ1dGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzICYmICFwcm9jZXNzLmVudi5oYXNPd25Qcm9wZXJ0eSgnUFJPQ0VTU09SX0FSQ0hJVEVXNjQzMicpKSB7XG5cdFx0XHRwbGF0Zm9ybUluZm8gPSByZXN1bHQud2lueDg2IHx8IHJlc3VsdC53aW4gfHwgcmVzdWx0LndpbmRvd3M7XG5cdFx0fSBlbHNlIGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MpIHtcblx0XHRcdHBsYXRmb3JtSW5mbyA9IHJlc3VsdC53aW4gfHwgcmVzdWx0LndpbmRvd3M7XG5cdFx0fSBlbHNlIGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdFx0cGxhdGZvcm1JbmZvID0gcmVzdWx0Lm9zeDtcblx0XHR9IGVsc2UgaWYgKHBsYXRmb3JtLmlzTGludXgpIHtcblx0XHRcdHBsYXRmb3JtSW5mbyA9IHJlc3VsdC5saW51eDtcblx0XHR9XG5cdFx0cGxhdGZvcm1JbmZvID0gcGxhdGZvcm1JbmZvIHx8IHJlc3VsdDtcblxuXHRcdC8vIHRoZXNlIGFyZSB0aGUgcmVsZXZhbnQgYXR0cmlidXRlc1xuXHRcdGNvbnN0IHByb2dyYW0gPSBwbGF0Zm9ybUluZm8ucHJvZ3JhbSB8fCByZXN1bHQucHJvZ3JhbTtcblx0XHRjb25zdCBhcmdzID0gcGxhdGZvcm1JbmZvLmFyZ3MgfHwgcmVzdWx0LmFyZ3M7XG5cdFx0Y29uc3QgcnVudGltZSA9IHBsYXRmb3JtSW5mby5ydW50aW1lIHx8IHJlc3VsdC5ydW50aW1lO1xuXHRcdGNvbnN0IHJ1bnRpbWVBcmdzID0gcGxhdGZvcm1JbmZvLnJ1bnRpbWVBcmdzIHx8IHJlc3VsdC5ydW50aW1lQXJncztcblxuXHRcdGlmIChydW50aW1lKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAnZXhlY3V0YWJsZScsXG5cdFx0XHRcdGNvbW1hbmQ6IHJ1bnRpbWUsXG5cdFx0XHRcdGFyZ3M6IChydW50aW1lQXJncyB8fCBbXSkuY29uY2F0KHR5cGVvZiBwcm9ncmFtID09PSAnc3RyaW5nJyA/IFtwcm9ncmFtXSA6IFtdKS5jb25jYXQoYXJncyB8fCBbXSlcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChwcm9ncmFtKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAnZXhlY3V0YWJsZScsXG5cdFx0XHRcdGNvbW1hbmQ6IHByb2dyYW0sXG5cdFx0XHRcdGFyZ3M6IGFyZ3MgfHwgW11cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gbm90aGluZyBmb3VuZFxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixZQUFZLFNBQVM7QUFFckIsWUFBWSxhQUFhO0FBQ3pCLFlBQVksVUFBVTtBQUN0QixZQUFZLGNBQWM7QUFDMUIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUdyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUtsQixNQUFlLHNCQUFmLE1BQWUsNEJBQTJCLHFCQUFxQjtBQUFBLEVBVXJFLGNBQWM7QUFDYixVQUFNO0FBSlAsU0FBUSxVQUFVLE9BQU8sWUFBWSxDQUFDO0FBQ3RDLFNBQVEsZ0JBQWdCO0FBQUEsRUFJeEI7QUFBQSxFQUVVLFFBQVEsVUFBMkIsVUFBaUM7QUFFN0UsU0FBSyxlQUFlO0FBQ3BCLFNBQUssVUFBVSxPQUFPLFlBQVksQ0FBQztBQUNuQyxTQUFLLGdCQUFnQjtBQUVyQixhQUFTLEdBQUcsUUFBUSxDQUFDLFNBQWlCLEtBQUssV0FBVyxJQUFJLENBQUM7QUFB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
