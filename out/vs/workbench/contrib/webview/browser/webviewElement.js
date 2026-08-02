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
import { isFirefox } from "../../../../base/browser/browser.js";
import { addDisposableListener, EventType, getWindow, getWindowById } from "../../../../base/browser/dom.js";
import { parentOriginHash } from "../../../../base/browser/iframe.js";
import { promiseWithResolvers, ThrottledDelayer } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { COI } from "../../../../base/common/network.js";
import { observableValue } from "../../../../base/common/observable.js";
import { listenStream } from "../../../../base/common/stream.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { ITunnelService } from "../../../../platform/tunnel/common/tunnel.js";
import { WebviewPortMappingManager } from "../../../../platform/webview/common/webviewPortMapping.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { decodeAuthority, webviewGenericCspSource, webviewRootResourceAuthority } from "../common/webview.js";
import { loadLocalResource, WebviewResourceResponse } from "./resourceLoading.js";
import { areWebviewContentOptionsEqual } from "./webview.js";
import { WebviewFindWidget } from "./webviewFindWidget.js";
var WebviewState;
((WebviewState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Initializing"] = 0] = "Initializing";
    Type2[Type2["Ready"] = 1] = "Ready";
  })(Type = WebviewState2.Type || (WebviewState2.Type = {}));
  class Initializing {
    constructor(pendingMessages) {
      this.pendingMessages = pendingMessages;
      this.type = 0 /* Initializing */;
    }
  }
  WebviewState2.Initializing = Initializing;
  WebviewState2.Ready = { type: 1 /* Ready */ };
})(WebviewState || (WebviewState = {}));
const webviewIdContext = "webviewId";
let WebviewElement = class extends Disposable {
  constructor(initInfo, webviewThemeDataProvider, configurationService, contextMenuService, notificationService, _environmentService, _logService, _remoteAuthorityResolverService, _tunnelService, _accessibilityService, _instantiationService) {
    super();
    this.webviewThemeDataProvider = webviewThemeDataProvider;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._tunnelService = _tunnelService;
    this._accessibilityService = _accessibilityService;
    this._instantiationService = _instantiationService;
    this.id = generateUuid();
    this._windowId = void 0;
    this._expectedServiceWorkerVersion = 6;
    this._state = new WebviewState.Initializing([]);
    this._resourceLoadingCts = this._register(new CancellationTokenSource());
    this._activeStreamControllers = /* @__PURE__ */ new Set();
    this._focusDelayer = this._register(new ThrottledDelayer(50));
    this._onDidHtmlChange = this._register(new Emitter());
    this.onDidHtmlChange = this._onDidHtmlChange.event;
    this._messageHandlers = /* @__PURE__ */ new Map();
    this.checkImeCompletionState = true;
    this.intrinsicContentSize = observableValue("WebviewIntrinsicContentSize", void 0);
    this._disposed = false;
    this._onMissingCsp = this._register(new Emitter());
    this.onMissingCsp = this._onMissingCsp.event;
    this._onDidClickLink = this._register(new Emitter());
    this.onDidClickLink = this._onDidClickLink.event;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidWheel = this._register(new Emitter());
    this.onDidWheel = this._onDidWheel.event;
    this._onDidUpdateState = this._register(new Emitter());
    this.onDidUpdateState = this._onDidUpdateState.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onFatalError = this._register(new Emitter());
    this.onFatalError = this._onFatalError.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._hasAlertedAboutMissingCsp = false;
    this._hasFindResult = this._register(new Emitter());
    this.hasFindResult = this._hasFindResult.event;
    this._onDidStopFind = this._register(new Emitter());
    this.onDidStopFind = this._onDidStopFind.event;
    this.providedViewType = initInfo.providedViewType;
    this.origin = initInfo.origin ?? this.id;
    this._options = initInfo.options;
    this.extension = initInfo.extension;
    this._content = {
      html: "",
      title: initInfo.title,
      options: initInfo.contentOptions,
      state: void 0
    };
    this._portMappingManager = this._register(new WebviewPortMappingManager(
      () => this.extension?.location,
      () => this._content.options.portMapping || [],
      this._tunnelService
    ));
    this._element = this._createElement(initInfo.options, initInfo.contentOptions);
    this._register(this.on("no-csp-found", () => {
      this.handleNoCspFound();
    }));
    this._register(this.on("did-click-link", ({ uri }) => {
      if (!this.isActiveElement()) {
        return;
      }
      this._onDidClickLink.fire(uri);
    }));
    this._register(this.on("onmessage", ({ message, transfer }) => {
      this._onMessage.fire({ message, transfer });
    }));
    this._register(this.on("did-scroll", ({ scrollYPercentage }) => {
      this._onDidScroll.fire({ scrollYPercentage });
    }));
    this._register(this.on("do-reload", () => {
      this.reload();
    }));
    this._register(this.on("do-update-state", (state) => {
      this.state = state;
      this._onDidUpdateState.fire(state);
    }));
    this._register(this.on("did-focus", () => {
      this.handleFocusChange(true);
    }));
    this._register(this.on("did-blur", () => {
      this.handleFocusChange(false);
    }));
    this._register(this.on("did-scroll-wheel", (event) => {
      this._onDidWheel.fire(event);
    }));
    this._register(this.on("did-find", ({ didFind }) => {
      this._hasFindResult.fire(didFind);
    }));
    this._register(this.on("fatal-error", (e) => {
      notificationService.error(localize("fatalErrorMessage", "Error loading webview: {0}", e.message));
      this._onFatalError.fire({ message: e.message });
    }));
    this._register(this.on("did-keydown", (data) => {
      this.handleKeyEvent("keydown", data);
    }));
    this._register(this.on("did-keyup", (data) => {
      this.handleKeyEvent("keyup", data);
    }));
    this._register(this.on("did-context-menu", (data) => {
      if (!this.element) {
        return;
      }
      if (!this._contextKeyService) {
        return;
      }
      const elementBox = this.element.getBoundingClientRect();
      const contextKeyService = this._contextKeyService.createOverlay([
        ...Object.entries(data.context),
        [webviewIdContext, this.providedViewType]
      ]);
      contextMenuService.showContextMenu({
        menuId: MenuId.WebviewContext,
        menuActionOptions: { shouldForwardArgs: true },
        contextKeyService,
        getActionsContext: () => ({ ...data.context, webview: this.providedViewType }),
        getAnchor: () => ({
          x: elementBox.x + data.clientX,
          y: elementBox.y + data.clientY
        })
      });
      this._send("set-context-menu-visible", { visible: true });
    }));
    this._register(this.on("load-resource", async (entry) => {
      try {
        const authority = decodeAuthority(entry.authority);
        const uri = URI.from({
          scheme: entry.scheme,
          authority,
          path: decodeURIComponent(entry.path),
          // This gets re-encoded
          query: entry.query ? decodeURIComponent(entry.query) : entry.query
        });
        this.loadResource(entry.id, uri, { ifNoneMatch: entry.ifNoneMatch, range: entry.range }, this._resourceLoadingCts.token);
      } catch (e) {
        this._send("did-load-resource", {
          id: entry.id,
          status: 404,
          path: entry.path
        });
      }
    }));
    this._register(this.on("load-localhost", (entry) => {
      this.localLocalhost(entry.id, entry.origin);
    }));
    this._register(Event.runAndSubscribe(webviewThemeDataProvider.onThemeDataChanged, () => this.style()));
    this._register(_accessibilityService.onDidChangeReducedMotion(() => this.style()));
    this._register(_accessibilityService.onDidChangeScreenReaderOptimized(() => this.style()));
    this._register(contextMenuService.onDidHideContextMenu(() => this._send("set-context-menu-visible", { visible: false })));
    this._confirmBeforeClose = configurationService.getValue("window.confirmBeforeClose");
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("window.confirmBeforeClose")) {
        this._confirmBeforeClose = configurationService.getValue("window.confirmBeforeClose");
        this._send("set-confirm-before-close", this._confirmBeforeClose);
      }
    }));
    this._register(this.on("drag-start", () => {
      this._startBlockingIframeDragEvents();
    }));
    this._register(this.on("drag", (event) => {
      this.handleDragEvent("drag", event);
    }));
    this._register(this.on("updated-intrinsic-content-size", (event) => {
      this.intrinsicContentSize.set({ width: event.width, height: event.height }, void 0, void 0);
    }));
    if (initInfo.options.enableFindWidget) {
      this._webviewFindWidget = this._register(this._instantiationService.createInstance(WebviewFindWidget, this));
    }
  }
  get window() {
    return typeof this._windowId === "number" ? getWindowById(this._windowId)?.window : void 0;
  }
  get platform() {
    return "browser";
  }
  get element() {
    return this._element;
  }
  get isFocused() {
    if (!this._focused) {
      return false;
    }
    if (!this.window) {
      return false;
    }
    if (this.window.document.activeElement && this.window.document.activeElement !== this.element) {
      return false;
    }
    return true;
  }
  dispose() {
    this._disposed = true;
    this.element?.remove();
    this._element = void 0;
    this._messagePort = void 0;
    if (this._state.type === 0 /* Initializing */) {
      for (const message of this._state.pendingMessages) {
        message.resolve(false);
      }
      this._state.pendingMessages = [];
    }
    this._onDidDispose.fire();
    for (const controller of this._activeStreamControllers) {
      try {
        controller.close();
      } catch {
      }
    }
    this._activeStreamControllers.clear();
    this._resourceLoadingCts.dispose(true);
    super.dispose();
  }
  setContextKeyService(contextKeyService) {
    this._contextKeyService = contextKeyService;
  }
  postMessage(message, transfer) {
    return this._send("message", { message, transfer });
  }
  async _send(channel, data, _createElement = []) {
    if (this._state.type === 0 /* Initializing */) {
      const { promise, resolve } = promiseWithResolvers();
      this._state.pendingMessages.push({ channel, data, transferable: _createElement, resolve });
      return promise;
    } else {
      return this.doPostMessage(channel, data, _createElement);
    }
  }
  _createElement(options, _contentOptions) {
    const element = document.createElement("iframe");
    element.name = this.id;
    element.className = `webview ${options.customClasses || ""}`;
    element.sandbox.add("allow-scripts", "allow-same-origin", "allow-forms", "allow-pointer-lock", "allow-downloads");
    const allowRules = ["cross-origin-isolated", "autoplay", "local-network-access"];
    if (!isFirefox) {
      allowRules.push("clipboard-read", "clipboard-write");
    }
    element.setAttribute("allow", allowRules.join("; "));
    element.style.border = "none";
    element.style.width = "100%";
    element.style.height = "100%";
    element.focus = () => {
      this._doFocus();
    };
    return element;
  }
  _initElement(encodedWebviewOrigin, extension, options, targetWindow) {
    const params = {
      id: this.id,
      parentId: targetWindow.vscodeWindowId.toString(),
      origin: this.origin,
      swVersion: String(this._expectedServiceWorkerVersion),
      extensionId: extension?.id.value ?? "",
      platform: this.platform,
      "vscode-resource-base-authority": webviewRootResourceAuthority,
      parentOrigin: targetWindow.origin
    };
    if (this._options.disableServiceWorker) {
      params.disableServiceWorker = "true";
    }
    if (this._environmentService.remoteAuthority) {
      params.remoteAuthority = this._environmentService.remoteAuthority;
    }
    if (options.purpose) {
      params.purpose = options.purpose;
    }
    COI.addSearchParam(params, true, true);
    const queryString = new URLSearchParams(params).toString();
    this.perfMark("init/set-src");
    const fileName = "index.html";
    this.element.setAttribute("src", `${this.webviewContentEndpoint(encodedWebviewOrigin)}/${fileName}?${queryString}`);
  }
  mountTo(element, targetWindow) {
    if (!this.element) {
      return;
    }
    this._windowId = targetWindow.vscodeWindowId;
    this._encodedWebviewOriginPromise = parentOriginHash(targetWindow.origin, this.origin).then((id) => this._encodedWebviewOrigin = id);
    this._encodedWebviewOriginPromise.then((encodedWebviewOrigin) => {
      if (!this._disposed) {
        this._initElement(encodedWebviewOrigin, this.extension, this._options, targetWindow);
      }
    });
    this._registerMessageHandler(targetWindow);
    if (this._webviewFindWidget) {
      element.appendChild(this._webviewFindWidget.getDomNode());
    }
    for (const eventName of [EventType.MOUSE_DOWN, EventType.MOUSE_MOVE, EventType.DROP]) {
      this._register(addDisposableListener(element, eventName, () => {
        this._stopBlockingIframeDragEvents();
      }));
    }
    for (const node of [element, targetWindow]) {
      this._register(addDisposableListener(node, EventType.DRAG_END, () => {
        this._stopBlockingIframeDragEvents();
      }));
    }
    element.id = this.id;
    this.perfMark("mounted");
    element.appendChild(this.element);
  }
  _registerMessageHandler(targetWindow) {
    const subscription = this._register(addDisposableListener(targetWindow, "message", (e) => {
      if (!this._encodedWebviewOrigin || e?.data?.target !== this.id) {
        return;
      }
      if (e.origin !== this._webviewContentOrigin(this._encodedWebviewOrigin)) {
        console.log(`Skipped renderer receiving message due to mismatched origins: ${e.origin} ${this._webviewContentOrigin}`);
        return;
      }
      if (e.data.channel === "webview-ready") {
        if (this._messagePort) {
          return;
        }
        this.perfMark("webview-ready");
        this._logService.trace(`Webview(${this.id}): webview ready`);
        this._messagePort = e.ports[0];
        this._messagePort.onmessage = (e2) => {
          const handlers = this._messageHandlers.get(e2.data.channel);
          if (!handlers) {
            console.log(`No handlers found for '${e2.data.channel}'`);
            return;
          }
          handlers?.forEach((handler) => handler(e2.data.data, e2));
        };
        this.element?.classList.add("ready");
        if (this._state.type === 0 /* Initializing */) {
          this._state.pendingMessages.forEach(({ channel, data, resolve }) => resolve(this.doPostMessage(channel, data)));
        }
        this._state = WebviewState.Ready;
        subscription.dispose();
      }
    }));
  }
  perfMark(name) {
    performance.mark(`webview/webviewElement/${name}`, {
      detail: {
        id: this.id
      }
    });
  }
  _startBlockingIframeDragEvents() {
    if (this.element) {
      this.element.style.pointerEvents = "none";
    }
  }
  _stopBlockingIframeDragEvents() {
    if (this.element) {
      this.element.style.pointerEvents = "auto";
    }
  }
  webviewContentEndpoint(encodedWebviewOrigin) {
    const webviewExternalEndpoint = this._environmentService.webviewExternalEndpoint;
    if (!webviewExternalEndpoint) {
      throw new Error(`'webviewExternalEndpoint' has not been configured. Webviews will not work!`);
    }
    const endpoint = webviewExternalEndpoint.replace("{{uuid}}", encodedWebviewOrigin);
    if (endpoint[endpoint.length - 1] === "/") {
      return endpoint.slice(0, endpoint.length - 1);
    }
    return endpoint;
  }
  _webviewContentOrigin(encodedWebviewOrigin) {
    const uri = URI.parse(this.webviewContentEndpoint(encodedWebviewOrigin));
    return uri.scheme + "://" + uri.authority.toLowerCase();
  }
  doPostMessage(channel, data, transferable = []) {
    if (this.element && this._messagePort) {
      this._messagePort.postMessage({ channel, args: data }, transferable);
      return true;
    }
    return false;
  }
  on(channel, handler) {
    let handlers = this._messageHandlers.get(channel);
    if (!handlers) {
      handlers = /* @__PURE__ */ new Set();
      this._messageHandlers.set(channel, handlers);
    }
    handlers.add(handler);
    return toDisposable(() => {
      this._messageHandlers.get(channel)?.delete(handler);
    });
  }
  handleNoCspFound() {
    if (this._hasAlertedAboutMissingCsp) {
      return;
    }
    this._hasAlertedAboutMissingCsp = true;
    if (this.extension?.id) {
      if (this._environmentService.isExtensionDevelopment) {
        this._onMissingCsp.fire(this.extension.id);
      }
    }
  }
  reload() {
    this.doUpdateContent(this._content);
  }
  reinitializeAfterDismount() {
    this._state = new WebviewState.Initializing([]);
    this._messagePort = void 0;
    this.mountTo(this.element.parentElement, getWindow(this.element));
    this.style();
    this.reload();
  }
  setHtml(html) {
    this.doUpdateContent({ ...this._content, html });
    this._onDidHtmlChange.fire(html);
  }
  setTitle(title) {
    this._content = { ...this._content, title };
    this._send("set-title", title);
  }
  set contentOptions(options) {
    this._logService.debug(`Webview(${this.id}): will update content options`);
    if (areWebviewContentOptionsEqual(options, this._content.options)) {
      this._logService.debug(`Webview(${this.id}): skipping content options update`);
      return;
    }
    this.doUpdateContent({ ...this._content, options });
  }
  set localResourcesRoot(resources) {
    this._content = {
      ...this._content,
      options: { ...this._content.options, localResourceRoots: resources }
    };
  }
  set state(state) {
    this._content = { ...this._content, state };
  }
  set initialScrollProgress(value) {
    this._send("initial-scroll-position", value);
  }
  doUpdateContent(newContent) {
    this._logService.debug(`Webview(${this.id}): will update content`);
    this._content = newContent;
    const allowScripts = !!this._content.options.allowScripts;
    this.perfMark("set-content");
    this._send("content", {
      contents: this._content.html,
      title: this._content.title,
      options: {
        allowMultipleAPIAcquire: !!this._content.options.allowMultipleAPIAcquire,
        allowScripts,
        allowForms: this._content.options.allowForms ?? allowScripts
        // For back compat, we allow forms by default when scripts are enabled
      },
      state: this._content.state,
      cspSource: webviewGenericCspSource,
      confirmBeforeClose: this._confirmBeforeClose
    });
  }
  style() {
    let { styles, activeTheme, themeLabel, themeId } = this.webviewThemeDataProvider.getWebviewThemeData();
    if (this._options.transformCssVariables) {
      styles = this._options.transformCssVariables(styles);
    }
    const reduceMotion = this._accessibilityService.isMotionReduced();
    const screenReader = this._accessibilityService.isScreenReaderOptimized();
    this._send("styles", { styles, activeTheme, themeId, themeLabel, reduceMotion, screenReader });
  }
  handleFocusChange(isFocused) {
    this._focused = isFocused;
    if (isFocused) {
      this._onDidFocus.fire();
    } else {
      this._onDidBlur.fire();
    }
  }
  shouldForwardKeyEvent(event) {
    return event.isTrusted || !!this._content.options.forwardUntrustedKeypressEvents;
  }
  isActiveElement() {
    return !!this.element && this.window?.document.activeElement === this.element;
  }
  handleKeyEvent(type, event) {
    if (!this.shouldForwardKeyEvent(event) || !this.isActiveElement()) {
      return;
    }
    const emulatedKeyboardEvent = new KeyboardEvent(type, event);
    Object.defineProperty(emulatedKeyboardEvent, "target", {
      get: () => this.element
    });
    this.window?.dispatchEvent(emulatedKeyboardEvent);
  }
  handleDragEvent(type, event) {
    const emulatedDragEvent = new DragEvent(type, event);
    Object.defineProperty(emulatedDragEvent, "target", {
      get: () => this.element
    });
    this.window?.dispatchEvent(emulatedDragEvent);
  }
  windowDidDragStart() {
    this._startBlockingIframeDragEvents();
  }
  windowDidDragEnd() {
    this._stopBlockingIframeDragEvents();
  }
  selectAll() {
    this.execCommand("selectAll");
  }
  copy() {
    this.execCommand("copy");
  }
  paste() {
    this.execCommand("paste");
  }
  cut() {
    this.execCommand("cut");
  }
  undo() {
    this.execCommand("undo");
  }
  redo() {
    this.execCommand("redo");
  }
  execCommand(command) {
    if (this.element) {
      this._send("execCommand", command);
    }
  }
  async loadResource(id, uri, options, token) {
    if (this._disposed) {
      return;
    }
    try {
      const result = await this._instantiationService.invokeFunction(loadLocalResource, uri, {
        ifNoneMatch: options.ifNoneMatch,
        roots: this._content.options.localResourceRoots || [],
        range: options.range
      }, token);
      if (this._disposed) {
        return;
      }
      switch (result.type) {
        case WebviewResourceResponse.Type.Success: {
          const range = options.range;
          const requestedRangeEnd = range?.end !== void 0 ? range.end : result.size - 1;
          const rangeEnd = Math.min(requestedRangeEnd, result.size - 1);
          const rangeHeader = range ? `bytes ${range.start}-${rangeEnd}/${result.size}` : void 0;
          if (WebviewElement._supportsTransferableStreams.value) {
            const streamCts = this.platform === "electron" ? new CancellationTokenSource(token) : void 0;
            let controller;
            let closed = false;
            const close = () => {
              if (!closed) {
                closed = true;
                streamCts?.dispose();
                if (controller) {
                  this._activeStreamControllers.delete(controller);
                  try {
                    controller.close();
                  } catch {
                  }
                }
              }
            };
            const stream = new ReadableStream({
              start: (newController) => {
                controller = newController;
                this._activeStreamControllers.add(controller);
                listenStream(result.stream, {
                  onData: (chunk) => {
                    if (!closed) {
                      try {
                        controller?.enqueue(new Uint8Array(chunk.buffer.buffer, chunk.buffer.byteOffset, chunk.buffer.byteLength));
                      } catch {
                        close();
                      }
                    }
                  },
                  onError: (err) => {
                    if (!closed) {
                      closed = true;
                      streamCts?.dispose();
                      const currentController = controller;
                      if (currentController) {
                        this._activeStreamControllers.delete(currentController);
                        try {
                          currentController.error(err);
                        } catch {
                        }
                      }
                    }
                  },
                  onEnd: () => close()
                }, streamCts?.token ?? token);
              },
              cancel: streamCts ? () => {
                streamCts.dispose(true);
                result.stream.destroy();
                close();
              } : void 0
            });
            this._send("did-load-resource", {
              id,
              status: range ? 206 : 200,
              path: uri.path,
              mime: result.mimeType,
              etag: result.etag,
              mtime: result.mtime,
              range: rangeHeader,
              stream
            }, [stream]);
          } else {
            this._send("did-load-resource", {
              id,
              status: range ? 206 : 200,
              path: uri.path,
              mime: result.mimeType,
              etag: result.etag,
              mtime: result.mtime,
              range: rangeHeader
            });
            listenStream(result.stream, {
              onData: (chunk) => {
                const data = chunk.buffer.slice();
                this._send("did-load-resource-chunk", { id, data }, [data.buffer]);
              },
              onError: () => {
                this._send("did-load-resource-end", { id, error: true });
              },
              onEnd: () => {
                this._send("did-load-resource-end", { id });
              }
            }, token);
          }
          return;
        }
        case WebviewResourceResponse.Type.NotModified: {
          return this._send("did-load-resource", {
            id,
            status: 304,
            // not modified
            path: uri.path,
            mime: result.mimeType,
            mtime: result.mtime
          });
        }
        case WebviewResourceResponse.Type.AccessDenied: {
          return this._send("did-load-resource", {
            id,
            status: 401,
            // unauthorized
            path: uri.path
          });
        }
      }
    } catch {
    }
    return this._send("did-load-resource", {
      id,
      status: 404,
      path: uri.path
    });
  }
  async localLocalhost(id, origin) {
    const authority = this._environmentService.remoteAuthority;
    const resolveAuthority = authority ? await this._remoteAuthorityResolverService.resolveAuthority(authority) : void 0;
    const redirect = resolveAuthority ? await this._portMappingManager.getRedirect(resolveAuthority.authority, origin) : void 0;
    return this._send("did-load-localhost", {
      id,
      origin,
      location: redirect
    });
  }
  focus() {
    this._doFocus();
    this.handleFocusChange(true);
  }
  _doFocus() {
    if (!this.element) {
      return;
    }
    try {
      this.element.contentWindow?.focus();
    } catch {
    }
    this._focusDelayer.trigger(async () => {
      if (!this.isFocused || !this.element) {
        return;
      }
      if (this.window?.document.activeElement && this.window.document.activeElement !== this.element && this.window.document.activeElement?.tagName !== "BODY") {
        return;
      }
      this.window?.document.body?.focus();
      this._send("focus", void 0);
    });
  }
  /**
   * Webviews expose a stateful find API.
   * Successive calls to find will move forward or backward through onFindResults
   * depending on the supplied options.
   *
   * @param value The string to search for. Empty strings are ignored.
   */
  find(value, previous) {
    if (!this.element) {
      return;
    }
    this._send("find", { value, previous });
  }
  updateFind(value) {
    if (!value || !this.element) {
      return;
    }
    this._send("find", { value });
  }
  stopFind(keepSelection) {
    if (!this.element) {
      return;
    }
    this._send("find-stop", { clearSelection: !keepSelection });
    this._onDidStopFind.fire();
  }
  showFind(animated = true) {
    this._webviewFindWidget?.reveal(void 0, animated);
  }
  hideFind(animated = true) {
    this._webviewFindWidget?.hide(animated);
  }
  runFindAction(previous) {
    this._webviewFindWidget?.find(previous);
  }
};
WebviewElement._supportsTransferableStreams = new Lazy(() => {
  try {
    const stream = new ReadableStream();
    const mc = new MessageChannel();
    mc.port1.postMessage(stream, [stream]);
    mc.port1.close();
    mc.port2.close();
    return true;
  } catch {
    return false;
  }
});
WebviewElement = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IRemoteAuthorityResolverService),
  __decorateParam(8, ITunnelService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, IInstantiationService)
], WebviewElement);
export {
  WebviewElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3RWxlbWVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzRmlyZWZveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGdldFdpbmRvd0J5SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHBhcmVudE9yaWdpbkhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaWZyYW1lLmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBwcm9taXNlV2l0aFJlc29sdmVycywgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ09JIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxpc3RlblN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElUdW5uZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwuanMnO1xuaW1wb3J0IHsgV2Vidmlld1BvcnRNYXBwaW5nTWFuYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYnZpZXcvY29tbW9uL3dlYnZpZXdQb3J0TWFwcGluZy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWNvZGVBdXRob3JpdHksIHdlYnZpZXdHZW5lcmljQ3NwU291cmNlLCB3ZWJ2aWV3Um9vdFJlc291cmNlQXV0aG9yaXR5IH0gZnJvbSAnLi4vY29tbW9uL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgbG9hZExvY2FsUmVzb3VyY2UsIFdlYnZpZXdSZXNvdXJjZVJlc3BvbnNlIH0gZnJvbSAnLi9yZXNvdXJjZUxvYWRpbmcuanMnO1xuaW1wb3J0IHsgV2Vidmlld1RoZW1lRGF0YVByb3ZpZGVyIH0gZnJvbSAnLi90aGVtZWluZy5qcyc7XG5pbXBvcnQgeyBhcmVXZWJ2aWV3Q29udGVudE9wdGlvbnNFcXVhbCwgSVdlYnZpZXdFbGVtZW50LCBXZWJ2aWV3Q29udGVudE9wdGlvbnMsIFdlYnZpZXdFeHRlbnNpb25EZXNjcmlwdGlvbiwgV2Vidmlld0luaXRJbmZvLCBXZWJ2aWV3TWVzc2FnZVJlY2VpdmVkRXZlbnQsIFdlYnZpZXdPcHRpb25zIH0gZnJvbSAnLi93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IFdlYnZpZXdGaW5kRGVsZWdhdGUsIFdlYnZpZXdGaW5kV2lkZ2V0IH0gZnJvbSAnLi93ZWJ2aWV3RmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBGcm9tV2Vidmlld01lc3NhZ2UsIEtleUV2ZW50LCBUb1dlYnZpZXdNZXNzYWdlLCBXZWJWaWV3RHJhZ0V2ZW50IH0gZnJvbSAnLi93ZWJ2aWV3TWVzc2FnZXMuanMnO1xuXG5pbnRlcmZhY2UgV2Vidmlld0NvbnRlbnQge1xuXHRyZWFkb25seSBodG1sOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9wdGlvbnM6IFdlYnZpZXdDb250ZW50T3B0aW9ucztcblx0cmVhZG9ubHkgc3RhdGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxubmFtZXNwYWNlIFdlYnZpZXdTdGF0ZSB7XG5cdGV4cG9ydCBjb25zdCBlbnVtIFR5cGUgeyBJbml0aWFsaXppbmcsIFJlYWR5IH1cblxuXHRleHBvcnQgY2xhc3MgSW5pdGlhbGl6aW5nIHtcblx0XHRyZWFkb25seSB0eXBlID0gVHlwZS5Jbml0aWFsaXppbmc7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHB1YmxpYyBwZW5kaW5nTWVzc2FnZXM6IEFycmF5PHtcblx0XHRcdFx0cmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSBkYXRhPzogYW55O1xuXHRcdFx0XHRyZWFkb25seSB0cmFuc2ZlcmFibGU6IFRyYW5zZmVyYWJsZVtdO1xuXHRcdFx0XHRyZWFkb25seSByZXNvbHZlOiAocG9zdGVkOiBib29sZWFuKSA9PiB2b2lkO1xuXHRcdFx0fT5cblx0XHQpIHsgfVxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IFJlYWR5ID0geyB0eXBlOiBUeXBlLlJlYWR5IH0gYXMgY29uc3Q7XG5cblx0ZXhwb3J0IHR5cGUgU3RhdGUgPSB0eXBlb2YgUmVhZHkgfCBJbml0aWFsaXppbmc7XG59XG5cbmludGVyZmFjZSBXZWJ2aWV3QWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IHdlYnZpZXc/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd247XG59XG5cbmNvbnN0IHdlYnZpZXdJZENvbnRleHQgPSAnd2Vidmlld0lkJztcblxuZXhwb3J0IGNsYXNzIFdlYnZpZXdFbGVtZW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXZWJ2aWV3RWxlbWVudCwgV2Vidmlld0ZpbmREZWxlZ2F0ZSB7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0LyoqXG5cdCAqIFRoZSBwcm92aWRlZCBpZGVudGlmaWVyIG9mIHRoaXMgd2Vidmlldy5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBwcm92aWRlZFZpZXdUeXBlPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgb3JpZ2luIHRoaXMgd2VidmlldyBpdHNlbGYgaXMgbG9hZGVkIGZyb20uIE1heSBub3QgYmUgdW5pcXVlXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb3JpZ2luOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBfd2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgd2luZG93KCkgeyByZXR1cm4gdHlwZW9mIHRoaXMuX3dpbmRvd0lkID09PSAnbnVtYmVyJyA/IGdldFdpbmRvd0J5SWQodGhpcy5fd2luZG93SWQpPy53aW5kb3cgOiB1bmRlZmluZWQ7IH1cblxuXHRwcml2YXRlIF9lbmNvZGVkV2Vidmlld09yaWdpblByb21pc2U/OiBQcm9taXNlPHN0cmluZz47XG5cdHByaXZhdGUgX2VuY29kZWRXZWJ2aWV3T3JpZ2luOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGdldCBwbGF0Zm9ybSgpOiBzdHJpbmcgeyByZXR1cm4gJ2Jyb3dzZXInOyB9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3N1cHBvcnRzVHJhbnNmZXJhYmxlU3RyZWFtcyA9IG5ldyBMYXp5PGJvb2xlYW4+KCgpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RyZWFtID0gbmV3IFJlYWRhYmxlU3RyZWFtKCk7XG5cdFx0XHRjb25zdCBtYyA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuXHRcdFx0bWMucG9ydDEucG9zdE1lc3NhZ2Uoc3RyZWFtLCBbc3RyZWFtXSk7XG5cdFx0XHRtYy5wb3J0MS5jbG9zZSgpO1xuXHRcdFx0bWMucG9ydDIuY2xvc2UoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXhwZWN0ZWRTZXJ2aWNlV29ya2VyVmVyc2lvbiA9IDY7IC8vIEtlZXAgdGhpcyBpbiBzeW5jIHdpdGggdGhlIHZlcnNpb24gaW4gc2VydmljZS13b3JrZXIuanNcblxuXHRwcml2YXRlIF9lbGVtZW50OiBIVE1MSUZyYW1lRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGdldCBlbGVtZW50KCk6IEhUTUxJRnJhbWVFbGVtZW50IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2VsZW1lbnQ7IH1cblxuXHRwcml2YXRlIF9mb2N1c2VkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGlzRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX2ZvY3VzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gY29kZSB3aW5kb3cgaXMgb25seSBhdmFpbGFibGUgYWZ0ZXIgdGhlIHdlYnZpZXcgaXMgbW91bnRlZC5cblx0XHRpZiAoIXRoaXMud2luZG93KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgJiYgdGhpcy53aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCAhPT0gdGhpcy5lbGVtZW50KSB7XG5cdFx0XHQvLyBsb29rcyBsaWtlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzI2NDFcblx0XHRcdC8vIHdoZXJlIHRoZSBmb2N1cyBpcyBhY3R1YWxseSBub3QgaW4gdGhlIGA8aWZyYW1lPmBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zdGF0ZTogV2Vidmlld1N0YXRlLlN0YXRlID0gbmV3IFdlYnZpZXdTdGF0ZS5Jbml0aWFsaXppbmcoW10pO1xuXG5cdHByaXZhdGUgX2NvbnRlbnQ6IFdlYnZpZXdDb250ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BvcnRNYXBwaW5nTWFuYWdlcjogV2Vidmlld1BvcnRNYXBwaW5nTWFuYWdlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZUxvYWRpbmdDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVN0cmVhbUNvbnRyb2xsZXJzID0gbmV3IFNldDxSZWFkYWJsZVN0cmVhbURlZmF1bHRDb250cm9sbGVyPigpO1xuXG5cdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY29uZmlybUJlZm9yZUNsb3NlOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXIoNTApKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEh0bWxDaGFuZ2U6IEVtaXR0ZXI8c3RyaW5nPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHByb3RlY3RlZCByZWFkb25seSBvbkRpZEh0bWxDaGFuZ2UgPSB0aGlzLl9vbkRpZEh0bWxDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbWVzc2FnZVBvcnQ/OiBNZXNzYWdlUG9ydDtcblx0cHJpdmF0ZSByZWFkb25seSBfbWVzc2FnZUhhbmRsZXJzID0gbmV3IE1hcDxzdHJpbmcsIFNldDwoZGF0YTogYW55LCBlOiBNZXNzYWdlRXZlbnQpID0+IHZvaWQ+PigpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfd2Vidmlld0ZpbmRXaWRnZXQ6IFdlYnZpZXdGaW5kV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2hlY2tJbWVDb21wbGV0aW9uU3RhdGUgPSB0cnVlO1xuXG5cdHB1YmxpYyByZWFkb25seSBpbnRyaW5zaWNDb250ZW50U2l6ZSA9IG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7IHJlYWRvbmx5IGhlaWdodDogbnVtYmVyIH0gfCB1bmRlZmluZWQ+KCdXZWJ2aWV3SW50cmluc2ljQ29udGVudFNpemUnLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cblxuXHRwdWJsaWMgZXh0ZW5zaW9uOiBXZWJ2aWV3RXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IFdlYnZpZXdPcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGluaXRJbmZvOiBXZWJ2aWV3SW5pdEluZm8sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHdlYnZpZXdUaGVtZURhdGFQcm92aWRlcjogV2Vidmlld1RoZW1lRGF0YVByb3ZpZGVyLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJVHVubmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5wcm92aWRlZFZpZXdUeXBlID0gaW5pdEluZm8ucHJvdmlkZWRWaWV3VHlwZTtcblx0XHR0aGlzLm9yaWdpbiA9IGluaXRJbmZvLm9yaWdpbiA/PyB0aGlzLmlkO1xuXG5cdFx0dGhpcy5fb3B0aW9ucyA9IGluaXRJbmZvLm9wdGlvbnM7XG5cdFx0dGhpcy5leHRlbnNpb24gPSBpbml0SW5mby5leHRlbnNpb247XG5cblx0XHR0aGlzLl9jb250ZW50ID0ge1xuXHRcdFx0aHRtbDogJycsXG5cdFx0XHR0aXRsZTogaW5pdEluZm8udGl0bGUsXG5cdFx0XHRvcHRpb25zOiBpbml0SW5mby5jb250ZW50T3B0aW9ucyxcblx0XHRcdHN0YXRlOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0dGhpcy5fcG9ydE1hcHBpbmdNYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdlYnZpZXdQb3J0TWFwcGluZ01hbmFnZXIoXG5cdFx0XHQoKSA9PiB0aGlzLmV4dGVuc2lvbj8ubG9jYXRpb24sXG5cdFx0XHQoKSA9PiB0aGlzLl9jb250ZW50Lm9wdGlvbnMucG9ydE1hcHBpbmcgfHwgW10sXG5cdFx0XHR0aGlzLl90dW5uZWxTZXJ2aWNlXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9lbGVtZW50ID0gdGhpcy5fY3JlYXRlRWxlbWVudChpbml0SW5mby5vcHRpb25zLCBpbml0SW5mby5jb250ZW50T3B0aW9ucyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCduby1jc3AtZm91bmQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmhhbmRsZU5vQ3NwRm91bmQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkaWQtY2xpY2stbGluaycsICh7IHVyaSB9KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNBY3RpdmVFbGVtZW50KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDbGlja0xpbmsuZmlyZSh1cmkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ29ubWVzc2FnZScsICh7IG1lc3NhZ2UsIHRyYW5zZmVyIH0pID0+IHtcblx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKHsgbWVzc2FnZSwgdHJhbnNmZXIgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignZGlkLXNjcm9sbCcsICh7IHNjcm9sbFlQZXJjZW50YWdlIH0pID0+IHtcblx0XHRcdHRoaXMuX29uRGlkU2Nyb2xsLmZpcmUoeyBzY3JvbGxZUGVyY2VudGFnZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkby1yZWxvYWQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnJlbG9hZCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RvLXVwZGF0ZS1zdGF0ZScsIChzdGF0ZSkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0dGhpcy5fb25EaWRVcGRhdGVTdGF0ZS5maXJlKHN0YXRlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkaWQtZm9jdXMnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmhhbmRsZUZvY3VzQ2hhbmdlKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RpZC1ibHVyJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVGb2N1c0NoYW5nZShmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignZGlkLXNjcm9sbC13aGVlbCcsIChldmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRXaGVlbC5maXJlKGV2ZW50KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkaWQtZmluZCcsICh7IGRpZEZpbmQgfSkgPT4ge1xuXHRcdFx0dGhpcy5faGFzRmluZFJlc3VsdC5maXJlKGRpZEZpbmQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2ZhdGFsLWVycm9yJywgKGUpID0+IHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2ZhdGFsRXJyb3JNZXNzYWdlJywgXCJFcnJvciBsb2FkaW5nIHdlYnZpZXc6IHswfVwiLCBlLm1lc3NhZ2UpKTtcblx0XHRcdHRoaXMuX29uRmF0YWxFcnJvci5maXJlKHsgbWVzc2FnZTogZS5tZXNzYWdlIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RpZC1rZXlkb3duJywgKGRhdGEpID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlS2V5RXZlbnQoJ2tleWRvd24nLCBkYXRhKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkaWQta2V5dXAnLCAoZGF0YSkgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVLZXlFdmVudCgna2V5dXAnLCBkYXRhKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkaWQtY29udGV4dC1tZW51JywgKGRhdGEpID0+IHtcblx0XHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fY29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWxlbWVudEJveCA9IHRoaXMuZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRcdC4uLk9iamVjdC5lbnRyaWVzKGRhdGEuY29udGV4dCksXG5cdFx0XHRcdFt3ZWJ2aWV3SWRDb250ZXh0LCB0aGlzLnByb3ZpZGVkVmlld1R5cGVdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuV2Vidmlld0NvbnRleHQsXG5cdFx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCk6IFdlYnZpZXdBY3Rpb25Db250ZXh0ID0+ICh7IC4uLmRhdGEuY29udGV4dCwgd2VidmlldzogdGhpcy5wcm92aWRlZFZpZXdUeXBlIH0pLFxuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7XG5cdFx0XHRcdFx0eDogZWxlbWVudEJveC54ICsgZGF0YS5jbGllbnRYLFxuXHRcdFx0XHRcdHk6IGVsZW1lbnRCb3gueSArIGRhdGEuY2xpZW50WVxuXHRcdFx0XHR9KVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9zZW5kKCdzZXQtY29udGV4dC1tZW51LXZpc2libGUnLCB7IHZpc2libGU6IHRydWUgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignbG9hZC1yZXNvdXJjZScsIGFzeW5jIChlbnRyeSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gUmVzdG9yZSB0aGUgYXV0aG9yaXR5IHdlIHByZXZpb3VzbHkgZW5jb2RlZFxuXHRcdFx0XHRjb25zdCBhdXRob3JpdHkgPSBkZWNvZGVBdXRob3JpdHkoZW50cnkuYXV0aG9yaXR5KTtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oe1xuXHRcdFx0XHRcdHNjaGVtZTogZW50cnkuc2NoZW1lLFxuXHRcdFx0XHRcdGF1dGhvcml0eTogYXV0aG9yaXR5LFxuXHRcdFx0XHRcdHBhdGg6IGRlY29kZVVSSUNvbXBvbmVudChlbnRyeS5wYXRoKSwgLy8gVGhpcyBnZXRzIHJlLWVuY29kZWRcblx0XHRcdFx0XHRxdWVyeTogZW50cnkucXVlcnkgPyBkZWNvZGVVUklDb21wb25lbnQoZW50cnkucXVlcnkpIDogZW50cnkucXVlcnksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmxvYWRSZXNvdXJjZShlbnRyeS5pZCwgdXJpLCB7IGlmTm9uZU1hdGNoOiBlbnRyeS5pZk5vbmVNYXRjaCwgcmFuZ2U6IGVudHJ5LnJhbmdlIH0sIHRoaXMuX3Jlc291cmNlTG9hZGluZ0N0cy50b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMuX3NlbmQoJ2RpZC1sb2FkLXJlc291cmNlJywge1xuXHRcdFx0XHRcdGlkOiBlbnRyeS5pZCxcblx0XHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0XHRwYXRoOiBlbnRyeS5wYXRoLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdsb2FkLWxvY2FsaG9zdCcsIChlbnRyeSkgPT4ge1xuXHRcdFx0dGhpcy5sb2NhbExvY2FsaG9zdChlbnRyeS5pZCwgZW50cnkub3JpZ2luKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUod2Vidmlld1RoZW1lRGF0YVByb3ZpZGVyLm9uVGhlbWVEYXRhQ2hhbmdlZCwgKCkgPT4gdGhpcy5zdHlsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbigoKSA9PiB0aGlzLnN0eWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKCkgPT4gdGhpcy5zdHlsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dE1lbnVTZXJ2aWNlLm9uRGlkSGlkZUNvbnRleHRNZW51KCgpID0+IHRoaXMuX3NlbmQoJ3NldC1jb250ZXh0LW1lbnUtdmlzaWJsZScsIHsgdmlzaWJsZTogZmFsc2UgfSkpKTtcblxuXHRcdHRoaXMuX2NvbmZpcm1CZWZvcmVDbG9zZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2UnKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3aW5kb3cuY29uZmlybUJlZm9yZUNsb3NlJykpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlybUJlZm9yZUNsb3NlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2UnKTtcblx0XHRcdFx0dGhpcy5fc2VuZCgnc2V0LWNvbmZpcm0tYmVmb3JlLWNsb3NlJywgdGhpcy5fY29uZmlybUJlZm9yZUNsb3NlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkcmFnLXN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhcnRCbG9ja2luZ0lmcmFtZURyYWdFdmVudHMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkcmFnJywgKGV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLmhhbmRsZURyYWdFdmVudCgnZHJhZycsIGV2ZW50KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCd1cGRhdGVkLWludHJpbnNpYy1jb250ZW50LXNpemUnLCAoZXZlbnQpID0+IHtcblx0XHRcdHRoaXMuaW50cmluc2ljQ29udGVudFNpemUuc2V0KHsgd2lkdGg6IGV2ZW50LndpZHRoLCBoZWlnaHQ6IGV2ZW50LmhlaWdodCB9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKGluaXRJbmZvLm9wdGlvbnMuZW5hYmxlRmluZFdpZGdldCkge1xuXHRcdFx0dGhpcy5fd2Vidmlld0ZpbmRXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXZWJ2aWV3RmluZFdpZGdldCwgdGhpcykpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0dGhpcy5lbGVtZW50Py5yZW1vdmUoKTtcblx0XHR0aGlzLl9lbGVtZW50ID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fbWVzc2FnZVBvcnQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5fc3RhdGUudHlwZSA9PT0gV2Vidmlld1N0YXRlLlR5cGUuSW5pdGlhbGl6aW5nKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgdGhpcy5fc3RhdGUucGVuZGluZ01lc3NhZ2VzKSB7XG5cdFx0XHRcdG1lc3NhZ2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0ZS5wZW5kaW5nTWVzc2FnZXMgPSBbXTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBjb250cm9sbGVyIG9mIHRoaXMuX2FjdGl2ZVN0cmVhbUNvbnRyb2xsZXJzKSB7XG5cdFx0XHR0cnkgeyBjb250cm9sbGVyLmNsb3NlKCk7IH0gY2F0Y2ggeyAvKiBhbHJlYWR5IGNsb3NlZCAqLyB9XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVN0cmVhbUNvbnRyb2xsZXJzLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9yZXNvdXJjZUxvYWRpbmdDdHMuZGlzcG9zZSh0cnVlKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHNldENvbnRleHRLZXlTZXJ2aWNlKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IGNvbnRleHRLZXlTZXJ2aWNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NaXNzaW5nQ3NwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXh0ZW5zaW9uSWRlbnRpZmllcj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1pc3NpbmdDc3AgPSB0aGlzLl9vbk1pc3NpbmdDc3AuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGlja0xpbmsgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDbGlja0xpbmsgPSB0aGlzLl9vbkRpZENsaWNrTGluay5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxXZWJ2aWV3TWVzc2FnZVJlY2VpdmVkRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25NZXNzYWdlID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBzY3JvbGxZUGVyY2VudGFnZTogbnVtYmVyIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRTY3JvbGwgPSB0aGlzLl9vbkRpZFNjcm9sbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFdoZWVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vdXNlV2hlZWxFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFdoZWVsID0gdGhpcy5fb25EaWRXaGVlbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkVXBkYXRlU3RhdGUgPSB0aGlzLl9vbkRpZFVwZGF0ZVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQmx1ciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRCbHVyID0gdGhpcy5fb25EaWRCbHVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRmF0YWxFcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25GYXRhbEVycm9yID0gdGhpcy5fb25GYXRhbEVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWREaXNwb3NlID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHB1YmxpYyBwb3N0TWVzc2FnZShtZXNzYWdlOiBhbnksIHRyYW5zZmVyPzogQXJyYXlCdWZmZXJbXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9zZW5kKCdtZXNzYWdlJywgeyBtZXNzYWdlLCB0cmFuc2ZlciB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmQ8SyBleHRlbmRzIGtleW9mIFRvV2Vidmlld01lc3NhZ2U+KGNoYW5uZWw6IEssIGRhdGE6IFRvV2Vidmlld01lc3NhZ2VbS10sIF9jcmVhdGVFbGVtZW50OiBUcmFuc2ZlcmFibGVbXSA9IFtdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLnR5cGUgPT09IFdlYnZpZXdTdGF0ZS5UeXBlLkluaXRpYWxpemluZykge1xuXHRcdFx0Y29uc3QgeyBwcm9taXNlLCByZXNvbHZlIH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczxib29sZWFuPigpO1xuXHRcdFx0dGhpcy5fc3RhdGUucGVuZGluZ01lc3NhZ2VzLnB1c2goeyBjaGFubmVsLCBkYXRhLCB0cmFuc2ZlcmFibGU6IF9jcmVhdGVFbGVtZW50LCByZXNvbHZlIH0pO1xuXHRcdFx0cmV0dXJuIHByb21pc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmRvUG9zdE1lc3NhZ2UoY2hhbm5lbCwgZGF0YSwgX2NyZWF0ZUVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUVsZW1lbnQob3B0aW9uczogV2Vidmlld09wdGlvbnMsIF9jb250ZW50T3B0aW9uczogV2Vidmlld0NvbnRlbnRPcHRpb25zKSB7XG5cdFx0Ly8gRG8gbm90IHN0YXJ0IGxvYWRpbmcgdGhlIHdlYnZpZXcgeWV0LlxuXHRcdC8vIFdhaXQgdGhlIGVuZCBvZiB0aGUgY3RvciB3aGVuIGFsbCBsaXN0ZW5lcnMgaGF2ZSBiZWVuIGhvb2tlZCB1cC5cblx0XHRjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJyk7XG5cdFx0ZWxlbWVudC5uYW1lID0gdGhpcy5pZDtcblx0XHRlbGVtZW50LmNsYXNzTmFtZSA9IGB3ZWJ2aWV3ICR7b3B0aW9ucy5jdXN0b21DbGFzc2VzIHx8ICcnfWA7XG5cdFx0ZWxlbWVudC5zYW5kYm94LmFkZCgnYWxsb3ctc2NyaXB0cycsICdhbGxvdy1zYW1lLW9yaWdpbicsICdhbGxvdy1mb3JtcycsICdhbGxvdy1wb2ludGVyLWxvY2snLCAnYWxsb3ctZG93bmxvYWRzJyk7XG5cblx0XHRjb25zdCBhbGxvd1J1bGVzID0gWydjcm9zcy1vcmlnaW4taXNvbGF0ZWQnLCAnYXV0b3BsYXknLCAnbG9jYWwtbmV0d29yay1hY2Nlc3MnXTtcblx0XHRpZiAoIWlzRmlyZWZveCkge1xuXHRcdFx0YWxsb3dSdWxlcy5wdXNoKCdjbGlwYm9hcmQtcmVhZCcsICdjbGlwYm9hcmQtd3JpdGUnKTtcblx0XHR9XG5cdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FsbG93JywgYWxsb3dSdWxlcy5qb2luKCc7ICcpKTtcblxuXHRcdGVsZW1lbnQuc3R5bGUuYm9yZGVyID0gJ25vbmUnO1xuXHRcdGVsZW1lbnQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0ZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cblx0XHRlbGVtZW50LmZvY3VzID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fZG9Gb2N1cygpO1xuXHRcdH07XG5cblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRFbGVtZW50KGVuY29kZWRXZWJ2aWV3T3JpZ2luOiBzdHJpbmcsIGV4dGVuc2lvbjogV2Vidmlld0V4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBXZWJ2aWV3T3B0aW9ucywgdGFyZ2V0V2luZG93OiBDb2RlV2luZG93KSB7XG5cdFx0Ly8gVGhlIGV4dGVuc2lvbklkIGFuZCBwdXJwb3NlIGluIHRoZSBVUkwgYXJlIHVzZWQgZm9yIGZpbHRlcmluZyBpbiBqcy1kZWJ1Zzpcblx0XHRjb25zdCBwYXJhbXM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG5cdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdHBhcmVudElkOiB0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQudG9TdHJpbmcoKSxcblx0XHRcdG9yaWdpbjogdGhpcy5vcmlnaW4sXG5cdFx0XHRzd1ZlcnNpb246IFN0cmluZyh0aGlzLl9leHBlY3RlZFNlcnZpY2VXb3JrZXJWZXJzaW9uKSxcblx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24/LmlkLnZhbHVlID8/ICcnLFxuXHRcdFx0cGxhdGZvcm06IHRoaXMucGxhdGZvcm0sXG5cdFx0XHQndnNjb2RlLXJlc291cmNlLWJhc2UtYXV0aG9yaXR5Jzogd2Vidmlld1Jvb3RSZXNvdXJjZUF1dGhvcml0eSxcblx0XHRcdHBhcmVudE9yaWdpbjogdGFyZ2V0V2luZG93Lm9yaWdpbixcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuZGlzYWJsZVNlcnZpY2VXb3JrZXIpIHtcblx0XHRcdHBhcmFtcy5kaXNhYmxlU2VydmljZVdvcmtlciA9ICd0cnVlJztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cGFyYW1zLnJlbW90ZUF1dGhvcml0eSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMucHVycG9zZSkge1xuXHRcdFx0cGFyYW1zLnB1cnBvc2UgPSBvcHRpb25zLnB1cnBvc2U7XG5cdFx0fVxuXG5cdFx0Q09JLmFkZFNlYXJjaFBhcmFtKHBhcmFtcywgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBxdWVyeVN0cmluZyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMocGFyYW1zKS50b1N0cmluZygpO1xuXG5cdFx0dGhpcy5wZXJmTWFyaygnaW5pdC9zZXQtc3JjJyk7XG5cdFx0Y29uc3QgZmlsZU5hbWUgPSAnaW5kZXguaHRtbCc7XG5cdFx0dGhpcy5lbGVtZW50IS5zZXRBdHRyaWJ1dGUoJ3NyYycsIGAke3RoaXMud2Vidmlld0NvbnRlbnRFbmRwb2ludChlbmNvZGVkV2Vidmlld09yaWdpbil9LyR7ZmlsZU5hbWV9PyR7cXVlcnlTdHJpbmd9YCk7XG5cdH1cblxuXHRwdWJsaWMgbW91bnRUbyhlbGVtZW50OiBIVE1MRWxlbWVudCwgdGFyZ2V0V2luZG93OiBDb2RlV2luZG93KSB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl93aW5kb3dJZCA9IHRhcmdldFdpbmRvdy52c2NvZGVXaW5kb3dJZDtcblx0XHR0aGlzLl9lbmNvZGVkV2Vidmlld09yaWdpblByb21pc2UgPSBwYXJlbnRPcmlnaW5IYXNoKHRhcmdldFdpbmRvdy5vcmlnaW4sIHRoaXMub3JpZ2luKS50aGVuKGlkID0+IHRoaXMuX2VuY29kZWRXZWJ2aWV3T3JpZ2luID0gaWQpO1xuXHRcdHRoaXMuX2VuY29kZWRXZWJ2aWV3T3JpZ2luUHJvbWlzZS50aGVuKGVuY29kZWRXZWJ2aWV3T3JpZ2luID0+IHtcblx0XHRcdGlmICghdGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdFx0dGhpcy5faW5pdEVsZW1lbnQoZW5jb2RlZFdlYnZpZXdPcmlnaW4sIHRoaXMuZXh0ZW5zaW9uLCB0aGlzLl9vcHRpb25zLCB0YXJnZXRXaW5kb3cpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyTWVzc2FnZUhhbmRsZXIodGFyZ2V0V2luZG93KTtcblxuXHRcdGlmICh0aGlzLl93ZWJ2aWV3RmluZFdpZGdldCkge1xuXHRcdFx0ZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl93ZWJ2aWV3RmluZFdpZGdldC5nZXREb21Ob2RlKCkpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZXZlbnROYW1lIG9mIFtFdmVudFR5cGUuTU9VU0VfRE9XTiwgRXZlbnRUeXBlLk1PVVNFX01PVkUsIEV2ZW50VHlwZS5EUk9QXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGV2ZW50TmFtZSwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zdG9wQmxvY2tpbmdJZnJhbWVEcmFnRXZlbnRzKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIFtlbGVtZW50LCB0YXJnZXRXaW5kb3ddKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIobm9kZSwgRXZlbnRUeXBlLkRSQUdfRU5ELCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3N0b3BCbG9ja2luZ0lmcmFtZURyYWdFdmVudHMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRlbGVtZW50LmlkID0gdGhpcy5pZDsgLy8gVGhpcyBpcyB1c2VkIGJ5IGFyaWEtZmxvdyBmb3IgYWNjZXNzaWJpbGl0eSBvcmRlclxuXG5cdFx0dGhpcy5wZXJmTWFyaygnbW91bnRlZCcpO1xuXHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTWVzc2FnZUhhbmRsZXIodGFyZ2V0V2luZG93OiBDb2RlV2luZG93KSB7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gdGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgJ21lc3NhZ2UnLCAoZTogTWVzc2FnZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2VuY29kZWRXZWJ2aWV3T3JpZ2luIHx8IGU/LmRhdGE/LnRhcmdldCAhPT0gdGhpcy5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLm9yaWdpbiAhPT0gdGhpcy5fd2Vidmlld0NvbnRlbnRPcmlnaW4odGhpcy5fZW5jb2RlZFdlYnZpZXdPcmlnaW4pKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBTa2lwcGVkIHJlbmRlcmVyIHJlY2VpdmluZyBtZXNzYWdlIGR1ZSB0byBtaXNtYXRjaGVkIG9yaWdpbnM6ICR7ZS5vcmlnaW59ICR7dGhpcy5fd2Vidmlld0NvbnRlbnRPcmlnaW59YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuZGF0YS5jaGFubmVsID09PSAnd2Vidmlldy1yZWFkeScpIHtcblx0XHRcdFx0aWYgKHRoaXMuX21lc3NhZ2VQb3J0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5wZXJmTWFyaygnd2Vidmlldy1yZWFkeScpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBXZWJ2aWV3KCR7dGhpcy5pZH0pOiB3ZWJ2aWV3IHJlYWR5YCk7XG5cblx0XHRcdFx0dGhpcy5fbWVzc2FnZVBvcnQgPSBlLnBvcnRzWzBdO1xuXHRcdFx0XHR0aGlzLl9tZXNzYWdlUG9ydC5vbm1lc3NhZ2UgPSAoZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGhhbmRsZXJzID0gdGhpcy5fbWVzc2FnZUhhbmRsZXJzLmdldChlLmRhdGEuY2hhbm5lbCk7XG5cdFx0XHRcdFx0aWYgKCFoYW5kbGVycykge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYE5vIGhhbmRsZXJzIGZvdW5kIGZvciAnJHtlLmRhdGEuY2hhbm5lbH0nYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGhhbmRsZXJzPy5mb3JFYWNoKGhhbmRsZXIgPT4gaGFuZGxlcihlLmRhdGEuZGF0YSwgZSkpO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LmFkZCgncmVhZHknKTtcblxuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUudHlwZSA9PT0gV2Vidmlld1N0YXRlLlR5cGUuSW5pdGlhbGl6aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUucGVuZGluZ01lc3NhZ2VzLmZvckVhY2goKHsgY2hhbm5lbCwgZGF0YSwgcmVzb2x2ZSB9KSA9PiByZXNvbHZlKHRoaXMuZG9Qb3N0TWVzc2FnZShjaGFubmVsLCBkYXRhKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gV2Vidmlld1N0YXRlLlJlYWR5O1xuXG5cdFx0XHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBwZXJmTWFyayhuYW1lOiBzdHJpbmcpIHtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKGB3ZWJ2aWV3L3dlYnZpZXdFbGVtZW50LyR7bmFtZX1gLCB7XG5cdFx0XHRkZXRhaWw6IHtcblx0XHRcdFx0aWQ6IHRoaXMuaWRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0QmxvY2tpbmdJZnJhbWVEcmFnRXZlbnRzKCkge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0b3BCbG9ja2luZ0lmcmFtZURyYWdFdmVudHMoKSB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnYXV0byc7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHdlYnZpZXdDb250ZW50RW5kcG9pbnQoZW5jb2RlZFdlYnZpZXdPcmlnaW46IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgd2Vidmlld0V4dGVybmFsRW5kcG9pbnQgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2Uud2Vidmlld0V4dGVybmFsRW5kcG9pbnQ7XG5cdFx0aWYgKCF3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGAnd2Vidmlld0V4dGVybmFsRW5kcG9pbnQnIGhhcyBub3QgYmVlbiBjb25maWd1cmVkLiBXZWJ2aWV3cyB3aWxsIG5vdCB3b3JrIWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuZHBvaW50ID0gd2Vidmlld0V4dGVybmFsRW5kcG9pbnQucmVwbGFjZSgne3t1dWlkfX0nLCBlbmNvZGVkV2Vidmlld09yaWdpbik7XG5cdFx0aWYgKGVuZHBvaW50W2VuZHBvaW50Lmxlbmd0aCAtIDFdID09PSAnLycpIHtcblx0XHRcdHJldHVybiBlbmRwb2ludC5zbGljZSgwLCBlbmRwb2ludC5sZW5ndGggLSAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVuZHBvaW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfd2Vidmlld0NvbnRlbnRPcmlnaW4oZW5jb2RlZFdlYnZpZXdPcmlnaW46IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHRoaXMud2Vidmlld0NvbnRlbnRFbmRwb2ludChlbmNvZGVkV2Vidmlld09yaWdpbikpO1xuXHRcdHJldHVybiB1cmkuc2NoZW1lICsgJzovLycgKyB1cmkuYXV0aG9yaXR5LnRvTG93ZXJDYXNlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvUG9zdE1lc3NhZ2UoY2hhbm5lbDogc3RyaW5nLCBkYXRhPzogYW55LCB0cmFuc2ZlcmFibGU6IFRyYW5zZmVyYWJsZVtdID0gW10pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5lbGVtZW50ICYmIHRoaXMuX21lc3NhZ2VQb3J0KSB7XG5cdFx0XHR0aGlzLl9tZXNzYWdlUG9ydC5wb3N0TWVzc2FnZSh7IGNoYW5uZWwsIGFyZ3M6IGRhdGEgfSwgdHJhbnNmZXJhYmxlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIG9uPEsgZXh0ZW5kcyBrZXlvZiBGcm9tV2Vidmlld01lc3NhZ2U+KGNoYW5uZWw6IEssIGhhbmRsZXI6IChkYXRhOiBGcm9tV2Vidmlld01lc3NhZ2VbS10sIGU6IE1lc3NhZ2VFdmVudCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRsZXQgaGFuZGxlcnMgPSB0aGlzLl9tZXNzYWdlSGFuZGxlcnMuZ2V0KGNoYW5uZWwpO1xuXHRcdGlmICghaGFuZGxlcnMpIHtcblx0XHRcdGhhbmRsZXJzID0gbmV3IFNldCgpO1xuXHRcdFx0dGhpcy5fbWVzc2FnZUhhbmRsZXJzLnNldChjaGFubmVsLCBoYW5kbGVycyk7XG5cdFx0fVxuXG5cdFx0aGFuZGxlcnMuYWRkKGhhbmRsZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbWVzc2FnZUhhbmRsZXJzLmdldChjaGFubmVsKT8uZGVsZXRlKGhhbmRsZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzQWxlcnRlZEFib3V0TWlzc2luZ0NzcCA9IGZhbHNlO1xuXHRwcml2YXRlIGhhbmRsZU5vQ3NwRm91bmQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hhc0FsZXJ0ZWRBYm91dE1pc3NpbmdDc3ApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGFzQWxlcnRlZEFib3V0TWlzc2luZ0NzcCA9IHRydWU7XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24/LmlkKSB7XG5cdFx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0dGhpcy5fb25NaXNzaW5nQ3NwLmZpcmUodGhpcy5leHRlbnNpb24uaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWxvYWQoKTogdm9pZCB7XG5cdFx0dGhpcy5kb1VwZGF0ZUNvbnRlbnQodGhpcy5fY29udGVudCk7XG5cdH1cblxuXHRwdWJsaWMgcmVpbml0aWFsaXplQWZ0ZXJEaXNtb3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZSA9IG5ldyBXZWJ2aWV3U3RhdGUuSW5pdGlhbGl6aW5nKFtdKTtcblx0XHR0aGlzLl9tZXNzYWdlUG9ydCA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMubW91bnRUbyh0aGlzLmVsZW1lbnQhLnBhcmVudEVsZW1lbnQhLCBnZXRXaW5kb3codGhpcy5lbGVtZW50KSk7XG5cdFx0dGhpcy5zdHlsZSgpO1xuXHRcdHRoaXMucmVsb2FkKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0SHRtbChodG1sOiBzdHJpbmcpIHtcblx0XHR0aGlzLmRvVXBkYXRlQ29udGVudCh7IC4uLnRoaXMuX2NvbnRlbnQsIGh0bWwgfSk7XG5cdFx0dGhpcy5fb25EaWRIdG1sQ2hhbmdlLmZpcmUoaHRtbCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VGl0bGUodGl0bGU6IHN0cmluZykge1xuXHRcdHRoaXMuX2NvbnRlbnQgPSB7IC4uLnRoaXMuX2NvbnRlbnQsIHRpdGxlIH07XG5cdFx0dGhpcy5fc2VuZCgnc2V0LXRpdGxlJywgdGl0bGUpO1xuXHR9XG5cblx0cHVibGljIHNldCBjb250ZW50T3B0aW9ucyhvcHRpb25zOiBXZWJ2aWV3Q29udGVudE9wdGlvbnMpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBXZWJ2aWV3KCR7dGhpcy5pZH0pOiB3aWxsIHVwZGF0ZSBjb250ZW50IG9wdGlvbnNgKTtcblxuXHRcdGlmIChhcmVXZWJ2aWV3Q29udGVudE9wdGlvbnNFcXVhbChvcHRpb25zLCB0aGlzLl9jb250ZW50Lm9wdGlvbnMpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBXZWJ2aWV3KCR7dGhpcy5pZH0pOiBza2lwcGluZyBjb250ZW50IG9wdGlvbnMgdXBkYXRlYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kb1VwZGF0ZUNvbnRlbnQoeyAuLi50aGlzLl9jb250ZW50LCBvcHRpb25zIH0pO1xuXHR9XG5cblx0cHVibGljIHNldCBsb2NhbFJlc291cmNlc1Jvb3QocmVzb3VyY2VzOiByZWFkb25seSBVUklbXSkge1xuXHRcdHRoaXMuX2NvbnRlbnQgPSB7XG5cdFx0XHQuLi50aGlzLl9jb250ZW50LFxuXHRcdFx0b3B0aW9uczogeyAuLi50aGlzLl9jb250ZW50Lm9wdGlvbnMsIGxvY2FsUmVzb3VyY2VSb290czogcmVzb3VyY2VzIH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHNldCBzdGF0ZShzdGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY29udGVudCA9IHsgLi4udGhpcy5fY29udGVudCwgc3RhdGUgfTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgaW5pdGlhbFNjcm9sbFByb2dyZXNzKHZhbHVlOiBudW1iZXIpIHtcblx0XHR0aGlzLl9zZW5kKCdpbml0aWFsLXNjcm9sbC1wb3NpdGlvbicsIHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVDb250ZW50KG5ld0NvbnRlbnQ6IFdlYnZpZXdDb250ZW50KSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgV2Vidmlldygke3RoaXMuaWR9KTogd2lsbCB1cGRhdGUgY29udGVudGApO1xuXG5cdFx0dGhpcy5fY29udGVudCA9IG5ld0NvbnRlbnQ7XG5cblx0XHRjb25zdCBhbGxvd1NjcmlwdHMgPSAhIXRoaXMuX2NvbnRlbnQub3B0aW9ucy5hbGxvd1NjcmlwdHM7XG5cdFx0dGhpcy5wZXJmTWFyaygnc2V0LWNvbnRlbnQnKTtcblx0XHR0aGlzLl9zZW5kKCdjb250ZW50Jywge1xuXHRcdFx0Y29udGVudHM6IHRoaXMuX2NvbnRlbnQuaHRtbCxcblx0XHRcdHRpdGxlOiB0aGlzLl9jb250ZW50LnRpdGxlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRhbGxvd011bHRpcGxlQVBJQWNxdWlyZTogISF0aGlzLl9jb250ZW50Lm9wdGlvbnMuYWxsb3dNdWx0aXBsZUFQSUFjcXVpcmUsXG5cdFx0XHRcdGFsbG93U2NyaXB0czogYWxsb3dTY3JpcHRzLFxuXHRcdFx0XHRhbGxvd0Zvcm1zOiB0aGlzLl9jb250ZW50Lm9wdGlvbnMuYWxsb3dGb3JtcyA/PyBhbGxvd1NjcmlwdHMsIC8vIEZvciBiYWNrIGNvbXBhdCwgd2UgYWxsb3cgZm9ybXMgYnkgZGVmYXVsdCB3aGVuIHNjcmlwdHMgYXJlIGVuYWJsZWRcblx0XHRcdH0sXG5cdFx0XHRzdGF0ZTogdGhpcy5fY29udGVudC5zdGF0ZSxcblx0XHRcdGNzcFNvdXJjZTogd2Vidmlld0dlbmVyaWNDc3BTb3VyY2UsXG5cdFx0XHRjb25maXJtQmVmb3JlQ2xvc2U6IHRoaXMuX2NvbmZpcm1CZWZvcmVDbG9zZSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBzdHlsZSgpOiB2b2lkIHtcblx0XHRsZXQgeyBzdHlsZXMsIGFjdGl2ZVRoZW1lLCB0aGVtZUxhYmVsLCB0aGVtZUlkIH0gPSB0aGlzLndlYnZpZXdUaGVtZURhdGFQcm92aWRlci5nZXRXZWJ2aWV3VGhlbWVEYXRhKCk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudHJhbnNmb3JtQ3NzVmFyaWFibGVzKSB7XG5cdFx0XHRzdHlsZXMgPSB0aGlzLl9vcHRpb25zLnRyYW5zZm9ybUNzc1ZhcmlhYmxlcyhzdHlsZXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZHVjZU1vdGlvbiA9IHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpO1xuXHRcdGNvbnN0IHNjcmVlblJlYWRlciA9IHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk7XG5cblx0XHR0aGlzLl9zZW5kKCdzdHlsZXMnLCB7IHN0eWxlcywgYWN0aXZlVGhlbWUsIHRoZW1lSWQsIHRoZW1lTGFiZWwsIHJlZHVjZU1vdGlvbiwgc2NyZWVuUmVhZGVyIH0pO1xuXHR9XG5cblxuXHRwcm90ZWN0ZWQgaGFuZGxlRm9jdXNDaGFuZ2UoaXNGb2N1c2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZm9jdXNlZCA9IGlzRm9jdXNlZDtcblx0XHRpZiAoaXNGb2N1c2VkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb25EaWRCbHVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZEZvcndhcmRLZXlFdmVudChldmVudDogS2V5RXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZXZlbnQuaXNUcnVzdGVkIHx8ICEhdGhpcy5fY29udGVudC5vcHRpb25zLmZvcndhcmRVbnRydXN0ZWRLZXlwcmVzc0V2ZW50cztcblx0fVxuXG5cdHByaXZhdGUgaXNBY3RpdmVFbGVtZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZWxlbWVudCAmJiB0aGlzLndpbmRvdz8uZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5lbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVLZXlFdmVudCh0eXBlOiAna2V5ZG93bicgfCAna2V5dXAnLCBldmVudDogS2V5RXZlbnQpIHtcblx0XHRpZiAoIXRoaXMuc2hvdWxkRm9yd2FyZEtleUV2ZW50KGV2ZW50KSB8fCAhdGhpcy5pc0FjdGl2ZUVsZW1lbnQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEVsZWN0cm9uOiB3b3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzE0MjU4XG5cdFx0Ly8gV2UgaGF2ZSB0byBkZXRlY3Qga2V5Ym9hcmQgZXZlbnRzIGluIHRoZSA8d2Vidmlldz4gYW5kIGRpc3BhdGNoIHRoZW0gdG8gb3VyXG5cdFx0Ly8ga2V5YmluZGluZyBzZXJ2aWNlIGJlY2F1c2UgdGhlc2UgZXZlbnRzIGRvIG5vdCBidWJibGUgdG8gdGhlIHBhcmVudCB3aW5kb3cgYW55bW9yZS5cblx0XHQvLyBDcmVhdGUgYSBmYWtlIEtleWJvYXJkRXZlbnQgZnJvbSB0aGUgZGF0YSBwcm92aWRlZFxuXHRcdGNvbnN0IGVtdWxhdGVkS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KHR5cGUsIGV2ZW50KTtcblx0XHQvLyBGb3JjZSBvdmVycmlkZSB0aGUgdGFyZ2V0XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVtdWxhdGVkS2V5Ym9hcmRFdmVudCwgJ3RhcmdldCcsIHtcblx0XHRcdGdldDogKCkgPT4gdGhpcy5lbGVtZW50LFxuXHRcdH0pO1xuXHRcdC8vIEFuZCByZS1kaXNwYXRjaFxuXHRcdHRoaXMud2luZG93Py5kaXNwYXRjaEV2ZW50KGVtdWxhdGVkS2V5Ym9hcmRFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZURyYWdFdmVudCh0eXBlOiAnZHJhZycsIGV2ZW50OiBXZWJWaWV3RHJhZ0V2ZW50KSB7XG5cdFx0Ly8gQ3JlYXRlIGEgZmFrZSBEcmFnRXZlbnQgZnJvbSB0aGUgZGF0YSBwcm92aWRlZFxuXHRcdGNvbnN0IGVtdWxhdGVkRHJhZ0V2ZW50ID0gbmV3IERyYWdFdmVudCh0eXBlLCBldmVudCk7XG5cdFx0Ly8gRm9yY2Ugb3ZlcnJpZGUgdGhlIHRhcmdldFxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlbXVsYXRlZERyYWdFdmVudCwgJ3RhcmdldCcsIHtcblx0XHRcdGdldDogKCkgPT4gdGhpcy5lbGVtZW50LFxuXHRcdH0pO1xuXHRcdC8vIEFuZCByZS1kaXNwYXRjaFxuXHRcdHRoaXMud2luZG93Py5kaXNwYXRjaEV2ZW50KGVtdWxhdGVkRHJhZ0V2ZW50KTtcblx0fVxuXG5cdHdpbmRvd0RpZERyYWdTdGFydCgpOiB2b2lkIHtcblx0XHQvLyBXZWJ2aWV3IGJyZWFrIGRyYWcgYW5kIGRyb3BwaW5nIGFyb3VuZCB0aGUgbWFpbiB3aW5kb3cgKG5vIGV2ZW50cyBhcmUgZ2VuZXJhdGVkIHdoZW4geW91IGFyZSBvdmVyIHRoZW0pXG5cdFx0Ly8gV29yayBhcm91bmQgdGhpcyBieSBkaXNhYmxpbmcgcG9pbnRlciBldmVudHMgZHVyaW5nIHRoZSBkcmFnLlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMTgyMjZcblx0XHR0aGlzLl9zdGFydEJsb2NraW5nSWZyYW1lRHJhZ0V2ZW50cygpO1xuXHR9XG5cblx0d2luZG93RGlkRHJhZ0VuZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9wQmxvY2tpbmdJZnJhbWVEcmFnRXZlbnRzKCk7XG5cdH1cblxuXHRwdWJsaWMgc2VsZWN0QWxsKCkge1xuXHRcdHRoaXMuZXhlY0NvbW1hbmQoJ3NlbGVjdEFsbCcpO1xuXHR9XG5cblx0cHVibGljIGNvcHkoKSB7XG5cdFx0dGhpcy5leGVjQ29tbWFuZCgnY29weScpO1xuXHR9XG5cblx0cHVibGljIHBhc3RlKCkge1xuXHRcdHRoaXMuZXhlY0NvbW1hbmQoJ3Bhc3RlJyk7XG5cdH1cblxuXHRwdWJsaWMgY3V0KCkge1xuXHRcdHRoaXMuZXhlY0NvbW1hbmQoJ2N1dCcpO1xuXHR9XG5cblx0cHVibGljIHVuZG8oKSB7XG5cdFx0dGhpcy5leGVjQ29tbWFuZCgndW5kbycpO1xuXHR9XG5cblx0cHVibGljIHJlZG8oKSB7XG5cdFx0dGhpcy5leGVjQ29tbWFuZCgncmVkbycpO1xuXHR9XG5cblx0cHJpdmF0ZSBleGVjQ29tbWFuZChjb21tYW5kOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9zZW5kKCdleGVjQ29tbWFuZCcsIGNvbW1hbmQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZFJlc291cmNlKGlkOiBudW1iZXIsIHVyaTogVVJJLCBvcHRpb25zOiB7IGlmTm9uZU1hdGNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHJhbmdlPzogeyByZWFkb25seSBzdGFydDogbnVtYmVyOyByZWFkb25seSBlbmQ/OiBudW1iZXIgfSB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24obG9hZExvY2FsUmVzb3VyY2UsIHVyaSwge1xuXHRcdFx0XHRpZk5vbmVNYXRjaDogb3B0aW9ucy5pZk5vbmVNYXRjaCxcblx0XHRcdFx0cm9vdHM6IHRoaXMuX2NvbnRlbnQub3B0aW9ucy5sb2NhbFJlc291cmNlUm9vdHMgfHwgW10sXG5cdFx0XHRcdHJhbmdlOiBvcHRpb25zLnJhbmdlLFxuXHRcdFx0fSwgdG9rZW4pO1xuXG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzd2l0Y2ggKHJlc3VsdC50eXBlKSB7XG5cdFx0XHRcdGNhc2UgV2Vidmlld1Jlc291cmNlUmVzcG9uc2UuVHlwZS5TdWNjZXNzOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBvcHRpb25zLnJhbmdlO1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RlZFJhbmdlRW5kID0gcmFuZ2U/LmVuZCAhPT0gdW5kZWZpbmVkID8gcmFuZ2UuZW5kIDogcmVzdWx0LnNpemUgLSAxO1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlRW5kID0gTWF0aC5taW4ocmVxdWVzdGVkUmFuZ2VFbmQsIHJlc3VsdC5zaXplIC0gMSk7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2VIZWFkZXIgPSByYW5nZVxuXHRcdFx0XHRcdFx0PyBgYnl0ZXMgJHtyYW5nZS5zdGFydH0tJHtyYW5nZUVuZH0vJHtyZXN1bHQuc2l6ZX1gXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoV2Vidmlld0VsZW1lbnQuX3N1cHBvcnRzVHJhbnNmZXJhYmxlU3RyZWFtcy52YWx1ZSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RyZWFtQ3RzID0gdGhpcy5wbGF0Zm9ybSA9PT0gJ2VsZWN0cm9uJyA/IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbikgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRsZXQgY29udHJvbGxlcjogUmVhZGFibGVTdHJlYW1EZWZhdWx0Q29udHJvbGxlcjxVaW50OEFycmF5PEFycmF5QnVmZmVyPj4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRsZXQgY2xvc2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRjb25zdCBjbG9zZSA9ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKCFjbG9zZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRjbG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdHN0cmVhbUN0cz8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTdHJlYW1Db250cm9sbGVycy5kZWxldGUoY29udHJvbGxlcik7XG5cdFx0XHRcdFx0XHRcdFx0XHR0cnkgeyBjb250cm9sbGVyLmNsb3NlKCk7IH0gY2F0Y2ggeyAvKiBhbHJlYWR5IGNsb3NlZCAqLyB9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RyZWFtID0gbmV3IFJlYWRhYmxlU3RyZWFtPFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+Pih7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0OiAobmV3Q29udHJvbGxlcikgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFRyYWNrIHRoaXMgY29udHJvbGxlciBzbyB0aGF0IHRoZSBzaW5nbGVcblx0XHRcdFx0XHRcdFx0XHQvLyBjYW5jZWxsYXRpb24gaGFuZGxlciBpbiBkaXNwb3NlKCkgY2FuIGNsb3NlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gYWxsIGFjdGl2ZSBzdHJlYW1zIHdpdGhvdXQgcGVyLXN0cmVhbSBsaXN0ZW5lcnMuXG5cdFx0XHRcdFx0XHRcdFx0Y29udHJvbGxlciA9IG5ld0NvbnRyb2xsZXI7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fYWN0aXZlU3RyZWFtQ29udHJvbGxlcnMuYWRkKGNvbnRyb2xsZXIpO1xuXG5cdFx0XHRcdFx0XHRcdFx0bGlzdGVuU3RyZWFtKHJlc3VsdC5zdHJlYW0sIHtcblx0XHRcdFx0XHRcdFx0XHRcdG9uRGF0YTogKGNodW5rKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICghY2xvc2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRyb2xsZXI/LmVucXVldWUobmV3IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+KGNodW5rLmJ1ZmZlci5idWZmZXIgYXMgQXJyYXlCdWZmZXIsIGNodW5rLmJ1ZmZlci5ieXRlT2Zmc2V0LCBjaHVuay5idWZmZXIuYnl0ZUxlbmd0aCkpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y2xvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRvbkVycm9yOiAoZXJyKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICghY2xvc2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y2xvc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRzdHJlYW1DdHM/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50Q29udHJvbGxlciA9IGNvbnRyb2xsZXI7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRDb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTdHJlYW1Db250cm9sbGVycy5kZWxldGUoY3VycmVudENvbnRyb2xsZXIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHJ5IHsgY3VycmVudENvbnRyb2xsZXIuZXJyb3IoZXJyKTsgfSBjYXRjaCB7IC8qIGFscmVhZHkgY2xvc2VkICovIH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRvbkVuZDogKCkgPT4gY2xvc2UoKVxuXHRcdFx0XHRcdFx0XHRcdH0sIHN0cmVhbUN0cz8udG9rZW4gPz8gdG9rZW4pO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRjYW5jZWw6IHN0cmVhbUN0cyA/ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRzdHJlYW1DdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQuc3RyZWFtLmRlc3Ryb3koKTtcblx0XHRcdFx0XHRcdFx0XHRjbG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZW5kKCdkaWQtbG9hZC1yZXNvdXJjZScsIHtcblx0XHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRcdHN0YXR1czogcmFuZ2UgPyAyMDYgOiAyMDAsXG5cdFx0XHRcdFx0XHRcdHBhdGg6IHVyaS5wYXRoLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiByZXN1bHQubWltZVR5cGUsXG5cdFx0XHRcdFx0XHRcdGV0YWc6IHJlc3VsdC5ldGFnLFxuXHRcdFx0XHRcdFx0XHRtdGltZTogcmVzdWx0Lm10aW1lLFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogcmFuZ2VIZWFkZXIsXG5cdFx0XHRcdFx0XHRcdHN0cmVhbSxcblx0XHRcdFx0XHRcdH0sIFtzdHJlYW1dKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gU2FmYXJpOiB0cmFuc2ZlcmFibGUgc3RyZWFtcyBub3Qgc3VwcG9ydGVkLCBmYWxsIGJhY2sgdG8gY2h1bmsgbWVzc2FnZXNcblx0XHRcdFx0XHRcdHRoaXMuX3NlbmQoJ2RpZC1sb2FkLXJlc291cmNlJywge1xuXHRcdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiByYW5nZSA/IDIwNiA6IDIwMCxcblx0XHRcdFx0XHRcdFx0cGF0aDogdXJpLnBhdGgsXG5cdFx0XHRcdFx0XHRcdG1pbWU6IHJlc3VsdC5taW1lVHlwZSxcblx0XHRcdFx0XHRcdFx0ZXRhZzogcmVzdWx0LmV0YWcsXG5cdFx0XHRcdFx0XHRcdG10aW1lOiByZXN1bHQubXRpbWUsXG5cdFx0XHRcdFx0XHRcdHJhbmdlOiByYW5nZUhlYWRlcixcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0bGlzdGVuU3RyZWFtKHJlc3VsdC5zdHJlYW0sIHtcblx0XHRcdFx0XHRcdFx0b25EYXRhOiAoY2h1bmspID0+IHtcblx0XHRcdFx0XHRcdFx0XHQvLyBDb3B5IGludG8gYSBmcmVzaGx5LW93bmVkIEFycmF5QnVmZmVyIGJlZm9yZSB0cmFuc2ZlcnJpbmcuIGBjaHVua2Bcblx0XHRcdFx0XHRcdFx0XHQvLyBtYXkgYmUgYSB2aWV3IGludG8gYSBsYXJnZXIsIHNoYXJlZCBBcnJheUJ1ZmZlciAoZS5nLiBmcm9tIHRoZSBJUENcblx0XHRcdFx0XHRcdFx0XHQvLyBkZXNlcmlhbGl6ZSBwaXBlbGluZSk7IHRyYW5zZmVycmluZyBpdHMgdW5kZXJseWluZyBBcnJheUJ1ZmZlciB3b3VsZFxuXHRcdFx0XHRcdFx0XHRcdC8vIGRldGFjaCBldmVyeSBzaWJsaW5nIHZpZXcuIFdlYktpdCBkZXRhY2hlcyBzeW5jaHJvbm91c2x5LCB3aGljaFxuXHRcdFx0XHRcdFx0XHRcdC8vIHByZXZpb3VzbHkgYnJva2Ugd2VidmlldyByZXNvdXJjZSBsb2FkaW5nIGluIFNhZmFyaS5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBkYXRhID0gY2h1bmsuYnVmZmVyLnNsaWNlKCk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UtY2h1bmsnLCB7IGlkLCBkYXRhIH0sIFtkYXRhLmJ1ZmZlcl0pO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvbkVycm9yOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UtZW5kJywgeyBpZCwgZXJyb3I6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdG9uRW5kOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UtZW5kJywgeyBpZCB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSwgdG9rZW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBXZWJ2aWV3UmVzb3VyY2VSZXNwb25zZS5UeXBlLk5vdE1vZGlmaWVkOiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3NlbmQoJ2RpZC1sb2FkLXJlc291cmNlJywge1xuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IDMwNCwgLy8gbm90IG1vZGlmaWVkXG5cdFx0XHRcdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHRcdFx0XHRcdG1pbWU6IHJlc3VsdC5taW1lVHlwZSxcblx0XHRcdFx0XHRcdG10aW1lOiByZXN1bHQubXRpbWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFdlYnZpZXdSZXNvdXJjZVJlc3BvbnNlLlR5cGUuQWNjZXNzRGVuaWVkOiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3NlbmQoJ2RpZC1sb2FkLXJlc291cmNlJywge1xuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IDQwMSwgLy8gdW5hdXRob3JpemVkXG5cdFx0XHRcdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zZW5kKCdkaWQtbG9hZC1yZXNvdXJjZScsIHtcblx0XHRcdGlkLFxuXHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9jYWxMb2NhbGhvc3QoaWQ6IHN0cmluZywgb3JpZ2luOiBzdHJpbmcpIHtcblx0XHRjb25zdCBhdXRob3JpdHkgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGNvbnN0IHJlc29sdmVBdXRob3JpdHkgPSBhdXRob3JpdHkgPyBhd2FpdCB0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUF1dGhvcml0eShhdXRob3JpdHkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlZGlyZWN0ID0gcmVzb2x2ZUF1dGhvcml0eSA/IGF3YWl0IHRoaXMuX3BvcnRNYXBwaW5nTWFuYWdlci5nZXRSZWRpcmVjdChyZXNvbHZlQXV0aG9yaXR5LmF1dGhvcml0eSwgb3JpZ2luKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZCgnZGlkLWxvYWQtbG9jYWxob3N0Jywge1xuXHRcdFx0aWQsXG5cdFx0XHRvcmlnaW4sXG5cdFx0XHRsb2NhdGlvbjogcmVkaXJlY3Rcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9kb0ZvY3VzKCk7XG5cblx0XHQvLyBIYW5kbGUgZm9jdXMgY2hhbmdlIHByb2dyYW1tYXRpY2FsbHkgKGRvIG5vdCByZWx5IG9uIGV2ZW50IGZyb20gPHdlYnZpZXc+KVxuXHRcdHRoaXMuaGFuZGxlRm9jdXNDaGFuZ2UodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9kb0ZvY3VzKCkge1xuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuZWxlbWVudC5jb250ZW50V2luZG93Py5mb2N1cygpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdH1cblxuXHRcdC8vIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83NTIwOVxuXHRcdC8vIEZvY3VzaW5nIHRoZSBpbm5lciB3ZWJ2aWV3IGlzIGFzeW5jIHNvIGZvciBhIHNlcXVlbmNlIG9mIGFjdGlvbnMgc3VjaCBhczpcblx0XHQvL1xuXHRcdC8vIDEuIE9wZW4gd2Vidmlld1xuXHRcdC8vIDEuIFNob3cgcXVpY2sgcGljayBmcm9tIGNvbW1hbmQgcGFsZXR0ZVxuXHRcdC8vXG5cdFx0Ly8gV2UgZW5kIHVwIGZvY3VzaW5nIHRoZSB3ZWJ2aWV3IGFmdGVyIHNob3dpbmcgdGhlIHF1aWNrIHBpY2ssIHdoaWNoIGNhdXNlc1xuXHRcdC8vIHRoZSBxdWljayBwaWNrIHRvIGluc3RhbnRseSBkaXNtaXNzLlxuXHRcdC8vXG5cdFx0Ly8gV29ya2Fyb3VuZCB0aGlzIGJ5IGRlYm91bmNpbmcgdGhlIGZvY3VzIGFuZCBtYWtpbmcgc3VyZSB3ZSBhcmUgbm90IGZvY3VzZWQgb24gYW4gaW5wdXRcblx0XHQvLyB3aGVuIHdlIHRyeSB0byByZS1mb2N1cy5cblx0XHR0aGlzLl9mb2N1c0RlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNGb2N1c2VkIHx8ICF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy53aW5kb3c/LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgJiYgdGhpcy53aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCAhPT0gdGhpcy5lbGVtZW50ICYmIHRoaXMud2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ/LnRhZ05hbWUgIT09ICdCT0RZJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIGZvciB0aGUgd2VidmlldyB0byBiZSBjb250YWluZWQgaW4gYW5vdGhlciB3aW5kb3dcblx0XHRcdC8vIHRoYXQgZG9lcyBub3QgaGF2ZSBmb2N1cy4gQXMgc3VjaCwgYWxzbyBmb2N1cyB0aGUgYm9keSBvZiB0aGVcblx0XHRcdC8vIHdlYnZpZXcncyB3aW5kb3cgdG8gZW5zdXJlIGl0IGlzIHByb3Blcmx5IHJlY2VpdmluZyBrZXlib2FyZCBmb2N1cy5cblx0XHRcdHRoaXMud2luZG93Py5kb2N1bWVudC5ib2R5Py5mb2N1cygpO1xuXG5cdFx0XHR0aGlzLl9zZW5kKCdmb2N1cycsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2hhc0ZpbmRSZXN1bHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cHVibGljIHJlYWRvbmx5IGhhc0ZpbmRSZXN1bHQ6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5faGFzRmluZFJlc3VsdC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkU3RvcEZpbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkU3RvcEZpbmQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRTdG9wRmluZC5ldmVudDtcblxuXHQvKipcblx0ICogV2Vidmlld3MgZXhwb3NlIGEgc3RhdGVmdWwgZmluZCBBUEkuXG5cdCAqIFN1Y2Nlc3NpdmUgY2FsbHMgdG8gZmluZCB3aWxsIG1vdmUgZm9yd2FyZCBvciBiYWNrd2FyZCB0aHJvdWdoIG9uRmluZFJlc3VsdHNcblx0ICogZGVwZW5kaW5nIG9uIHRoZSBzdXBwbGllZCBvcHRpb25zLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmFsdWUgVGhlIHN0cmluZyB0byBzZWFyY2ggZm9yLiBFbXB0eSBzdHJpbmdzIGFyZSBpZ25vcmVkLlxuXHQgKi9cblx0cHVibGljIGZpbmQodmFsdWU6IHN0cmluZywgcHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmQoJ2ZpbmQnLCB7IHZhbHVlLCBwcmV2aW91cyB9KTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVGaW5kKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAoIXZhbHVlIHx8ICF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2VuZCgnZmluZCcsIHsgdmFsdWUgfSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcEZpbmQoa2VlcFNlbGVjdGlvbj86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZW5kKCdmaW5kLXN0b3AnLCB7IGNsZWFyU2VsZWN0aW9uOiAha2VlcFNlbGVjdGlvbiB9KTtcblx0XHR0aGlzLl9vbkRpZFN0b3BGaW5kLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93RmluZChhbmltYXRlZCA9IHRydWUpIHtcblx0XHR0aGlzLl93ZWJ2aWV3RmluZFdpZGdldD8ucmV2ZWFsKHVuZGVmaW5lZCwgYW5pbWF0ZWQpO1xuXHR9XG5cblx0cHVibGljIGhpZGVGaW5kKGFuaW1hdGVkID0gdHJ1ZSkge1xuXHRcdHRoaXMuX3dlYnZpZXdGaW5kV2lkZ2V0Py5oaWRlKGFuaW1hdGVkKTtcblx0fVxuXG5cdHB1YmxpYyBydW5GaW5kQWN0aW9uKHByZXZpb3VzOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fd2Vidmlld0ZpbmRXaWRnZXQ/LmZpbmQocHJldmlvdXMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCLFdBQVcsV0FBVyxxQkFBcUI7QUFDM0UsU0FBUyx3QkFBd0I7QUFHakMsU0FBUyxzQkFBc0Isd0JBQXdCO0FBQ3ZELFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFT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QUFBLEVBQ3ZDO0FBQUEsRUFFTyxjQUFjLFVBQW1CO0FBQ3ZDLFNBQUssb0JBQW9CLEtBQUssUUFBUTtBQUFBLEVBQ3ZDO0FBQ0Q7QUF2OEJhLGVBc0JZLCtCQUErQixJQUFJLEtBQWMsTUFBTTtBQUM5RSxNQUFJO0FBQ0gsVUFBTSxTQUFTLElBQUksZUFBZTtBQUNsQyxVQUFNLEtBQUssSUFBSSxlQUFlO0FBQzlCLE9BQUcsTUFBTSxZQUFZLFFBQVEsQ0FBQyxNQUFNLENBQUM7QUFDckMsT0FBRyxNQUFNLE1BQU07QUFDZixPQUFHLE1BQU0sTUFBTTtBQUNmLFdBQU87QUFBQSxFQUNSLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNELENBQUM7QUFqQ1csaUJBQU47QUFBQSxFQTZGSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FyR1U7IiwKICAibmFtZXMiOiBbIldlYnZpZXdTdGF0ZSIsICJUeXBlIiwgImUiXQp9Cg==
