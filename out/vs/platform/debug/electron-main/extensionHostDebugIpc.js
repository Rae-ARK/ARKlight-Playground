import { VSBuffer } from "../../../base/common/buffer.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { upgradeToISocket } from "../../../base/parts/ipc/node/ipc.net.js";
import { OPTIONS, parseArgs } from "../../environment/node/argv.js";
import { OpenContext } from "../../windows/electron-main/windows.js";
import { ExtensionHostDebugBroadcastChannel } from "../common/extensionHostDebugIpc.js";
class ElectronExtensionHostDebugBroadcastChannel extends ExtensionHostDebugBroadcastChannel {
  constructor(windowsMainService) {
    super();
    this.windowsMainService = windowsMainService;
  }
  call(ctx, command, arg) {
    if (command === "openExtensionDevelopmentHostWindow") {
      return this.openExtensionDevelopmentHostWindow(arg[0], arg[1]);
    } else if (command === "attachToCurrentWindowRenderer") {
      return this.attachToCurrentWindowRenderer(arg[0]);
    } else {
      return super.call(ctx, command, arg);
    }
  }
  async attachToCurrentWindowRenderer(windowId) {
    const codeWindow = this.windowsMainService.getWindowById(windowId);
    if (!codeWindow?.win) {
      return { success: false };
    }
    return this.openCdp(codeWindow.win, true);
  }
  async openExtensionDevelopmentHostWindow(args, debugRenderer) {
    const pargs = parseArgs(args, OPTIONS);
    pargs.debugRenderer = debugRenderer;
    const extDevPaths = pargs.extensionDevelopmentPath;
    if (!extDevPaths) {
      return { success: false };
    }
    const [codeWindow] = await this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
      context: OpenContext.API,
      cli: pargs,
      forceProfile: pargs.profile,
      forceTempProfile: pargs["profile-temp"]
    });
    if (!debugRenderer) {
      return { success: true };
    }
    const win = codeWindow.win;
    if (!win) {
      return { success: true };
    }
    return this.openCdp(win, false);
  }
  async openCdpServer(ident, onSocket) {
    const { createServer } = await import("http");
    const server = createServer((req, res) => {
      if (req.url === "/json/list" || req.url === "/json") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify([{
          description: "VS Code Renderer",
          devtoolsFrontendUrl: "",
          id: ident,
          title: "VS Code Renderer",
          type: "page",
          url: "vscode://renderer",
          webSocketDebuggerUrl: wsUrl
        }]));
        return;
      } else if (req.url === "/json/version") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          "Browser": "VS Code Renderer",
          "Protocol-Version": "1.3",
          "webSocketDebuggerUrl": wsUrl
        }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const serverAddr = server.address();
    const port = typeof serverAddr === "object" && serverAddr ? serverAddr.port : 0;
    const serverAddrBase = typeof serverAddr === "string" ? serverAddr : `ws://127.0.0.1:${serverAddr?.port}`;
    const wsUrl = `${serverAddrBase}/${ident}`;
    server.on("upgrade", (req, socket) => {
      if (!req.url?.includes(ident)) {
        socket.end();
        return;
      }
      const upgraded = upgradeToISocket(req, socket, {
        debugLabel: "extension-host-cdp-" + generateUuid(),
        enableMessageSplitting: false
      });
      if (upgraded) {
        onSocket(upgraded);
      }
    });
    return { server, wsUrl, port };
  }
  async openCdp(win, debugRenderer) {
    const debug = win.webContents.debugger;
    let listeners = debug.isAttached() ? Infinity : 0;
    const ident = generateUuid();
    const pageSessionId = debugRenderer ? `page-${ident}` : void 0;
    const { server, wsUrl, port } = await this.openCdpServer(ident, (listener) => {
      if (listeners++ === 0) {
        debug.attach();
      }
      const store = new DisposableStore();
      store.add(listener);
      const writeMessage = (message) => {
        if (!store.isDisposed) {
          listener.write(VSBuffer.fromString(JSON.stringify(message)));
        }
      };
      const onMessage = (_event, method, params, sessionId) => writeMessage({ method, params, sessionId: sessionId || pageSessionId });
      const onWindowClose = () => {
        listener.end();
        store.dispose();
      };
      win.addListener("close", onWindowClose);
      store.add(toDisposable(() => win.removeListener("close", onWindowClose)));
      debug.addListener("message", onMessage);
      store.add(toDisposable(() => debug.removeListener("message", onMessage)));
      store.add(listener.onData((rawData) => {
        let data;
        try {
          data = JSON.parse(rawData.toString());
        } catch (e) {
          console.error("error reading cdp line", e);
          return;
        }
        if (debugRenderer) {
          const targetInfo = { targetId: ident, type: "page", title: "VS Code Renderer", url: "vscode://renderer" };
          if (data.method === "Target.setDiscoverTargets") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: {} });
            writeMessage({ method: "Target.targetCreated", sessionId: data.sessionId, params: { targetInfo: { ...targetInfo, attached: false, canAccessOpener: false } } });
            return;
          }
          if (data.method === "Target.attachToTarget") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: { sessionId: pageSessionId } });
            writeMessage({ method: "Target.attachedToTarget", params: { sessionId: pageSessionId, targetInfo: { ...targetInfo, attached: true, canAccessOpener: false }, waitingForDebugger: false } });
            return;
          }
          if (data.method === "Target.setAutoAttach" || data.method === "Target.attachToBrowserTarget") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: data.method === "Target.attachToBrowserTarget" ? { sessionId: "browser" } : {} });
            return;
          }
          if (data.method === "Target.getTargets") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: { targetInfos: [{ ...targetInfo, attached: true }] } });
            return;
          }
        }
        const forwardSessionId = data.sessionId === pageSessionId ? void 0 : data.sessionId;
        debug.sendCommand(data.method, data.params, forwardSessionId).then((result) => writeMessage({ id: data.id, sessionId: data.sessionId, result })).catch((error) => writeMessage({ id: data.id, sessionId: data.sessionId, error: { code: 0, message: error.message } }));
      }));
      store.add(listener.onClose(() => {
        if (--listeners === 0) {
          debug.detach();
        }
      }));
    });
    win.on("close", () => server.close());
    return { rendererDebugAddr: wsUrl, success: true, port };
  }
}
export {
  ElectronExtensionHostDebugBroadcastChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2RlYnVnL2VsZWN0cm9uLW1haW4vZXh0ZW5zaW9uSG9zdERlYnVnSXBjLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQnJvd3NlcldpbmRvdyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB0eXBlIHsgU2VydmVyIH0gZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyBTb2NrZXQgfSBmcm9tICduZXQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJU29ja2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgdXBncmFkZVRvSVNvY2tldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBPUFRJT05TLCBwYXJzZUFyZ3MgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9ub2RlL2FyZ3YuanMnO1xuaW1wb3J0IHsgSVdpbmRvd3NNYWluU2VydmljZSwgT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJT3BlbkV4dGVuc2lvbldpbmRvd1Jlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0RGVidWcuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdERlYnVnQnJvYWRjYXN0Q2hhbm5lbCB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0RGVidWdJcGMuanMnO1xuXG5leHBvcnQgY2xhc3MgRWxlY3Ryb25FeHRlbnNpb25Ib3N0RGVidWdCcm9hZGNhc3RDaGFubmVsPFRDb250ZXh0PiBleHRlbmRzIEV4dGVuc2lvbkhvc3REZWJ1Z0Jyb2FkY2FzdENoYW5uZWw8VENvbnRleHQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHdpbmRvd3NNYWluU2VydmljZTogSVdpbmRvd3NNYWluU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2FsbChjdHg6IFRDb250ZXh0LCBjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKGNvbW1hbmQgPT09ICdvcGVuRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0V2luZG93Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMub3BlbkV4dGVuc2lvbkRldmVsb3BtZW50SG9zdFdpbmRvdyhhcmdbMF0sIGFyZ1sxXSk7XG5cdFx0fSBlbHNlIGlmIChjb21tYW5kID09PSAnYXR0YWNoVG9DdXJyZW50V2luZG93UmVuZGVyZXInKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hdHRhY2hUb0N1cnJlbnRXaW5kb3dSZW5kZXJlcihhcmdbMF0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuY2FsbChjdHgsIGNvbW1hbmQsIGFyZyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhdHRhY2hUb0N1cnJlbnRXaW5kb3dSZW5kZXJlcih3aW5kb3dJZDogbnVtYmVyKTogUHJvbWlzZTxJT3BlbkV4dGVuc2lvbldpbmRvd1Jlc3VsdD4ge1xuXHRcdGNvbnN0IGNvZGVXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRpZiAoIWNvZGVXaW5kb3c/Lndpbikge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5vcGVuQ2RwKGNvZGVXaW5kb3cud2luLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkV4dGVuc2lvbkRldmVsb3BtZW50SG9zdFdpbmRvdyhhcmdzOiBzdHJpbmdbXSwgZGVidWdSZW5kZXJlcjogYm9vbGVhbik6IFByb21pc2U8SU9wZW5FeHRlbnNpb25XaW5kb3dSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJncyA9IHBhcnNlQXJncyhhcmdzLCBPUFRJT05TKTtcblx0XHRwYXJncy5kZWJ1Z1JlbmRlcmVyID0gZGVidWdSZW5kZXJlcjtcblxuXHRcdGNvbnN0IGV4dERldlBhdGhzID0gcGFyZ3MuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoO1xuXHRcdGlmICghZXh0RGV2UGF0aHMpIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2NvZGVXaW5kb3ddID0gYXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkV4dGVuc2lvbkRldmVsb3BtZW50SG9zdFdpbmRvdyhleHREZXZQYXRocywge1xuXHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuQVBJLFxuXHRcdFx0Y2xpOiBwYXJncyxcblx0XHRcdGZvcmNlUHJvZmlsZTogcGFyZ3MucHJvZmlsZSxcblx0XHRcdGZvcmNlVGVtcFByb2ZpbGU6IHBhcmdzWydwcm9maWxlLXRlbXAnXVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFkZWJ1Z1JlbmRlcmVyKSB7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2luID0gY29kZVdpbmRvdy53aW47XG5cdFx0aWYgKCF3aW4pIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5vcGVuQ2RwKHdpbiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQ2RwU2VydmVyKGlkZW50OiBzdHJpbmcsIG9uU29ja2V0OiAoc29ja2V0OiBJU29ja2V0KSA9PiB2b2lkKTogUHJvbWlzZTx7IHNlcnZlcjogU2VydmVyOyB3c1VybDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfT4ge1xuXHRcdGNvbnN0IHsgY3JlYXRlU2VydmVyIH0gPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTsgLy8gTGF6eSBkdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy81OTY4NlxuXHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHtcblx0XHRcdGlmIChyZXEudXJsID09PSAnL2pzb24vbGlzdCcgfHwgcmVxLnVybCA9PT0gJy9qc29uJykge1xuXHRcdFx0XHRyZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdFx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KFt7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdWUyBDb2RlIFJlbmRlcmVyJyxcblx0XHRcdFx0XHRkZXZ0b29sc0Zyb250ZW5kVXJsOiAnJyxcblx0XHRcdFx0XHRpZDogaWRlbnQsXG5cdFx0XHRcdFx0dGl0bGU6ICdWUyBDb2RlIFJlbmRlcmVyJyxcblx0XHRcdFx0XHR0eXBlOiAncGFnZScsXG5cdFx0XHRcdFx0dXJsOiAndnNjb2RlOi8vcmVuZGVyZXInLFxuXHRcdFx0XHRcdHdlYlNvY2tldERlYnVnZ2VyVXJsOiB3c1VybFxuXHRcdFx0XHR9XSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2UgaWYgKHJlcS51cmwgPT09ICcvanNvbi92ZXJzaW9uJykge1xuXHRcdFx0XHRyZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdFx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHQnQnJvd3Nlcic6ICdWUyBDb2RlIFJlbmRlcmVyJyxcblx0XHRcdFx0XHQnUHJvdG9jb2wtVmVyc2lvbic6ICcxLjMnLFxuXHRcdFx0XHRcdCd3ZWJTb2NrZXREZWJ1Z2dlclVybCc6IHdzVXJsXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXMuc3RhdHVzQ29kZSA9IDQwNDtcblx0XHRcdHJlcy5lbmQoKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gc2VydmVyLmxpc3RlbigwLCAnMTI3LjAuMC4xJywgcikpO1xuXHRcdGNvbnN0IHNlcnZlckFkZHIgPSBzZXJ2ZXIuYWRkcmVzcygpO1xuXHRcdGNvbnN0IHBvcnQgPSB0eXBlb2Ygc2VydmVyQWRkciA9PT0gJ29iamVjdCcgJiYgc2VydmVyQWRkciA/IHNlcnZlckFkZHIucG9ydCA6IDA7XG5cdFx0Y29uc3Qgc2VydmVyQWRkckJhc2UgPSB0eXBlb2Ygc2VydmVyQWRkciA9PT0gJ3N0cmluZycgPyBzZXJ2ZXJBZGRyIDogYHdzOi8vMTI3LjAuMC4xOiR7c2VydmVyQWRkcj8ucG9ydH1gO1xuXHRcdGNvbnN0IHdzVXJsID0gYCR7c2VydmVyQWRkckJhc2V9LyR7aWRlbnR9YDtcblxuXHRcdHNlcnZlci5vbigndXBncmFkZScsIChyZXEsIHNvY2tldCkgPT4ge1xuXHRcdFx0aWYgKCFyZXEudXJsPy5pbmNsdWRlcyhpZGVudCkpIHtcblx0XHRcdFx0c29ja2V0LmVuZCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGdyYWRlZCA9IHVwZ3JhZGVUb0lTb2NrZXQocmVxLCBzb2NrZXQgYXMgU29ja2V0LCB7XG5cdFx0XHRcdGRlYnVnTGFiZWw6ICdleHRlbnNpb24taG9zdC1jZHAtJyArIGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRlbmFibGVNZXNzYWdlU3BsaXR0aW5nOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodXBncmFkZWQpIHtcblx0XHRcdFx0b25Tb2NrZXQodXBncmFkZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgc2VydmVyLCB3c1VybCwgcG9ydCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQ2RwKHdpbjogQnJvd3NlcldpbmRvdywgZGVidWdSZW5kZXJlcjogYm9vbGVhbik6IFByb21pc2U8SU9wZW5FeHRlbnNpb25XaW5kb3dSZXN1bHQ+IHtcblx0XHRjb25zdCBkZWJ1ZyA9IHdpbi53ZWJDb250ZW50cy5kZWJ1Z2dlcjtcblxuXHRcdGxldCBsaXN0ZW5lcnMgPSBkZWJ1Zy5pc0F0dGFjaGVkKCkgPyBJbmZpbml0eSA6IDA7XG5cdFx0Y29uc3QgaWRlbnQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBwYWdlU2Vzc2lvbklkID0gZGVidWdSZW5kZXJlciA/IGBwYWdlLSR7aWRlbnR9YCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB7IHNlcnZlciwgd3NVcmwsIHBvcnQgfSA9IGF3YWl0IHRoaXMub3BlbkNkcFNlcnZlcihpZGVudCwgbGlzdGVuZXIgPT4ge1xuXHRcdFx0aWYgKGxpc3RlbmVycysrID09PSAwKSB7XG5cdFx0XHRcdGRlYnVnLmF0dGFjaCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHN0b3JlLmFkZChsaXN0ZW5lcik7XG5cblx0XHRcdGNvbnN0IHdyaXRlTWVzc2FnZSA9IChtZXNzYWdlOiBvYmplY3QpID0+IHtcblx0XHRcdFx0aWYgKCFzdG9yZS5pc0Rpc3Bvc2VkKSB7IC8vIGluIGNhc2Ugc2VuZENvbW1hbmQgcHJvbWlzZXMgc2V0dGxlIGFmdGVyIGNsb3NlZFxuXHRcdFx0XHRcdGxpc3RlbmVyLndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpKTsgLy8gbnVsbC1kZWxpbWl0ZWQsIENEUC1jb21wYXRpYmxlXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG9uTWVzc2FnZSA9IChfZXZlbnQ6IEVsZWN0cm9uLkV2ZW50LCBtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duLCBzZXNzaW9uSWQ/OiBzdHJpbmcpID0+XG5cdFx0XHRcdHdyaXRlTWVzc2FnZSh7IG1ldGhvZCwgcGFyYW1zLCBzZXNzaW9uSWQ6IHNlc3Npb25JZCB8fCBwYWdlU2Vzc2lvbklkIH0pO1xuXG5cdFx0XHRjb25zdCBvbldpbmRvd0Nsb3NlID0gKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5lbmQoKTtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fTtcblxuXHRcdFx0d2luLmFkZExpc3RlbmVyKCdjbG9zZScsIG9uV2luZG93Q2xvc2UpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB3aW4ucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25XaW5kb3dDbG9zZSkpKTtcblxuXHRcdFx0ZGVidWcuYWRkTGlzdGVuZXIoJ21lc3NhZ2UnLCBvbk1lc3NhZ2UpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBkZWJ1Zy5yZW1vdmVMaXN0ZW5lcignbWVzc2FnZScsIG9uTWVzc2FnZSkpKTtcblxuXHRcdFx0c3RvcmUuYWRkKGxpc3RlbmVyLm9uRGF0YShyYXdEYXRhID0+IHtcblx0XHRcdFx0bGV0IGRhdGE6IHsgaWQ6IG51bWJlcjsgc2Vzc2lvbklkPzogc3RyaW5nOyBtZXRob2Q6IHN0cmluZzsgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9O1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGRhdGEgPSBKU09OLnBhcnNlKHJhd0RhdGEudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdlcnJvciByZWFkaW5nIGNkcCBsaW5lJywgZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGRlYnVnUmVuZGVyZXIpIHtcblx0XHRcdFx0XHQvLyBFbXVsYXRlIFRhcmdldC4qIG1ldGhvZHMgdGhhdCBqcy1kZWJ1ZyBleHBlY3RzIGJ1dCBFbGVjdHJvbidzIGRlYnVnZ2VyIGRvZXNuJ3Qgc3VwcG9ydFxuXHRcdFx0XHRcdGNvbnN0IHRhcmdldEluZm8gPSB7IHRhcmdldElkOiBpZGVudCwgdHlwZTogJ3BhZ2UnLCB0aXRsZTogJ1ZTIENvZGUgUmVuZGVyZXInLCB1cmw6ICd2c2NvZGU6Ly9yZW5kZXJlcicgfTtcblx0XHRcdFx0XHRpZiAoZGF0YS5tZXRob2QgPT09ICdUYXJnZXQuc2V0RGlzY292ZXJUYXJnZXRzJykge1xuXHRcdFx0XHRcdFx0d3JpdGVNZXNzYWdlKHsgaWQ6IGRhdGEuaWQsIHNlc3Npb25JZDogZGF0YS5zZXNzaW9uSWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRcdFx0XHR3cml0ZU1lc3NhZ2UoeyBtZXRob2Q6ICdUYXJnZXQudGFyZ2V0Q3JlYXRlZCcsIHNlc3Npb25JZDogZGF0YS5zZXNzaW9uSWQsIHBhcmFtczogeyB0YXJnZXRJbmZvOiB7IC4uLnRhcmdldEluZm8sIGF0dGFjaGVkOiBmYWxzZSwgY2FuQWNjZXNzT3BlbmVyOiBmYWxzZSB9IH0gfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkYXRhLm1ldGhvZCA9PT0gJ1RhcmdldC5hdHRhY2hUb1RhcmdldCcpIHtcblx0XHRcdFx0XHRcdHdyaXRlTWVzc2FnZSh7IGlkOiBkYXRhLmlkLCBzZXNzaW9uSWQ6IGRhdGEuc2Vzc2lvbklkLCByZXN1bHQ6IHsgc2Vzc2lvbklkOiBwYWdlU2Vzc2lvbklkIH0gfSk7XG5cdFx0XHRcdFx0XHR3cml0ZU1lc3NhZ2UoeyBtZXRob2Q6ICdUYXJnZXQuYXR0YWNoZWRUb1RhcmdldCcsIHBhcmFtczogeyBzZXNzaW9uSWQ6IHBhZ2VTZXNzaW9uSWQsIHRhcmdldEluZm86IHsgLi4udGFyZ2V0SW5mbywgYXR0YWNoZWQ6IHRydWUsIGNhbkFjY2Vzc09wZW5lcjogZmFsc2UgfSwgd2FpdGluZ0ZvckRlYnVnZ2VyOiBmYWxzZSB9IH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGF0YS5tZXRob2QgPT09ICdUYXJnZXQuc2V0QXV0b0F0dGFjaCcgfHwgZGF0YS5tZXRob2QgPT09ICdUYXJnZXQuYXR0YWNoVG9Ccm93c2VyVGFyZ2V0Jykge1xuXHRcdFx0XHRcdFx0d3JpdGVNZXNzYWdlKHsgaWQ6IGRhdGEuaWQsIHNlc3Npb25JZDogZGF0YS5zZXNzaW9uSWQsIHJlc3VsdDogZGF0YS5tZXRob2QgPT09ICdUYXJnZXQuYXR0YWNoVG9Ccm93c2VyVGFyZ2V0JyA/IHsgc2Vzc2lvbklkOiAnYnJvd3NlcicgfSA6IHt9IH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGF0YS5tZXRob2QgPT09ICdUYXJnZXQuZ2V0VGFyZ2V0cycpIHtcblx0XHRcdFx0XHRcdHdyaXRlTWVzc2FnZSh7IGlkOiBkYXRhLmlkLCBzZXNzaW9uSWQ6IGRhdGEuc2Vzc2lvbklkLCByZXN1bHQ6IHsgdGFyZ2V0SW5mb3M6IFt7IC4uLnRhcmdldEluZm8sIGF0dGFjaGVkOiB0cnVlIH1dIH0gfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRm9yd2FyZCB0byBFbGVjdHJvbidzIGRlYnVnZ2VyLCBzdHJpcHBpbmcgb3VyIHN5bnRoZXRpYyBwYWdlIHNlc3Npb25JZFxuXHRcdFx0XHRjb25zdCBmb3J3YXJkU2Vzc2lvbklkID0gZGF0YS5zZXNzaW9uSWQgPT09IHBhZ2VTZXNzaW9uSWQgPyB1bmRlZmluZWQgOiBkYXRhLnNlc3Npb25JZDtcblxuXHRcdFx0XHRkZWJ1Zy5zZW5kQ29tbWFuZChkYXRhLm1ldGhvZCwgZGF0YS5wYXJhbXMsIGZvcndhcmRTZXNzaW9uSWQpXG5cdFx0XHRcdFx0LnRoZW4oKHJlc3VsdDogb2JqZWN0KSA9PiB3cml0ZU1lc3NhZ2UoeyBpZDogZGF0YS5pZCwgc2Vzc2lvbklkOiBkYXRhLnNlc3Npb25JZCwgcmVzdWx0IH0pKVxuXHRcdFx0XHRcdC5jYXRjaCgoZXJyb3I6IEVycm9yKSA9PiB3cml0ZU1lc3NhZ2UoeyBpZDogZGF0YS5pZCwgc2Vzc2lvbklkOiBkYXRhLnNlc3Npb25JZCwgZXJyb3I6IHsgY29kZTogMCwgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9IH0pKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGxpc3RlbmVyLm9uQ2xvc2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAoLS1saXN0ZW5lcnMgPT09IDApIHtcblx0XHRcdFx0XHRkZWJ1Zy5kZXRhY2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0d2luLm9uKCdjbG9zZScsICgpID0+IHNlcnZlci5jbG9zZSgpKTtcblxuXHRcdHJldHVybiB7IHJlbmRlcmVyRGVidWdBZGRyOiB3c1VybCwgc3VjY2VzczogdHJ1ZSwgcG9ydDogcG9ydCB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFRQSxTQUFT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
