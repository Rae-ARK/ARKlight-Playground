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
import { createRandomIPCHandle } from "../../../base/parts/ipc/node/ipc.net.js";
import * as fs from "fs";
import { IExtHostCommands } from "../common/extHostCommands.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { hasWorkspaceFileExtension } from "../../../platform/workspace/common/workspace.js";
class CLIServerBase {
  constructor(_commands, logService, _ipcHandlePath) {
    this._commands = _commands;
    this.logService = logService;
    this._ipcHandlePath = _ipcHandlePath;
    this._server = void 0;
    this._disposed = false;
    this.setup();
  }
  get ipcHandlePath() {
    return this._ipcHandlePath;
  }
  async setup() {
    try {
      const http = await import("http");
      if (this._disposed) {
        return;
      }
      this._server = http.createServer((req, res) => this.onRequest(req, res));
      try {
        this._server.listen(this.ipcHandlePath);
        this._server.on("error", (err) => this.logService.error(err));
      } catch (err) {
        this.logService.error("Could not start open from terminal server.");
      }
    } catch (error) {
      this.logService.error("Error setting up CLI server", error);
    }
  }
  onRequest(req, res) {
    const sendResponse = (statusCode, returnObj) => {
      res.writeHead(statusCode, { "content-type": "application/json" });
      res.end(JSON.stringify(returnObj || null), (err) => err && this.logService.error(err));
    };
    const chunks = [];
    req.setEncoding("utf8");
    req.on("data", (d) => chunks.push(d));
    req.on("end", async () => {
      try {
        const data = JSON.parse(chunks.join(""));
        let returnObj;
        switch (data.type) {
          case "open":
            returnObj = await this.open(data);
            break;
          case "openExternal":
            returnObj = await this.openExternal(data);
            break;
          case "status":
            returnObj = await this.getStatus(data);
            break;
          case "extensionManagement":
            returnObj = await this.manageExtensions(data);
            break;
          default:
            sendResponse(404, `Unknown message type: ${data.type}`);
            break;
        }
        sendResponse(200, returnObj);
      } catch (e) {
        const message = e instanceof Error ? e.message : JSON.stringify(e);
        sendResponse(500, message);
        this.logService.error("Error while processing pipe request", e);
      }
    });
  }
  async open(data) {
    const { fileURIs, folderURIs, forceNewWindow, diffMode, mergeMode, addMode, removeMode, forceReuseWindow, gotoLineMode, waitMarkerFilePath, remoteAuthority } = data;
    const urisToOpen = [];
    if (Array.isArray(folderURIs)) {
      for (const s of folderURIs) {
        try {
          urisToOpen.push({ folderUri: URI.parse(s) });
        } catch (e) {
        }
      }
    }
    if (Array.isArray(fileURIs)) {
      for (const s of fileURIs) {
        try {
          if (hasWorkspaceFileExtension(s)) {
            urisToOpen.push({ workspaceUri: URI.parse(s) });
          } else {
            urisToOpen.push({ fileUri: URI.parse(s) });
          }
        } catch (e) {
        }
      }
    }
    const waitMarkerFileURI = waitMarkerFilePath ? URI.file(waitMarkerFilePath) : void 0;
    const preferNewWindow = !forceReuseWindow && !waitMarkerFileURI && !addMode && !removeMode;
    const windowOpenArgs = { forceNewWindow, diffMode, mergeMode, addMode, removeMode, gotoLineMode, forceReuseWindow, preferNewWindow, waitMarkerFileURI, remoteAuthority };
    this._commands.executeCommand("_remoteCLI.windowOpen", urisToOpen, windowOpenArgs);
  }
  async openExternal(data) {
    for (const uriString of data.uris) {
      const uri = URI.parse(uriString);
      if (uri.scheme === "file") {
        continue;
      }
      await this._commands.executeCommand("_remoteCLI.openExternal", uriString);
    }
  }
  async manageExtensions(data) {
    const toExtOrVSIX = (inputs) => inputs?.map((input) => /\.vsix$/i.test(input) ? URI.parse(input) : input);
    const commandArgs = {
      list: data.list,
      install: toExtOrVSIX(data.install),
      uninstall: toExtOrVSIX(data.uninstall),
      force: data.force
    };
    return await this._commands.executeCommand("_remoteCLI.manageExtensions", commandArgs);
  }
  async getStatus(data) {
    return await this._commands.executeCommand("_remoteCLI.getSystemStatus");
  }
  dispose() {
    this._disposed = true;
    this._server?.close();
    if (this._ipcHandlePath && process.platform !== "win32" && fs.existsSync(this._ipcHandlePath)) {
      fs.unlinkSync(this._ipcHandlePath);
    }
  }
}
let CLIServer = class extends CLIServerBase {
  constructor(commands, logService) {
    super(commands, logService, createRandomIPCHandle());
  }
};
CLIServer = __decorateClass([
  __decorateParam(0, IExtHostCommands),
  __decorateParam(1, ILogService)
], CLIServer);
export {
  CLIServer,
  CLIServerBase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRIb3N0Q0xJU2VydmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlUmFuZG9tSVBDSGFuZGxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMubmV0LmpzJztcbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IElFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElXaW5kb3dPcGVuYWJsZSwgSU9wZW5XaW5kb3dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBPcGVuQ29tbWFuZFBpcGVBcmdzIHtcblx0dHlwZTogJ29wZW4nO1xuXHRmaWxlVVJJcz86IHN0cmluZ1tdO1xuXHRmb2xkZXJVUklzPzogc3RyaW5nW107XG5cdGZvcmNlTmV3V2luZG93PzogYm9vbGVhbjtcblx0ZGlmZk1vZGU/OiBib29sZWFuO1xuXHRtZXJnZU1vZGU/OiBib29sZWFuO1xuXHRhZGRNb2RlPzogYm9vbGVhbjtcblx0cmVtb3ZlTW9kZT86IGJvb2xlYW47XG5cdGdvdG9MaW5lTW9kZT86IGJvb2xlYW47XG5cdGZvcmNlUmV1c2VXaW5kb3c/OiBib29sZWFuO1xuXHR3YWl0TWFya2VyRmlsZVBhdGg/OiBzdHJpbmc7XG5cdHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3BlbkV4dGVybmFsQ29tbWFuZFBpcGVBcmdzIHtcblx0dHlwZTogJ29wZW5FeHRlcm5hbCc7XG5cdHVyaXM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXR1c1BpcGVBcmdzIHtcblx0dHlwZTogJ3N0YXR1cyc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXh0ZW5zaW9uTWFuYWdlbWVudFBpcGVBcmdzIHtcblx0dHlwZTogJ2V4dGVuc2lvbk1hbmFnZW1lbnQnO1xuXHRsaXN0PzogeyBzaG93VmVyc2lvbnM/OiBib29sZWFuOyBjYXRlZ29yeT86IHN0cmluZyB9O1xuXHRpbnN0YWxsPzogc3RyaW5nW107XG5cdHVuaW5zdGFsbD86IHN0cmluZ1tdO1xuXHRmb3JjZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIFBpcGVDb21tYW5kID0gT3BlbkNvbW1hbmRQaXBlQXJncyB8IFN0YXR1c1BpcGVBcmdzIHwgT3BlbkV4dGVybmFsQ29tbWFuZFBpcGVBcmdzIHwgRXh0ZW5zaW9uTWFuYWdlbWVudFBpcGVBcmdzO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kc0V4ZWN1dGVyIHtcblx0ZXhlY3V0ZUNvbW1hbmQ8VD4oaWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxUPjtcbn1cblxuZXhwb3J0IGNsYXNzIENMSVNlcnZlckJhc2Uge1xuXHRwcml2YXRlIF9zZXJ2ZXI6IGh0dHAuU2VydmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBJQ29tbWFuZHNFeGVjdXRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lwY0hhbmRsZVBhdGg6IHN0cmluZyxcblx0KSB7XG5cdFx0dGhpcy5zZXR1cCgpO1xuXHR9XG5cblx0cHVibGljIGdldCBpcGNIYW5kbGVQYXRoKCkge1xuXHRcdHJldHVybiB0aGlzLl9pcGNIYW5kbGVQYXRoO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZXR1cCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaHR0cCA9IGF3YWl0IGltcG9ydCgnaHR0cCcpO1xuXHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlcnZlciA9IGh0dHAuY3JlYXRlU2VydmVyKChyZXEsIHJlcykgPT4gdGhpcy5vblJlcXVlc3QocmVxLCByZXMpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3NlcnZlci5saXN0ZW4odGhpcy5pcGNIYW5kbGVQYXRoKTtcblx0XHRcdFx0dGhpcy5fc2VydmVyLm9uKCdlcnJvcicsIGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdDb3VsZCBub3Qgc3RhcnQgb3BlbiBmcm9tIHRlcm1pbmFsIHNlcnZlci4nKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciBzZXR0aW5nIHVwIENMSSBzZXJ2ZXInLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VuZFJlc3BvbnNlID0gKHN0YXR1c0NvZGU6IG51bWJlciwgcmV0dXJuT2JqOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdHJlcy53cml0ZUhlYWQoc3RhdHVzQ29kZSwgeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRcdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeShyZXR1cm5PYmogfHwgbnVsbCksIChlcnI/OiBhbnkpID0+IGVyciAmJiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKSk7IC8vIENvZGVRTCBbU00wMTUyNF0gT25seSB0aGUgbWVzc2FnZSBwb3J0aW9uIG9mIGVycm9ycyBhcmUgcGFzc2VkIGluLlxuXHRcdH07XG5cblx0XHRjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XG5cdFx0cmVxLnNldEVuY29kaW5nKCd1dGY4Jyk7XG5cdFx0cmVxLm9uKCdkYXRhJywgKGQ6IHN0cmluZykgPT4gY2h1bmtzLnB1c2goZCkpO1xuXHRcdHJlcS5vbignZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGF0YTogUGlwZUNvbW1hbmQgfCBhbnkgPSBKU09OLnBhcnNlKGNodW5rcy5qb2luKCcnKSk7XG5cdFx0XHRcdGxldCByZXR1cm5PYmo6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0c3dpdGNoIChkYXRhLnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdvcGVuJzpcblx0XHRcdFx0XHRcdHJldHVybk9iaiA9IGF3YWl0IHRoaXMub3BlbihkYXRhKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ29wZW5FeHRlcm5hbCc6XG5cdFx0XHRcdFx0XHRyZXR1cm5PYmogPSBhd2FpdCB0aGlzLm9wZW5FeHRlcm5hbChkYXRhKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3N0YXR1cyc6XG5cdFx0XHRcdFx0XHRyZXR1cm5PYmogPSBhd2FpdCB0aGlzLmdldFN0YXR1cyhkYXRhKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2V4dGVuc2lvbk1hbmFnZW1lbnQnOlxuXHRcdFx0XHRcdFx0cmV0dXJuT2JqID0gYXdhaXQgdGhpcy5tYW5hZ2VFeHRlbnNpb25zKGRhdGEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHNlbmRSZXNwb25zZSg0MDQsIGBVbmtub3duIG1lc3NhZ2UgdHlwZTogJHtkYXRhLnR5cGV9YCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRzZW5kUmVzcG9uc2UoMjAwLCByZXR1cm5PYmopO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogSlNPTi5zdHJpbmdpZnkoZSk7XG5cdFx0XHRcdHNlbmRSZXNwb25zZSg1MDAsIG1lc3NhZ2UpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHdoaWxlIHByb2Nlc3NpbmcgcGlwZSByZXF1ZXN0JywgZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW4oZGF0YTogT3BlbkNvbW1hbmRQaXBlQXJncyk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgeyBmaWxlVVJJcywgZm9sZGVyVVJJcywgZm9yY2VOZXdXaW5kb3csIGRpZmZNb2RlLCBtZXJnZU1vZGUsIGFkZE1vZGUsIHJlbW92ZU1vZGUsIGZvcmNlUmV1c2VXaW5kb3csIGdvdG9MaW5lTW9kZSwgd2FpdE1hcmtlckZpbGVQYXRoLCByZW1vdGVBdXRob3JpdHkgfSA9IGRhdGE7XG5cdFx0Y29uc3QgdXJpc1RvT3BlbjogSVdpbmRvd09wZW5hYmxlW10gPSBbXTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShmb2xkZXJVUklzKSkge1xuXHRcdFx0Zm9yIChjb25zdCBzIG9mIGZvbGRlclVSSXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR1cmlzVG9PcGVuLnB1c2goeyBmb2xkZXJVcmk6IFVSSS5wYXJzZShzKSB9KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChBcnJheS5pc0FycmF5KGZpbGVVUklzKSkge1xuXHRcdFx0Zm9yIChjb25zdCBzIG9mIGZpbGVVUklzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24ocykpIHtcblx0XHRcdFx0XHRcdHVyaXNUb09wZW4ucHVzaCh7IHdvcmtzcGFjZVVyaTogVVJJLnBhcnNlKHMpIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR1cmlzVG9PcGVuLnB1c2goeyBmaWxlVXJpOiBVUkkucGFyc2UocykgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgd2FpdE1hcmtlckZpbGVVUkkgPSB3YWl0TWFya2VyRmlsZVBhdGggPyBVUkkuZmlsZSh3YWl0TWFya2VyRmlsZVBhdGgpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByZWZlck5ld1dpbmRvdyA9ICFmb3JjZVJldXNlV2luZG93ICYmICF3YWl0TWFya2VyRmlsZVVSSSAmJiAhYWRkTW9kZSAmJiAhcmVtb3ZlTW9kZTtcblx0XHRjb25zdCB3aW5kb3dPcGVuQXJnczogSU9wZW5XaW5kb3dPcHRpb25zID0geyBmb3JjZU5ld1dpbmRvdywgZGlmZk1vZGUsIG1lcmdlTW9kZSwgYWRkTW9kZSwgcmVtb3ZlTW9kZSwgZ290b0xpbmVNb2RlLCBmb3JjZVJldXNlV2luZG93LCBwcmVmZXJOZXdXaW5kb3csIHdhaXRNYXJrZXJGaWxlVVJJLCByZW1vdGVBdXRob3JpdHkgfTtcblx0XHR0aGlzLl9jb21tYW5kcy5leGVjdXRlQ29tbWFuZCgnX3JlbW90ZUNMSS53aW5kb3dPcGVuJywgdXJpc1RvT3Blbiwgd2luZG93T3BlbkFyZ3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuRXh0ZXJuYWwoZGF0YTogT3BlbkV4dGVybmFsQ29tbWFuZFBpcGVBcmdzKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IHVyaVN0cmluZyBvZiBkYXRhLnVyaXMpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh1cmlTdHJpbmcpO1xuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09ICdmaWxlJykge1xuXHRcdFx0XHQvLyBza2lwIGZpbGU6Ly8gdXJpcywgdGhleSByZWZlciB0byB0aGUgZmlsZSBzeXN0ZW0gb2YgdGhlIHJlbW90ZSB0aGF0IGhhdmUgbm8gbWVhbmluZyBvbiB0aGUgbG9jYWwgbWFjaGluZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCdfcmVtb3RlQ0xJLm9wZW5FeHRlcm5hbCcsIHVyaVN0cmluZyk7IC8vIGFsd2F5cyBzZW5kIHRoZSBzdHJpbmcsIHdvcmthcm91bmQgZm9yICMxMTI1Nzdcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1hbmFnZUV4dGVuc2lvbnMoZGF0YTogRXh0ZW5zaW9uTWFuYWdlbWVudFBpcGVBcmdzKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0b0V4dE9yVlNJWCA9IChpbnB1dHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKSA9PiBpbnB1dHM/Lm1hcChpbnB1dCA9PiAvXFwudnNpeCQvaS50ZXN0KGlucHV0KSA/IFVSSS5wYXJzZShpbnB1dCkgOiBpbnB1dCk7XG5cdFx0Y29uc3QgY29tbWFuZEFyZ3MgPSB7XG5cdFx0XHRsaXN0OiBkYXRhLmxpc3QsXG5cdFx0XHRpbnN0YWxsOiB0b0V4dE9yVlNJWChkYXRhLmluc3RhbGwpLFxuXHRcdFx0dW5pbnN0YWxsOiB0b0V4dE9yVlNJWChkYXRhLnVuaW5zdGFsbCksXG5cdFx0XHRmb3JjZTogZGF0YS5mb3JjZVxuXHRcdH07XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2NvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHN0cmluZyB8IHVuZGVmaW5lZD4oJ19yZW1vdGVDTEkubWFuYWdlRXh0ZW5zaW9ucycsIGNvbW1hbmRBcmdzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U3RhdHVzKGRhdGE6IFN0YXR1c1BpcGVBcmdzKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8c3RyaW5nIHwgdW5kZWZpbmVkPignX3JlbW90ZUNMSS5nZXRTeXN0ZW1TdGF0dXMnKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3NlcnZlcj8uY2xvc2UoKTtcblxuXHRcdGlmICh0aGlzLl9pcGNIYW5kbGVQYXRoICYmIHByb2Nlc3MucGxhdGZvcm0gIT09ICd3aW4zMicgJiYgZnMuZXhpc3RzU3luYyh0aGlzLl9pcGNIYW5kbGVQYXRoKSkge1xuXHRcdFx0ZnMudW5saW5rU3luYyh0aGlzLl9pcGNIYW5kbGVQYXRoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENMSVNlcnZlciBleHRlbmRzIENMSVNlcnZlckJhc2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RDb21tYW5kcyBjb21tYW5kczogSUV4dEhvc3RDb21tYW5kcyxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoY29tbWFuZHMsIGxvZ1NlcnZpY2UsIGNyZWF0ZVJhbmRvbUlQQ0hhbmRsZSgpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDZCQUE2QjtBQUV0QyxZQUFZLFFBQVE7QUFDcEIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUNBQWlDO0FBd0NuQyxNQUFNLGNBQWM7QUFBQSxFQUkxQixZQUNrQixXQUNBLFlBQ0EsZ0JBQ2hCO0FBSGdCO0FBQ0E7QUFDQTtBQU5sQixTQUFRLFVBQW1DO0FBQzNDLFNBQVEsWUFBWTtBQU9uQixTQUFLLE1BQU07QUFBQSxFQUNaO0FBQUEsRUFFQSxJQUFXLGdCQUFnQjtBQUMxQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFjLFFBQXVCO0FBQ3BDLFFBQUk7QUFDSCxZQUFNLE9BQU8sTUFBTSxPQUFPLE1BQU07QUFDaEMsVUFBSSxLQUFLLFdBQVc7QUFDbkI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxVQUFVLEtBQUssYUFBYSxDQUFDLEtBQUssUUFBUSxLQUFLLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdkUsVUFBSTtBQUNILGFBQUssUUFBUSxPQUFPLEtBQUssYUFBYTtBQUN0QyxhQUFLLFFBQVEsR0FBRyxTQUFT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
