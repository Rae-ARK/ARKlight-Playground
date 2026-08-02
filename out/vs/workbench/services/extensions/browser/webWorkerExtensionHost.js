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
import * as dom from "../../../../base/browser/dom.js";
import { parentOriginHash } from "../../../../base/browser/iframe.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Barrier } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { canceled, onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { COI, FileAccess } from "../../../../base/common/network.js";
import * as platform from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getNLSLanguage, getNLSMessages } from "../../../../nls.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { ILogService, ILoggerService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchAssignmentService } from "../../assignment/common/assignmentService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isLoggingOnly } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { WebWorkerDescriptor } from "../../../../platform/webWorker/browser/webWorkerDescriptor.js";
import { IWebWorkerService } from "../../../../platform/webWorker/browser/webWorkerService.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IDefaultLogLevelsService } from "../../log/common/defaultLogLevels.js";
import { ExtensionHostExitCode, MessageType, UIKind, createMessageOfType, isMessageOfType } from "../common/extensionHostProtocol.js";
import { ExtensionHostStartup, resolveEnabledApiProposalsFallbackExperiment } from "../common/extensions.js";
let WebWorkerExtensionHost = class extends Disposable {
  constructor(runningLocation, startup, _initDataProvider, _telemetryService, _contextService, _labelService, _logService, _loggerService, _environmentService, _userDataProfilesService, _productService, _layoutService, _storageService, _webWorkerService, _defaultLogLevelsService, _workbenchAssignmentService) {
    super();
    this.runningLocation = runningLocation;
    this.startup = startup;
    this._initDataProvider = _initDataProvider;
    this._telemetryService = _telemetryService;
    this._contextService = _contextService;
    this._labelService = _labelService;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._environmentService = _environmentService;
    this._userDataProfilesService = _userDataProfilesService;
    this._productService = _productService;
    this._layoutService = _layoutService;
    this._storageService = _storageService;
    this._webWorkerService = _webWorkerService;
    this._defaultLogLevelsService = _defaultLogLevelsService;
    this._workbenchAssignmentService = _workbenchAssignmentService;
    this.pid = null;
    this.remoteAuthority = null;
    this.extensions = null;
    this._onDidExit = this._register(new Emitter());
    this.onExit = this._onDidExit.event;
    this._isTerminating = false;
    this._protocolPromise = null;
    this._protocol = null;
    this._extensionHostLogsLocation = joinPath(this._environmentService.extHostLogsPath, "webWorker");
  }
  async _getWebWorkerExtensionHostIframeSrc() {
    const suffixSearchParams = new URLSearchParams();
    if (this._environmentService.debugExtensionHost && this._environmentService.debugRenderer) {
      suffixSearchParams.set("debugged", "1");
    }
    COI.addSearchParam(suffixSearchParams, true, true);
    const suffix = `?${suffixSearchParams.toString()}`;
    const iframeModulePath = `vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html`;
    if (platform.isWeb) {
      const webEndpointUrlTemplate = this._productService.webEndpointUrlTemplate;
      const commit = this._productService.commit;
      const quality = this._productService.quality;
      if (webEndpointUrlTemplate && commit && quality) {
        const key = "webWorkerExtensionHostIframeStableOriginUUID";
        let stableOriginUUID = this._storageService.get(key, StorageScope.WORKSPACE);
        if (typeof stableOriginUUID === "undefined") {
          stableOriginUUID = generateUuid();
          this._storageService.store(key, stableOriginUUID, StorageScope.WORKSPACE, StorageTarget.MACHINE);
        }
        const hash = await parentOriginHash(mainWindow.origin, stableOriginUUID);
        const baseUrl = webEndpointUrlTemplate.replace("{{uuid}}", `v--${hash}`).replace("{{commit}}", commit).replace("{{quality}}", quality);
        const res = new URL(`${baseUrl}/out/${iframeModulePath}${suffix}`);
        res.searchParams.set("parentOrigin", mainWindow.origin);
        res.searchParams.set("salt", stableOriginUUID);
        return res.toString();
      }
      console.warn(`The web worker extension host is started in a same-origin iframe!`);
    }
    const relativeExtensionHostIframeSrc = this._webWorkerService.getWorkerUrl(new WebWorkerDescriptor({
      esmModuleLocation: FileAccess.asBrowserUri(iframeModulePath),
      esmModuleLocationBundler: new URL(`../worker/webWorkerExtensionHostIframe.html`, import.meta.url),
      label: "webWorkerExtensionHostIframe"
    }));
    return `${relativeExtensionHostIframeSrc}${suffix}`;
  }
  async start() {
    if (!this._protocolPromise) {
      this._protocolPromise = this._startInsideIframe();
      this._protocolPromise.then((protocol) => this._protocol = protocol);
    }
    return this._protocolPromise;
  }
  async _startInsideIframe() {
    const webWorkerExtensionHostIframeSrc = await this._getWebWorkerExtensionHostIframeSrc();
    const emitter = this._register(new Emitter());
    const iframe = document.createElement("iframe");
    iframe.setAttribute("class", "web-worker-ext-host-iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.setAttribute("allow", "usb; serial; hid; cross-origin-isolated; local-network-access;");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";
    const vscodeWebWorkerExtHostId = generateUuid();
    iframe.setAttribute("src", `${webWorkerExtensionHostIframeSrc}&vscodeWebWorkerExtHostId=${vscodeWebWorkerExtHostId}`);
    const barrier = new Barrier();
    let port;
    let barrierError = null;
    let barrierHasError = false;
    let startTimeout = void 0;
    const rejectBarrier = (exitCode, error) => {
      barrierError = error;
      barrierHasError = true;
      onUnexpectedError(barrierError);
      clearTimeout(startTimeout);
      this._onDidExit.fire([ExtensionHostExitCode.UnexpectedError, barrierError.message]);
      barrier.open();
    };
    const resolveBarrier = (messagePort) => {
      port = messagePort;
      clearTimeout(startTimeout);
      barrier.open();
    };
    startTimeout = setTimeout(() => {
      console.warn(`The Web Worker Extension Host did not start in 60s, that might be a problem.`);
    }, 6e4);
    this._register(dom.addDisposableListener(mainWindow, "message", (event) => {
      if (event.source !== iframe.contentWindow) {
        return;
      }
      if (event.data.vscodeWebWorkerExtHostId !== vscodeWebWorkerExtHostId) {
        return;
      }
      if (event.data.error) {
        const { name, message, stack } = event.data.error;
        const err = new Error();
        err.message = message;
        err.name = name;
        err.stack = stack;
        return rejectBarrier(ExtensionHostExitCode.UnexpectedError, err);
      }
      if (event.data.type === "vscode.bootstrap.nls") {
        iframe.contentWindow.postMessage({
          type: event.data.type,
          data: {
            workerUrl: this._webWorkerService.getWorkerUrl(extensionHostWorkerMainDescriptor),
            fileRoot: globalThis._VSCODE_FILE_ROOT,
            nls: {
              messages: getNLSMessages(),
              language: getNLSLanguage()
            }
          }
        }, "*");
        return;
      }
      const { data } = event.data;
      if (barrier.isOpen() || !(data instanceof MessagePort)) {
        console.warn("UNEXPECTED message", event);
        const err = new Error("UNEXPECTED message");
        return rejectBarrier(ExtensionHostExitCode.UnexpectedError, err);
      }
      resolveBarrier(data);
    }));
    this._layoutService.mainContainer.appendChild(iframe);
    this._register(toDisposable(() => iframe.remove()));
    await barrier.wait();
    if (barrierHasError) {
      throw barrierError;
    }
    const messagePorts = this._environmentService.options?.messagePorts ?? /* @__PURE__ */ new Map();
    iframe.contentWindow.postMessage({ type: "vscode.init", data: messagePorts }, "*", [...messagePorts.values()]);
    port.onmessage = (event) => {
      const { data } = event;
      if (!(data instanceof ArrayBuffer)) {
        console.warn("UNKNOWN data received", data);
        this._onDidExit.fire([77, "UNKNOWN data received"]);
        return;
      }
      emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
    };
    const protocol = {
      onMessage: emitter.event,
      send: (vsbuf) => {
        const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
        port.postMessage(data, [data]);
      }
    };
    return this._performHandshake(protocol);
  }
  async _performHandshake(protocol) {
    await Event.toPromise(Event.filter(protocol.onMessage, (msg) => isMessageOfType(msg, MessageType.Ready)));
    if (this._isTerminating) {
      throw canceled();
    }
    protocol.send(VSBuffer.fromString(JSON.stringify(await this._createExtHostInitData())));
    if (this._isTerminating) {
      throw canceled();
    }
    await Event.toPromise(Event.filter(protocol.onMessage, (msg) => isMessageOfType(msg, MessageType.Initialized)));
    if (this._isTerminating) {
      throw canceled();
    }
    return protocol;
  }
  dispose() {
    if (this._isTerminating) {
      return;
    }
    this._isTerminating = true;
    this._protocol?.send(createMessageOfType(MessageType.Terminate));
    super.dispose();
  }
  getInspectPort() {
    return void 0;
  }
  enableInspectPort() {
    return Promise.resolve(false);
  }
  async _createExtHostInitData() {
    const initData = await this._initDataProvider.getInitData();
    this.extensions = initData.extensions;
    const workspace = this._contextService.getWorkspace();
    const nlsBaseUrl = this._productService.extensionsGallery?.nlsBaseUrl;
    let nlsUrlWithDetails = void 0;
    if (nlsBaseUrl && this._productService.commit && !platform.Language.isDefaultVariant()) {
      nlsUrlWithDetails = URI.joinPath(URI.parse(nlsBaseUrl), this._productService.commit, this._productService.version, platform.Language.value());
    }
    const enabledApiProposalsFallback = await resolveEnabledApiProposalsFallbackExperiment(this._workbenchAssignmentService, this._productService.quality);
    return {
      commit: this._productService.commit,
      version: this._productService.version,
      quality: this._productService.quality,
      date: this._productService.date,
      parentPid: 0,
      enabledApiProposalsFallback,
      environment: {
        isExtensionDevelopmentDebug: this._environmentService.debugRenderer,
        appName: this._productService.nameLong,
        appHost: this._productService.embedderIdentifier ?? (platform.isWeb ? "web" : "desktop"),
        appUriScheme: this._productService.urlProtocol,
        appLanguage: platform.language,
        isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
        isPortable: false,
        extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
        extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
        globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
        workspaceStorageHome: this._environmentService.workspaceStorageHome,
        extensionLogLevel: this._defaultLogLevelsService.defaultLogLevels.extensions,
        isSessionsWindow: this._environmentService.isSessionsWindow
      },
      workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? void 0 : {
        configuration: workspace.configuration || void 0,
        id: workspace.id,
        name: this._labelService.getWorkspaceLabel(workspace),
        transient: workspace.transient
      },
      consoleForward: {
        includeStack: false,
        logNative: this._environmentService.debugRenderer
      },
      extensions: this.extensions.toSnapshot(),
      nlsBaseUrl: nlsUrlWithDetails,
      telemetryInfo: {
        sessionId: this._telemetryService.sessionId,
        machineId: this._telemetryService.machineId,
        sqmId: this._telemetryService.sqmId,
        devDeviceId: this._telemetryService.devDeviceId ?? this._telemetryService.machineId,
        firstSessionDate: this._telemetryService.firstSessionDate,
        msftInternal: this._telemetryService.msftInternal
      },
      remoteExtensionTips: this._productService.remoteExtensionTips,
      virtualWorkspaceExtensionTips: this._productService.virtualWorkspaceExtensionTips,
      logLevel: this._logService.getLevel(),
      loggers: [...this._loggerService.getRegisteredLoggers()],
      logsLocation: this._extensionHostLogsLocation,
      autoStart: this.startup === ExtensionHostStartup.EagerAutoStart || this.startup === ExtensionHostStartup.LazyAutoStart,
      remote: {
        authority: this._environmentService.remoteAuthority,
        connectionData: null,
        isRemote: false
      },
      uiKind: platform.isWeb ? UIKind.Web : UIKind.Desktop
    };
  }
};
WebWorkerExtensionHost = __decorateClass([
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILogService),
  __decorateParam(7, ILoggerService),
  __decorateParam(8, IBrowserWorkbenchEnvironmentService),
  __decorateParam(9, IUserDataProfilesService),
  __decorateParam(10, IProductService),
  __decorateParam(11, ILayoutService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IWebWorkerService),
  __decorateParam(14, IDefaultLogLevelsService),
  __decorateParam(15, IWorkbenchAssignmentService)
], WebWorkerExtensionHost);
const extensionHostWorkerMainDescriptor = new WebWorkerDescriptor({
  label: "extensionHostWorkerMain",
  esmModuleLocation: () => FileAccess.asBrowserUri("vs/workbench/api/worker/extensionHostWorkerMain.js"),
  esmModuleLocationBundler: () => new URL("../../../api/worker/extensionHostWorkerMain.ts?esm", import.meta.url)
});
export {
  WebWorkerExtensionHost
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2Jyb3dzZXIvd2ViV29ya2VyRXh0ZW5zaW9uSG9zdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHBhcmVudE9yaWdpbkhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaWZyYW1lLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBjYW5jZWxlZCwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQXBwUmVzb3VyY2VQYXRoLCBDT0ksIEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBnZXROTFNMYW5ndWFnZSwgZ2V0TkxTTWVzc2FnZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgaXNMb2dnaW5nT25seSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgV2ViV29ya2VyRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlckRlc2NyaXB0b3IuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJXb3JrZXIvYnJvd3Nlci93ZWJXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWZhdWx0TG9nTGV2ZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vZGVmYXVsdExvZ0xldmVscy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0RXhpdENvZGUsIElFeHRlbnNpb25Ib3N0SW5pdERhdGEsIE1lc3NhZ2VUeXBlLCBVSUtpbmQsIGNyZWF0ZU1lc3NhZ2VPZlR5cGUsIGlzTWVzc2FnZU9mVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0U3RhcnR1cCwgSUV4dGVuc2lvbkhvc3QsIHJlc29sdmVFbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2tFeHBlcmltZW50IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0SW5pdERhdGEge1xuXHRyZWFkb25seSBleHRlbnNpb25zOiBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2ViV29ya2VyRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciB7XG5cdGdldEluaXREYXRhKCk6IFByb21pc2U8SVdlYldvcmtlckV4dGVuc2lvbkhvc3RJbml0RGF0YT47XG59XG5cbmV4cG9ydCBjbGFzcyBXZWJXb3JrZXJFeHRlbnNpb25Ib3N0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25Ib3N0IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgcGlkID0gbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eSA9IG51bGw7XG5cdHB1YmxpYyBleHRlbnNpb25zOiBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucyB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRXhpdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFtudW1iZXIsIHN0cmluZyB8IG51bGxdPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRXhpdDogRXZlbnQ8W251bWJlciwgc3RyaW5nIHwgbnVsbF0+ID0gdGhpcy5fb25EaWRFeGl0LmV2ZW50O1xuXG5cdHByaXZhdGUgX2lzVGVybWluYXRpbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX3Byb3RvY29sUHJvbWlzZTogUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4gfCBudWxsO1xuXHRwcml2YXRlIF9wcm90b2NvbDogSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgfCBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkhvc3RMb2dzTG9jYXRpb246IFVSSTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcnVubmluZ0xvY2F0aW9uOiBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnR1cDogRXh0ZW5zaW9uSG9zdFN0YXJ0dXAsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5pdERhdGFQcm92aWRlcjogSVdlYldvcmtlckV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXZWJXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdExvZ0xldmVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdExvZ0xldmVsc1NlcnZpY2U6IElEZWZhdWx0TG9nTGV2ZWxzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faXNUZXJtaW5hdGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3Byb3RvY29sUHJvbWlzZSA9IG51bGw7XG5cdFx0dGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RMb2dzTG9jYXRpb24gPSBqb2luUGF0aCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0SG9zdExvZ3NQYXRoLCAnd2ViV29ya2VyJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRXZWJXb3JrZXJFeHRlbnNpb25Ib3N0SWZyYW1lU3JjKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc3VmZml4U2VhcmNoUGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0ICYmIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z1JlbmRlcmVyKSB7XG5cdFx0XHRzdWZmaXhTZWFyY2hQYXJhbXMuc2V0KCdkZWJ1Z2dlZCcsICcxJyk7XG5cdFx0fVxuXHRcdENPSS5hZGRTZWFyY2hQYXJhbShzdWZmaXhTZWFyY2hQYXJhbXMsIHRydWUsIHRydWUpO1xuXG5cdFx0Y29uc3Qgc3VmZml4ID0gYD8ke3N1ZmZpeFNlYXJjaFBhcmFtcy50b1N0cmluZygpfWA7XG5cblx0XHRjb25zdCBpZnJhbWVNb2R1bGVQYXRoOiBBcHBSZXNvdXJjZVBhdGggPSBgdnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvd29ya2VyL3dlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWUuaHRtbGA7XG5cdFx0aWYgKHBsYXRmb3JtLmlzV2ViKSB7XG5cdFx0XHRjb25zdCB3ZWJFbmRwb2ludFVybFRlbXBsYXRlID0gdGhpcy5fcHJvZHVjdFNlcnZpY2Uud2ViRW5kcG9pbnRVcmxUZW1wbGF0ZTtcblx0XHRcdGNvbnN0IGNvbW1pdCA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdDtcblx0XHRcdGNvbnN0IHF1YWxpdHkgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5xdWFsaXR5O1xuXHRcdFx0aWYgKHdlYkVuZHBvaW50VXJsVGVtcGxhdGUgJiYgY29tbWl0ICYmIHF1YWxpdHkpIHtcblx0XHRcdFx0Ly8gVHJ5IHRvIGtlZXAgdGhlIHdlYiB3b3JrZXIgZXh0ZW5zaW9uIGhvc3QgaWZyYW1lIG9yaWdpbiBzdGFibGUgYnkgc3RvcmluZyBpdCBpbiB3b3Jrc3BhY2Ugc3RvcmFnZVxuXHRcdFx0XHRjb25zdCBrZXkgPSAnd2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZVN0YWJsZU9yaWdpblVVSUQnO1xuXHRcdFx0XHRsZXQgc3RhYmxlT3JpZ2luVVVJRCA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHN0YWJsZU9yaWdpblVVSUQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0c3RhYmxlT3JpZ2luVVVJRCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKGtleSwgc3RhYmxlT3JpZ2luVVVJRCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBoYXNoID0gYXdhaXQgcGFyZW50T3JpZ2luSGFzaChtYWluV2luZG93Lm9yaWdpbiwgc3RhYmxlT3JpZ2luVVVJRCk7XG5cdFx0XHRcdGNvbnN0IGJhc2VVcmwgPSAoXG5cdFx0XHRcdFx0d2ViRW5kcG9pbnRVcmxUZW1wbGF0ZVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoJ3t7dXVpZH19JywgYHYtLSR7aGFzaH1gKSAvLyB1c2luZyBgdi0tYCBhcyBhIG1hcmtlciB0byByZXF1aXJlIGBwYXJlbnRPcmlnaW5gL2BzYWx0YCB2ZXJpZmljYXRpb25cblx0XHRcdFx0XHRcdC5yZXBsYWNlKCd7e2NvbW1pdH19JywgY29tbWl0KVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoJ3t7cXVhbGl0eX19JywgcXVhbGl0eSlcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRjb25zdCByZXMgPSBuZXcgVVJMKGAke2Jhc2VVcmx9L291dC8ke2lmcmFtZU1vZHVsZVBhdGh9JHtzdWZmaXh9YCk7XG5cdFx0XHRcdHJlcy5zZWFyY2hQYXJhbXMuc2V0KCdwYXJlbnRPcmlnaW4nLCBtYWluV2luZG93Lm9yaWdpbik7XG5cdFx0XHRcdHJlcy5zZWFyY2hQYXJhbXMuc2V0KCdzYWx0Jywgc3RhYmxlT3JpZ2luVVVJRCk7XG5cdFx0XHRcdHJldHVybiByZXMudG9TdHJpbmcoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc29sZS53YXJuKGBUaGUgd2ViIHdvcmtlciBleHRlbnNpb24gaG9zdCBpcyBzdGFydGVkIGluIGEgc2FtZS1vcmlnaW4gaWZyYW1lIWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbGF0aXZlRXh0ZW5zaW9uSG9zdElmcmFtZVNyYyA9IHRoaXMuX3dlYldvcmtlclNlcnZpY2UuZ2V0V29ya2VyVXJsKG5ldyBXZWJXb3JrZXJEZXNjcmlwdG9yKHtcblx0XHRcdGVzbU1vZHVsZUxvY2F0aW9uOiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShpZnJhbWVNb2R1bGVQYXRoKSxcblx0XHRcdGVzbU1vZHVsZUxvY2F0aW9uQnVuZGxlcjogbmV3IFVSTChgLi4vd29ya2VyL3dlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWUuaHRtbGAsIGltcG9ydC5tZXRhLnVybCksXG5cdFx0XHRsYWJlbDogJ3dlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWUnXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGAke3JlbGF0aXZlRXh0ZW5zaW9uSG9zdElmcmFtZVNyY30ke3N1ZmZpeH1gO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+IHtcblx0XHRpZiAoIXRoaXMuX3Byb3RvY29sUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fcHJvdG9jb2xQcm9taXNlID0gdGhpcy5fc3RhcnRJbnNpZGVJZnJhbWUoKTtcblx0XHRcdHRoaXMuX3Byb3RvY29sUHJvbWlzZS50aGVuKHByb3RvY29sID0+IHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2wpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJvdG9jb2xQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnRJbnNpZGVJZnJhbWUoKTogUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4ge1xuXHRcdGNvbnN0IHdlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWVTcmMgPSBhd2FpdCB0aGlzLl9nZXRXZWJXb3JrZXJFeHRlbnNpb25Ib3N0SWZyYW1lU3JjKCk7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFZTQnVmZmVyPigpKTtcblxuXHRcdGNvbnN0IGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXHRcdGlmcmFtZS5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ3dlYi13b3JrZXItZXh0LWhvc3QtaWZyYW1lJyk7XG5cdFx0aWZyYW1lLnNldEF0dHJpYnV0ZSgnc2FuZGJveCcsICdhbGxvdy1zY3JpcHRzIGFsbG93LXNhbWUtb3JpZ2luJyk7XG5cdFx0aWZyYW1lLnNldEF0dHJpYnV0ZSgnYWxsb3cnLCAndXNiOyBzZXJpYWw7IGhpZDsgY3Jvc3Mtb3JpZ2luLWlzb2xhdGVkOyBsb2NhbC1uZXR3b3JrLWFjY2VzczsnKTtcblx0XHRpZnJhbWUuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0aWZyYW1lLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRjb25zdCB2c2NvZGVXZWJXb3JrZXJFeHRIb3N0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRpZnJhbWUuc2V0QXR0cmlidXRlKCdzcmMnLCBgJHt3ZWJXb3JrZXJFeHRlbnNpb25Ib3N0SWZyYW1lU3JjfSZ2c2NvZGVXZWJXb3JrZXJFeHRIb3N0SWQ9JHt2c2NvZGVXZWJXb3JrZXJFeHRIb3N0SWR9YCk7XG5cblx0XHRjb25zdCBiYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblx0XHRsZXQgcG9ydCE6IE1lc3NhZ2VQb3J0O1xuXHRcdGxldCBiYXJyaWVyRXJyb3I6IEVycm9yIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGJhcnJpZXJIYXNFcnJvciA9IGZhbHNlO1xuXHRcdGxldCBzdGFydFRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCByZWplY3RCYXJyaWVyID0gKGV4aXRDb2RlOiBudW1iZXIsIGVycm9yOiBFcnJvcikgPT4ge1xuXHRcdFx0YmFycmllckVycm9yID0gZXJyb3I7XG5cdFx0XHRiYXJyaWVySGFzRXJyb3IgPSB0cnVlO1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoYmFycmllckVycm9yKTtcblx0XHRcdGNsZWFyVGltZW91dChzdGFydFRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fb25EaWRFeGl0LmZpcmUoW0V4dGVuc2lvbkhvc3RFeGl0Q29kZS5VbmV4cGVjdGVkRXJyb3IsIGJhcnJpZXJFcnJvci5tZXNzYWdlXSk7XG5cdFx0XHRiYXJyaWVyLm9wZW4oKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzb2x2ZUJhcnJpZXIgPSAobWVzc2FnZVBvcnQ6IE1lc3NhZ2VQb3J0KSA9PiB7XG5cdFx0XHRwb3J0ID0gbWVzc2FnZVBvcnQ7XG5cdFx0XHRjbGVhclRpbWVvdXQoc3RhcnRUaW1lb3V0KTtcblx0XHRcdGJhcnJpZXIub3BlbigpO1xuXHRcdH07XG5cblx0XHRzdGFydFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNvbnNvbGUud2FybihgVGhlIFdlYiBXb3JrZXIgRXh0ZW5zaW9uIEhvc3QgZGlkIG5vdCBzdGFydCBpbiA2MHMsIHRoYXQgbWlnaHQgYmUgYSBwcm9ibGVtLmApO1xuXHRcdH0sIDYwMDAwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWFpbldpbmRvdywgJ21lc3NhZ2UnLCAoZXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC5zb3VyY2UgIT09IGlmcmFtZS5jb250ZW50V2luZG93KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5kYXRhLnZzY29kZVdlYldvcmtlckV4dEhvc3RJZCAhPT0gdnNjb2RlV2ViV29ya2VyRXh0SG9zdElkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5kYXRhLmVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IHsgbmFtZSwgbWVzc2FnZSwgc3RhY2sgfSA9IGV2ZW50LmRhdGEuZXJyb3I7XG5cdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcigpO1xuXHRcdFx0XHRlcnIubWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0XHRcdGVyci5uYW1lID0gbmFtZTtcblx0XHRcdFx0ZXJyLnN0YWNrID0gc3RhY2s7XG5cdFx0XHRcdHJldHVybiByZWplY3RCYXJyaWVyKEV4dGVuc2lvbkhvc3RFeGl0Q29kZS5VbmV4cGVjdGVkRXJyb3IsIGVycik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQuZGF0YS50eXBlID09PSAndnNjb2RlLmJvb3RzdHJhcC5ubHMnKSB7XG5cdFx0XHRcdGlmcmFtZS5jb250ZW50V2luZG93IS5wb3N0TWVzc2FnZSh7XG5cdFx0XHRcdFx0dHlwZTogZXZlbnQuZGF0YS50eXBlLFxuXHRcdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRcdHdvcmtlclVybDogdGhpcy5fd2ViV29ya2VyU2VydmljZS5nZXRXb3JrZXJVcmwoZXh0ZW5zaW9uSG9zdFdvcmtlck1haW5EZXNjcmlwdG9yKSxcblx0XHRcdFx0XHRcdGZpbGVSb290OiBnbG9iYWxUaGlzLl9WU0NPREVfRklMRV9ST09ULFxuXHRcdFx0XHRcdFx0bmxzOiB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2VzOiBnZXROTFNNZXNzYWdlcygpLFxuXHRcdFx0XHRcdFx0XHRsYW5ndWFnZTogZ2V0TkxTTGFuZ3VhZ2UoKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgJyonKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBkYXRhIH0gPSBldmVudC5kYXRhO1xuXHRcdFx0aWYgKGJhcnJpZXIuaXNPcGVuKCkgfHwgIShkYXRhIGluc3RhbmNlb2YgTWVzc2FnZVBvcnQpKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignVU5FWFBFQ1RFRCBtZXNzYWdlJywgZXZlbnQpO1xuXHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ1VORVhQRUNURUQgbWVzc2FnZScpO1xuXHRcdFx0XHRyZXR1cm4gcmVqZWN0QmFycmllcihFeHRlbnNpb25Ib3N0RXhpdENvZGUuVW5leHBlY3RlZEVycm9yLCBlcnIpO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZUJhcnJpZXIoZGF0YSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKGlmcmFtZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGlmcmFtZS5yZW1vdmUoKSkpO1xuXG5cdFx0Ly8gYXdhaXQgTWVzc2FnZVBvcnQgYW5kIHVzZSBpdCB0byBkaXJlY3RseSBjb21tdW5pY2F0ZVxuXHRcdC8vIHdpdGggdGhlIHdvcmtlciBleHRlbnNpb24gaG9zdFxuXHRcdGF3YWl0IGJhcnJpZXIud2FpdCgpO1xuXG5cdFx0aWYgKGJhcnJpZXJIYXNFcnJvcikge1xuXHRcdFx0dGhyb3cgYmFycmllckVycm9yO1xuXHRcdH1cblxuXHRcdC8vIFNlbmQgb3ZlciBtZXNzYWdlIHBvcnRzIGZvciBleHRlbnNpb24gQVBJXG5cdFx0Y29uc3QgbWVzc2FnZVBvcnRzID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/Lm1lc3NhZ2VQb3J0cyA/PyBuZXcgTWFwKCk7XG5cdFx0aWZyYW1lLmNvbnRlbnRXaW5kb3chLnBvc3RNZXNzYWdlKHsgdHlwZTogJ3ZzY29kZS5pbml0JywgZGF0YTogbWVzc2FnZVBvcnRzIH0sICcqJywgWy4uLm1lc3NhZ2VQb3J0cy52YWx1ZXMoKV0pO1xuXG5cdFx0cG9ydC5vbm1lc3NhZ2UgPSAoZXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHsgZGF0YSB9ID0gZXZlbnQ7XG5cdFx0XHRpZiAoIShkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignVU5LTk9XTiBkYXRhIHJlY2VpdmVkJywgZGF0YSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkRXhpdC5maXJlKFs3NywgJ1VOS05PV04gZGF0YSByZWNlaXZlZCddKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZW1pdHRlci5maXJlKFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoZGF0YSwgMCwgZGF0YS5ieXRlTGVuZ3RoKSkpO1xuXHRcdH07XG5cblx0XHRjb25zdCBwcm90b2NvbDogSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgPSB7XG5cdFx0XHRvbk1lc3NhZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRzZW5kOiB2c2J1ZiA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB2c2J1Zi5idWZmZXIuYnVmZmVyLnNsaWNlKHZzYnVmLmJ1ZmZlci5ieXRlT2Zmc2V0LCB2c2J1Zi5idWZmZXIuYnl0ZU9mZnNldCArIHZzYnVmLmJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0XHRcdFx0cG9ydC5wb3N0TWVzc2FnZShkYXRhLCBbZGF0YV0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGhpcy5fcGVyZm9ybUhhbmRzaGFrZShwcm90b2NvbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wZXJmb3JtSGFuZHNoYWtlKHByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCk6IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+IHtcblx0XHQvLyBleHRlbnNpb24gaG9zdCBoYW5kc2hha2UgaGFwcGVucyBiZWxvd1xuXHRcdC8vICgxKSA8PT0gd2FpdCBmb3I6IFJlYWR5XG5cdFx0Ly8gKDIpID09PiBzZW5kOiBpbml0IGRhdGFcblx0XHQvLyAoMykgPD09IHdhaXQgZm9yOiBJbml0aWFsaXplZFxuXG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihwcm90b2NvbC5vbk1lc3NhZ2UsIG1zZyA9PiBpc01lc3NhZ2VPZlR5cGUobXNnLCBNZXNzYWdlVHlwZS5SZWFkeSkpKTtcblx0XHRpZiAodGhpcy5faXNUZXJtaW5hdGluZykge1xuXHRcdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0XHR9XG5cdFx0cHJvdG9jb2wuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGF3YWl0IHRoaXMuX2NyZWF0ZUV4dEhvc3RJbml0RGF0YSgpKSkpO1xuXHRcdGlmICh0aGlzLl9pc1Rlcm1pbmF0aW5nKSB7XG5cdFx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHRcdH1cblx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHByb3RvY29sLm9uTWVzc2FnZSwgbXNnID0+IGlzTWVzc2FnZU9mVHlwZShtc2csIE1lc3NhZ2VUeXBlLkluaXRpYWxpemVkKSkpO1xuXHRcdGlmICh0aGlzLl9pc1Rlcm1pbmF0aW5nKSB7XG5cdFx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm90b2NvbDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1Rlcm1pbmF0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzVGVybWluYXRpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX3Byb3RvY29sPy5zZW5kKGNyZWF0ZU1lc3NhZ2VPZlR5cGUoTWVzc2FnZVR5cGUuVGVybWluYXRlKSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0SW5zcGVjdFBvcnQoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZW5hYmxlSW5zcGVjdFBvcnQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVFeHRIb3N0SW5pdERhdGEoKTogUHJvbWlzZTxJRXh0ZW5zaW9uSG9zdEluaXREYXRhPiB7XG5cdFx0Y29uc3QgaW5pdERhdGEgPSBhd2FpdCB0aGlzLl9pbml0RGF0YVByb3ZpZGVyLmdldEluaXREYXRhKCk7XG5cdFx0dGhpcy5leHRlbnNpb25zID0gaW5pdERhdGEuZXh0ZW5zaW9ucztcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBubHNCYXNlVXJsID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnk/Lm5sc0Jhc2VVcmw7XG5cdFx0bGV0IG5sc1VybFdpdGhEZXRhaWxzOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Ly8gT25seSB1c2UgdGhlIG5sc0Jhc2VVcmwgaWYgd2UgYXJlIHVzaW5nIGEgbGFuZ3VhZ2Ugb3RoZXIgdGhhbiB0aGUgZGVmYXVsdCwgRW5nbGlzaC5cblx0XHRpZiAobmxzQmFzZVVybCAmJiB0aGlzLl9wcm9kdWN0U2VydmljZS5jb21taXQgJiYgIXBsYXRmb3JtLkxhbmd1YWdlLmlzRGVmYXVsdFZhcmlhbnQoKSkge1xuXHRcdFx0bmxzVXJsV2l0aERldGFpbHMgPSBVUkkuam9pblBhdGgoVVJJLnBhcnNlKG5sc0Jhc2VVcmwpLCB0aGlzLl9wcm9kdWN0U2VydmljZS5jb21taXQsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHBsYXRmb3JtLkxhbmd1YWdlLnZhbHVlKCkpO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2sgPSBhd2FpdCByZXNvbHZlRW5hYmxlZEFwaVByb3Bvc2Fsc0ZhbGxiYWNrRXhwZXJpbWVudCh0aGlzLl93b3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbW1pdDogdGhpcy5fcHJvZHVjdFNlcnZpY2UuY29tbWl0LFxuXHRcdFx0dmVyc2lvbjogdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdHF1YWxpdHk6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHksXG5cdFx0XHRkYXRlOiB0aGlzLl9wcm9kdWN0U2VydmljZS5kYXRlLFxuXHRcdFx0cGFyZW50UGlkOiAwLFxuXHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2Fsc0ZhbGxiYWNrLFxuXHRcdFx0ZW52aXJvbm1lbnQ6IHtcblx0XHRcdFx0aXNFeHRlbnNpb25EZXZlbG9wbWVudERlYnVnOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdSZW5kZXJlcixcblx0XHRcdFx0YXBwTmFtZTogdGhpcy5fcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsXG5cdFx0XHRcdGFwcEhvc3Q6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmVtYmVkZGVySWRlbnRpZmllciA/PyAocGxhdGZvcm0uaXNXZWIgPyAnd2ViJyA6ICdkZXNrdG9wJyksXG5cdFx0XHRcdGFwcFVyaVNjaGVtZTogdGhpcy5fcHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wsXG5cdFx0XHRcdGFwcExhbmd1YWdlOiBwbGF0Zm9ybS5sYW5ndWFnZSxcblx0XHRcdFx0aXNFeHRlbnNpb25UZWxlbWV0cnlMb2dnaW5nT25seTogaXNMb2dnaW5nT25seSh0aGlzLl9wcm9kdWN0U2VydmljZSwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlKSxcblx0XHRcdFx0aXNQb3J0YWJsZTogZmFsc2UsXG5cdFx0XHRcdGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkk6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJLFxuXHRcdFx0XHRleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSxcblx0XHRcdFx0Z2xvYmFsU3RvcmFnZUhvbWU6IHRoaXMuX3VzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmdsb2JhbFN0b3JhZ2VIb21lLFxuXHRcdFx0XHR3b3Jrc3BhY2VTdG9yYWdlSG9tZTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLFxuXHRcdFx0XHRleHRlbnNpb25Mb2dMZXZlbDogdGhpcy5fZGVmYXVsdExvZ0xldmVsc1NlcnZpY2UuZGVmYXVsdExvZ0xldmVscy5leHRlbnNpb25zLFxuXHRcdFx0XHRpc1Nlc3Npb25zV2luZG93OiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvd1xuXHRcdFx0fSxcblx0XHRcdHdvcmtzcGFjZTogdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0aWQ6IHdvcmtzcGFjZS5pZCxcblx0XHRcdFx0bmFtZTogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZSksXG5cdFx0XHRcdHRyYW5zaWVudDogd29ya3NwYWNlLnRyYW5zaWVudFxuXHRcdFx0fSxcblx0XHRcdGNvbnNvbGVGb3J3YXJkOiB7XG5cdFx0XHRcdGluY2x1ZGVTdGFjazogZmFsc2UsXG5cdFx0XHRcdGxvZ05hdGl2ZTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnUmVuZGVyZXJcblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25zOiB0aGlzLmV4dGVuc2lvbnMudG9TbmFwc2hvdCgpLFxuXHRcdFx0bmxzQmFzZVVybDogbmxzVXJsV2l0aERldGFpbHMsXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiB7XG5cdFx0XHRcdHNlc3Npb25JZDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5zZXNzaW9uSWQsXG5cdFx0XHRcdG1hY2hpbmVJZDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5tYWNoaW5lSWQsXG5cdFx0XHRcdHNxbUlkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnNxbUlkLFxuXHRcdFx0XHRkZXZEZXZpY2VJZDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5kZXZEZXZpY2VJZCA/PyB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLm1hY2hpbmVJZCxcblx0XHRcdFx0Zmlyc3RTZXNzaW9uRGF0ZTogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5maXJzdFNlc3Npb25EYXRlLFxuXHRcdFx0XHRtc2Z0SW50ZXJuYWw6IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UubXNmdEludGVybmFsXG5cdFx0XHR9LFxuXHRcdFx0cmVtb3RlRXh0ZW5zaW9uVGlwczogdGhpcy5fcHJvZHVjdFNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uVGlwcyxcblx0XHRcdHZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzOiB0aGlzLl9wcm9kdWN0U2VydmljZS52aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwcyxcblx0XHRcdGxvZ0xldmVsOiB0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCksXG5cdFx0XHRsb2dnZXJzOiBbLi4udGhpcy5fbG9nZ2VyU2VydmljZS5nZXRSZWdpc3RlcmVkTG9nZ2VycygpXSxcblx0XHRcdGxvZ3NMb2NhdGlvbjogdGhpcy5fZXh0ZW5zaW9uSG9zdExvZ3NMb2NhdGlvbixcblx0XHRcdGF1dG9TdGFydDogKHRoaXMuc3RhcnR1cCA9PT0gRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJBdXRvU3RhcnQgfHwgdGhpcy5zdGFydHVwID09PSBFeHRlbnNpb25Ib3N0U3RhcnR1cC5MYXp5QXV0b1N0YXJ0KSxcblx0XHRcdHJlbW90ZToge1xuXHRcdFx0XHRhdXRob3JpdHk6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdGNvbm5lY3Rpb25EYXRhOiBudWxsLFxuXHRcdFx0XHRpc1JlbW90ZTogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHR1aUtpbmQ6IHBsYXRmb3JtLmlzV2ViID8gVUlLaW5kLldlYiA6IFVJS2luZC5EZXNrdG9wXG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCBleHRlbnNpb25Ib3N0V29ya2VyTWFpbkRlc2NyaXB0b3IgPSBuZXcgV2ViV29ya2VyRGVzY3JpcHRvcih7XG5cdGxhYmVsOiAnZXh0ZW5zaW9uSG9zdFdvcmtlck1haW4nLFxuXHRlc21Nb2R1bGVMb2NhdGlvbjogKCkgPT4gRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoJ3ZzL3dvcmtiZW5jaC9hcGkvd29ya2VyL2V4dGVuc2lvbkhvc3RXb3JrZXJNYWluLmpzJyksXG5cdGVzbU1vZHVsZUxvY2F0aW9uQnVuZGxlcjogKCkgPT4gbmV3IFVSTCgnLi4vLi4vLi4vYXBpL3dvcmtlci9leHRlbnNpb25Ib3N0V29ya2VyTWFpbi50cz9lc20nLCBpbXBvcnQubWV0YS51cmwpLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLHlCQUF5QjtBQUM1QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQTBCLEtBQUssa0JBQWtCO0FBQ2pELFlBQVksY0FBYztBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxnQkFBZ0Isc0JBQXNCO0FBQy9DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUJBQStDLGFBQWEsUUFBUSxxQkFBcUIsdUJBQXVCO0FBRXpILFNBQWtDLHNCQUFzQyxvREFBb0Q7QUFVckgsSUFBTSx5QkFBTixjQUFxQyxXQUFxQztBQUFBLEVBZWhGLFlBQ2lCLGlCQUNBLFNBQ0MsbUJBQ21CLG1CQUNPLGlCQUNYLGVBQ0YsYUFDRyxnQkFDcUIscUJBQ1gsMEJBQ1QsaUJBQ0QsZ0JBQ0MsaUJBQ0UsbUJBQ08sMEJBQ0csNkJBQzdDO0FBQ0QsVUFBTTtBQWpCVTtBQUNBO0FBQ0M7QUFDbUI7QUFDTztBQUNYO0FBQ0Y7QUFDRztBQUNxQjtBQUNYO0FBQ1Q7QUFDRDtBQUNDO0FBQ0U7QUFDTztBQUNHO0FBN0IvQyxTQUFnQixNQUFNO0FBQ3RCLFNBQWdCLGtCQUFrQjtBQUNsQyxTQUFPLGFBQTZDO0FBRXBELFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksUUFBaUMsQ0FBQztBQUNuRixTQUFnQixTQUF5QyxLQUFLLFdBQVc7QUEyQnhFLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssWUFBWTtBQUNqQixTQUFLLDZCQUE2QixTQUFTLEtBQUssb0JBQW9CLGlCQUFpQixXQUFXO0FBQUEsRUFDakc7QUFBQSxFQUVBLE1BQWMsc0NBQXVEO0FBQ3BFLFVBQU0scUJBQXFCLElBQUksZ0JBQWdCO0FBQy9DLFFBQUksS0FBSyxvQkFBb0Isc0JBQXNCLEtBQUssb0JBQW9CLGVBQWU7QUFDMUYseUJBQW1CLElBQUksWUFBWSxHQUFHO0FBQUEsSUFDdkM7QUFDQSxRQUFJLGVBQWUsb0JBQW9CLE1BQU0sSUFBSTtBQUVqRCxVQUFNLFNBQVMsSUFBSSxtQkFBbUIsU0FBUyxDQUFDO0FBRWhELFVBQU0sbUJBQW9DO0FBQzFDLFFBQUksU0FBUyxPQUFPO0FBQ25CLFlBQU0seUJBQXlCLEtBQUssZ0JBQWdCO0FBQ3BELFlBQU0sU0FBUyxLQUFLLGdCQUFnQjtBQUNwQyxZQUFNLFVBQVUsS0FBSyxnQkFBZ0I7QUFDckMsVUFBSSwwQkFBMEIsVUFBVSxTQUFTO0FBRWhELGNBQU0sTUFBTTtBQUNaLFlBQUksbUJBQW1CLEtBQUssZ0JBQWdCLElBQUksS0FBSyxhQUFhLFNBQVM7QUFDM0UsWUFBSSxPQUFPLHFCQUFxQixhQUFhO0FBQzVDLDZCQUFtQixhQUFhO0FBQ2hDLGVBQUssZ0JBQWdCLE1BQU0sS0FBSyxrQkFBa0IsYUFBYSxXQUFXLGNBQWMsT0FBTztBQUFBLFFBQ2hHO0FBQ0EsY0FBTSxPQUFPLE1BQU0saUJBQWlCLFdBQVcsUUFBUSxnQkFBZ0I7QUFDdkUsY0FBTSxVQUNMLHVCQUNFLFFBQVEsWUFBWSxNQUFNLElBQUksRUFBRSxFQUNoQyxRQUFRLGNBQWMsTUFBTSxFQUM1QixRQUFRLGVBQWUsT0FBTztBQUdqQyxjQUFNLE1BQU0sSUFBSSxJQUFJLEdBQUcsT0FBTyxRQUFRLGdCQUFnQixHQUFHLE1BQU0sRUFBRTtBQUNqRSxZQUFJLGFBQWEsSUFBSSxnQkFBZ0IsV0FBVyxNQUFNO0FBQ3RELFlBQUksYUFBYSxJQUFJLFFBQVEsZ0JBQWdCO0FBQzdDLGVBQU8sSUFBSSxTQUFTO0FBQUEsTUFDckI7QUFFQSxjQUFRLEtBQUssbUVBQW1FO0FBQUEsSUFDakY7QUFFQSxVQUFNLGlDQUFpQyxLQUFLLGtCQUFrQixhQUFhLElBQUksb0JBQW9CO0FBQUEsTUFDbEcsbUJBQW1CLFdBQVcsYUFBYSxnQkFBZ0I7QUFBQSxNQUMzRCwwQkFBMEIsSUFBSSxJQUFJLCtDQUErQyxZQUFZLEdBQUc7QUFBQSxNQUNoRyxPQUFPO0FBQUEsSUFDUixDQUFDLENBQUM7QUFFRixXQUFPLEdBQUcsOEJBQThCLEdBQUcsTUFBTTtBQUFBLEVBQ2xEO0FBQUEsRUFFQSxNQUFhLFFBQTBDO0FBQ3RELFFBQUksQ0FBQyxLQUFLLGtCQUFrQjtBQUMzQixXQUFLLG1CQUFtQixLQUFLLG1CQUFtQjtBQUNoRCxXQUFLLGlCQUFpQixLQUFLLGNBQVksS0FBSyxZQUFZLFFBQVE7QUFBQSxJQUNqRTtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWMscUJBQXVEO0FBQ3BFLFVBQU0sa0NBQWtDLE1BQU0sS0FBSyxvQ0FBb0M7QUFDdkYsVUFBTSxVQUFVLEtBQUssVUFBVSxJQUFJLFFBQWtCLENBQUM7QUFFdEQsVUFBTSxTQUFTLFNBQVMsY0FBYyxRQUFRO0FBQzlDLFdBQU8sYUFBYSxTQUFTLDRCQUE0QjtBQUN6RCxXQUFPLGFBQWEsV0FBVyxpQ0FBaUM7QUFDaEUsV0FBTyxhQUFhLFNBQVMsZ0VBQWdFO0FBQzdGLFdBQU8sYUFBYSxlQUFlLE1BQU07QUFDekMsV0FBTyxNQUFNLFVBQVU7QUFFdkIsVUFBTSwyQkFBMkIsYUFBYTtBQUM5QyxXQUFPLGFBQWEsT0FBTyxHQUFHLCtCQUErQiw2QkFBNkIsd0JBQXdCLEVBQUU7QUFFcEgsVUFBTSxVQUFVLElBQUksUUFBUTtBQUM1QixRQUFJO0FBQ0osUUFBSSxlQUE2QjtBQUNqQyxRQUFJLGtCQUFrQjtBQUN0QixRQUFJLGVBQW9DO0FBRXhDLFVBQU0sZ0JBQWdCLENBQUMsVUFBa0IsVUFBaUI7QUFDekQscUJBQWU7QUFDZix3QkFBa0I7QUFDbEIsd0JBQWtCLFlBQVk7QUFDOUIsbUJBQWEsWUFBWTtBQUN6QixXQUFLLFdBQVcsS0FBSyxDQUFDLHNCQUFzQixpQkFBaUIsYUFBYSxPQUFPLENBQUM7QUFDbEYsY0FBUSxLQUFLO0FBQUEsSUFDZDtBQUVBLFVBQU0saUJBQWlCLENBQUMsZ0JBQTZCO0FBQ3BELGFBQU87QUFDUCxtQkFBYSxZQUFZO0FBQ3pCLGNBQVEsS0FBSztBQUFBLElBQ2Q7QUFFQSxtQkFBZSxXQUFXLE1BQU07QUFDL0IsY0FBUSxLQUFLLDhFQUE4RTtBQUFBLElBQzVGLEdBQUcsR0FBSztBQUVSLFNBQUssVUFBVSxJQUFJLHNCQUFzQixZQUFZLFdBQVcsQ0FBQyxVQUFVO0FBQzFFLFVBQUksTUFBTSxXQUFXLE9BQU8sZUFBZTtBQUMxQztBQUFBLE1BQ0Q7QUFDQSxVQUFJLE1BQU0sS0FBSyw2QkFBNkIsMEJBQTBCO0FBQ3JFO0FBQUEsTUFDRDtBQUNBLFVBQUksTUFBTSxLQUFLLE9BQU87QUFDckIsY0FBTSxFQUFFLE1BQU0sU0FBUyxNQUFNLElBQUksTUFBTSxLQUFLO0FBQzVDLGNBQU0sTUFBTSxJQUFJLE1BQU07QUFDdEIsWUFBSSxVQUFVO0FBQ2QsWUFBSSxPQUFPO0FBQ1gsWUFBSSxRQUFRO0FBQ1osZUFBTyxjQUFjLHNCQUFzQixpQkFBaUIsR0FBRztBQUFBLE1BQ2hFO0FBQ0EsVUFBSSxNQUFNLEtBQUssU0FBUyx3QkFBd0I7QUFDL0MsZUFBTyxjQUFlLFlBQVk7QUFBQSxVQUNqQyxNQUFNLE1BQU0sS0FBSztBQUFBLFVBQ2pCLE1BQU07QUFBQSxZQUNMLFdBQVcsS0FBSyxrQkFBa0IsYUFBYSxpQ0FBaUM7QUFBQSxZQUNoRixVQUFVLFdBQVc7QUFBQSxZQUNyQixLQUFLO0FBQUEsY0FDSixVQUFVLGVBQWU7QUFBQSxjQUN6QixVQUFVLGVBQWU7QUFBQSxZQUMxQjtBQUFBLFVBQ0Q7QUFBQSxRQUNELEdBQUcsR0FBRztBQUNOO0FBQUEsTUFDRDtBQUNBLFlBQU0sRUFBRSxLQUFLLElBQUksTUFBTTtBQUN2QixVQUFJLFFBQVEsT0FBTyxLQUFLLEVBQUUsZ0JBQWdCLGNBQWM7QUFDdkQsZ0JBQVEsS0FBSyxzQkFBc0IsS0FBSztBQUN4QyxjQUFNLE1BQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUMxQyxlQUFPLGNBQWMsc0JBQXNCLGlCQUFpQixHQUFHO0FBQUEsTUFDaEU7QUFDQSxxQkFBZSxJQUFJO0FBQUEsSUFDcEIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxlQUFlLGNBQWMsWUFBWSxNQUFNO0FBQ3BELFNBQUssVUFBVSxhQUFhLE1BQU0sT0FBTyxPQUFPLENBQUMsQ0FBQztBQUlsRCxVQUFNLFFBQVEsS0FBSztBQUVuQixRQUFJLGlCQUFpQjtBQUNwQixZQUFNO0FBQUEsSUFDUDtBQUdBLFVBQU0sZUFBZSxLQUFLLG9CQUFvQixTQUFTLGdCQUFnQixvQkFBSSxJQUFJO0FBQy9FLFdBQU8sY0FBZSxZQUFZLEVBQUUsTUFBTSxlQUFlLE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxHQUFHLGFBQWEsT0FBTyxDQUFDLENBQUM7QUFFOUcsU0FBSyxZQUFZLENBQUMsVUFBVTtBQUMzQixZQUFNLEVBQUUsS0FBSyxJQUFJO0FBQ2pCLFVBQUksRUFBRSxnQkFBZ0IsY0FBYztBQUNuQyxnQkFBUSxLQUFLLHlCQUF5QixJQUFJO0FBQzFDLGFBQUssV0FBVyxLQUFLLENBQUMsSUFBSSx1QkFBdUIsQ0FBQztBQUNsRDtBQUFBLE1BQ0Q7QUFDQSxjQUFRLEtBQUssU0FBUyxLQUFLLElBQUksV0FBVyxNQUFNLEdBQUcsS0FBSyxVQUFVLENBQUMsQ0FBQztBQUFBLElBQ3JFO0FBRUEsVUFBTSxXQUFvQztBQUFBLE1BQ3pDLFdBQVcsUUFBUTtBQUFBLE1BQ25CLE1BQU0sV0FBUztBQUNkLGNBQU0sT0FBTyxNQUFNLE9BQU8sT0FBTyxNQUFNLE1BQU0sT0FBTyxZQUFZLE1BQU0sT0FBTyxhQUFhLE1BQU0sT0FBTyxVQUFVO0FBQ2pILGFBQUssWUFBWSxNQUFNLENBQUMsSUFBSSxDQUFDO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLLGtCQUFrQixRQUFRO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLFVBQXFFO0FBTXBHLFVBQU0sTUFBTSxVQUFVLE1BQU0sT0FBTyxTQUFTLFdBQVcsU0FBTyxnQkFBZ0IsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDO0FBQ3RHLFFBQUksS0FBSyxnQkFBZ0I7QUFDeEIsWUFBTSxTQUFTO0FBQUEsSUFDaEI7QUFDQSxhQUFTLEtBQUssU0FBUyxXQUFXLEtBQUssVUFBVSxNQUFNLEtBQUssdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0FBQ3RGLFFBQUksS0FBSyxnQkFBZ0I7QUFDeEIsWUFBTSxTQUFTO0FBQUEsSUFDaEI7QUFDQSxVQUFNLE1BQU0sVUFBVSxNQUFNLE9BQU8sU0FBUyxXQUFXLFNBQU8sZ0JBQWdCLEtBQUssWUFBWSxXQUFXLENBQUMsQ0FBQztBQUM1RyxRQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLFlBQU0sU0FBUztBQUFBLElBQ2hCO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVnQixVQUFnQjtBQUMvQixRQUFJLEtBQUssZ0JBQWdCO0FBQ3hCO0FBQUEsSUFDRDtBQUNBLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssV0FBVyxLQUFLLG9CQUFvQixZQUFZLFNBQVMsQ0FBQztBQUMvRCxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQUEsRUFFQSxpQkFBNEI7QUFDM0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLG9CQUFzQztBQUNyQyxXQUFPLFFBQVEsUUFBUSxLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUVBLE1BQWMseUJBQTBEO0FBQ3ZFLFVBQU0sV0FBVyxNQUFNLEtBQUssa0JBQWtCLFlBQVk7QUFDMUQsU0FBSyxhQUFhLFNBQVM7QUFDM0IsVUFBTSxZQUFZLEtBQUssZ0JBQWdCLGFBQWE7QUFDcEQsVUFBTSxhQUFhLEtBQUssZ0JBQWdCLG1CQUFtQjtBQUMzRCxRQUFJLG9CQUFxQztBQUV6QyxRQUFJLGNBQWMsS0FBSyxnQkFBZ0IsVUFBVSxDQUFDLFNBQVMsU0FBUyxpQkFBaUIsR0FBRztBQUN2RiwwQkFBb0IsSUFBSSxTQUFTLElBQUksTUFBTSxVQUFVLEdBQUcsS0FBSyxnQkFBZ0IsUUFBUSxLQUFLLGdCQUFnQixTQUFTLFNBQVMsU0FBUyxNQUFNLENBQUM7QUFBQSxJQUM3STtBQUNBLFVBQU0sOEJBQThCLE1BQU0sNkNBQTZDLEtBQUssNkJBQTZCLEtBQUssZ0JBQWdCLE9BQU87QUFDckosV0FBTztBQUFBLE1BQ04sUUFBUSxLQUFLLGdCQUFnQjtBQUFBLE1BQzdCLFNBQVMsS0FBSyxnQkFBZ0I7QUFBQSxNQUM5QixTQUFTLEtBQUssZ0JBQWdCO0FBQUEsTUFDOUIsTUFBTSxLQUFLLGdCQUFnQjtBQUFBLE1BQzNCLFdBQVc7QUFBQSxNQUNYO0FBQUEsTUFDQSxhQUFhO0FBQUEsUUFDWiw2QkFBNkIsS0FBSyxvQkFBb0I7QUFBQSxRQUN0RCxTQUFTLEtBQUssZ0JBQWdCO0FBQUEsUUFDOUIsU0FBUyxLQUFLLGdCQUFnQix1QkFBdUIsU0FBUyxRQUFRLFFBQVE7QUFBQSxRQUM5RSxjQUFjLEtBQUssZ0JBQWdCO0FBQUEsUUFDbkMsYUFBYSxTQUFTO0FBQUEsUUFDdEIsaUNBQWlDLGNBQWMsS0FBSyxpQkFBaUIsS0FBSyxtQkFBbUI7QUFBQSxRQUM3RixZQUFZO0FBQUEsUUFDWixpQ0FBaUMsS0FBSyxvQkFBb0I7QUFBQSxRQUMxRCwyQkFBMkIsS0FBSyxvQkFBb0I7QUFBQSxRQUNwRCxtQkFBbUIsS0FBSyx5QkFBeUIsZUFBZTtBQUFBLFFBQ2hFLHNCQUFzQixLQUFLLG9CQUFvQjtBQUFBLFFBQy9DLG1CQUFtQixLQUFLLHlCQUF5QixpQkFBaUI7QUFBQSxRQUNsRSxrQkFBa0IsS0FBSyxvQkFBb0I7QUFBQSxNQUM1QztBQUFBLE1BQ0EsV0FBVyxLQUFLLGdCQUFnQixrQkFBa0IsTUFBTSxlQUFlLFFBQVEsU0FBWTtBQUFBLFFBQzFGLGVBQWUsVUFBVSxpQkFBaUI7QUFBQSxRQUMxQyxJQUFJLFVBQVU7QUFBQSxRQUNkLE1BQU0sS0FBSyxjQUFjLGtCQUFrQixTQUFTO0FBQUEsUUFDcEQsV0FBVyxVQUFVO0FBQUEsTUFDdEI7QUFBQSxNQUNBLGdCQUFnQjtBQUFBLFFBQ2YsY0FBYztBQUFBLFFBQ2QsV0FBVyxLQUFLLG9CQUFvQjtBQUFBLE1BQ3JDO0FBQUEsTUFDQSxZQUFZLEtBQUssV0FBVyxXQUFXO0FBQUEsTUFDdkMsWUFBWTtBQUFBLE1BQ1osZUFBZTtBQUFBLFFBQ2QsV0FBVyxLQUFLLGtCQUFrQjtBQUFBLFFBQ2xDLFdBQVcsS0FBSyxrQkFBa0I7QUFBQSxRQUNsQyxPQUFPLEtBQUssa0JBQWtCO0FBQUEsUUFDOUIsYUFBYSxLQUFLLGtCQUFrQixlQUFlLEtBQUssa0JBQWtCO0FBQUEsUUFDMUUsa0JBQWtCLEtBQUssa0JBQWtCO0FBQUEsUUFDekMsY0FBYyxLQUFLLGtCQUFrQjtBQUFBLE1BQ3RDO0FBQUEsTUFDQSxxQkFBcUIsS0FBSyxnQkFBZ0I7QUFBQSxNQUMxQywrQkFBK0IsS0FBSyxnQkFBZ0I7QUFBQSxNQUNwRCxVQUFVLEtBQUssWUFBWSxTQUFTO0FBQUEsTUFDcEMsU0FBUyxDQUFDLEdBQUcsS0FBSyxlQUFlLHFCQUFxQixDQUFDO0FBQUEsTUFDdkQsY0FBYyxLQUFLO0FBQUEsTUFDbkIsV0FBWSxLQUFLLFlBQVkscUJBQXFCLGtCQUFrQixLQUFLLFlBQVkscUJBQXFCO0FBQUEsTUFDMUcsUUFBUTtBQUFBLFFBQ1AsV0FBVyxLQUFLLG9CQUFvQjtBQUFBLFFBQ3BDLGdCQUFnQjtBQUFBLFFBQ2hCLFVBQVU7QUFBQSxNQUNYO0FBQUEsTUFDQSxRQUFRLFNBQVMsUUFBUSxPQUFPLE1BQU0sT0FBTztBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUNEO0FBM1RhLHlCQUFOO0FBQUEsRUFtQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQS9CVTtBQTZUYixNQUFNLG9DQUFvQyxJQUFJLG9CQUFvQjtBQUFBLEVBQ2pFLE9BQU87QUFBQSxFQUNQLG1CQUFtQixNQUFNLFdBQVcsYUFBYSxvREFBb0Q7QUFBQSxFQUNyRywwQkFBMEIsTUFBTSxJQUFJLElBQUksc0RBQXNELFlBQVksR0FBRztBQUM5RyxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
