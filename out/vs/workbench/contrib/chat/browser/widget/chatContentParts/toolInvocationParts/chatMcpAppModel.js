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
import * as dom from "../../../../../../../base/browser/dom.js";
import { softAssertNever } from "../../../../../../../base/common/assert.js";
import { disposableTimeout } from "../../../../../../../base/common/async.js";
import { decodeBase64 } from "../../../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { hash } from "../../../../../../../base/common/hash.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, autorunSelfDisposable, observableValue } from "../../../../../../../base/common/observable.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../../../../base/common/strings.js";
import { hasKey, isDefined } from "../../../../../../../base/common/types.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../../nls.js";
import { IChatResponseResourceFileSystemProvider } from "../../../../common/widget/chatResponseResourceFileSystemProvider.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../../../../platform/product/common/productService.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { McpToolCallUI } from "../../../../../mcp/browser/mcpToolCallUI.js";
import { McpResourceURI } from "../../../../../mcp/common/mcpTypes.js";
import { McpApps } from "../../../../../mcp/common/modelContextProtocolApps.js";
import { IWebviewService, WebviewContentPurpose, WebviewOriginStore } from "../../../../../webview/browser/webview.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { isToolResultInputOutputDetails } from "../../../../common/tools/languageModelToolsService.js";
import { IChatWidgetService } from "../../../chat.js";
const ORIGIN_STORE_KEY = "chatMcpApp.origins";
let ChatMcpAppModel = class extends Disposable {
  constructor(toolInvocation, renderData, _container, maxHeight, currentWidth, _instantiationService, _chatWidgetService, _webviewService, storageService, _chatResponseResourceFsProvider, _logService, _productService, _openerService) {
    super();
    this.toolInvocation = toolInvocation;
    this.renderData = renderData;
    this._container = _container;
    this._instantiationService = _instantiationService;
    this._chatWidgetService = _chatWidgetService;
    this._webviewService = _webviewService;
    this._chatResponseResourceFsProvider = _chatResponseResourceFsProvider;
    this._logService = _logService;
    this._productService = _productService;
    this._openerService = _openerService;
    /** Cancellation source for async operations */
    this._disposeCts = this._register(new CancellationTokenSource());
    /** Whether ui/initialize has been called and capabilities announced */
    this._announcedCapabilities = false;
    /** Latest CSP used for the frame */
    this._latestCsp = void 0;
    /** Observable for load state */
    this._loadState = observableValue(this, { status: "loading" });
    this.loadState = this._loadState;
    /** Event fired when height changes */
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    /** Accumulated download resource parts from ui/download-file calls */
    this._downloadParts = observableValue(this, []);
    this.downloadParts = this._downloadParts;
    this._originStore = new WebviewOriginStore(ORIGIN_STORE_KEY, storageService);
    this._webviewOrigin = this._computeWebviewOrigin();
    this._mcpToolCallUI = this._register(this._instantiationService.createInstance(McpToolCallUI, renderData));
    this._height = ChatMcpAppModel.heightCache.get(this.toolInvocation) ?? 300;
    this._webview = this._register(this._webviewService.createWebviewElement({
      origin: this._webviewOrigin,
      title: localize("mcpAppTitle", "MCP App"),
      options: {
        purpose: WebviewContentPurpose.ChatOutputItem,
        enableFindWidget: false,
        disableServiceWorker: true,
        retainContextWhenHidden: true
      },
      contentOptions: {
        allowMultipleAPIAcquire: true,
        allowScripts: true,
        allowForms: true
      },
      extension: void 0
    }));
    const targetWindow = dom.getWindow(this._container);
    this._webview.mountTo(this._container, targetWindow);
    this.hostContext = this._mcpToolCallUI.hostContext.map((context, reader) => ({
      ...context,
      containerDimensions: {
        width: currentWidth.read(reader),
        maxHeight: maxHeight.read(reader)
      },
      toolCall: {
        toolCallId: this.toolInvocation.toolCallId,
        toolName: this.toolInvocation.toolId
      }
    }));
    this._register(autorun((reader) => {
      const context = this.hostContext.read(reader);
      if (this._announcedCapabilities) {
        this._sendNotification({
          method: "ui/notifications/host-context-changed",
          params: context
        });
      }
    }));
    this._register(this._webview.onMessage(async ({ message }) => {
      await this._handleWebviewMessage(message);
    }));
    this._register(this._mcpToolCallUI.onNotification((n) => {
      if (!this._announcedCapabilities) {
        return;
      }
      this._webview.postMessage({ jsonrpc: "2.0", method: n.method, params: n.params });
    }));
    this._loadContent();
  }
  /**
   * Gets the current height of the webview.
   */
  get height() {
    return this._height;
  }
  remount() {
    this._webview.reinitializeAfterDismount();
    this._announcedCapabilities = false;
  }
  /**
   * Retries loading the MCP App content.
   */
  retry() {
    this._loadState.set({ status: "loading" }, void 0);
    this._loadContent();
  }
  /**
   * Loads the MCP App content into the webview.
   */
  async _loadContent() {
    const token = this._disposeCts.token;
    try {
      const resourceContent = await this._mcpToolCallUI.loadResource(token);
      if (token.isCancellationRequested) {
        return;
      }
      const htmlWithCsp = this._injectPreamble(resourceContent);
      this._announcedCapabilities = false;
      this._latestCsp = resourceContent.csp;
      this._webview.setHtml(htmlWithCsp);
      this._loadState.set({ status: "loaded" }, void 0);
    } catch (error) {
      this._logService.error("[MCP App] Error loading app:", error);
      this._loadState.set({ status: "error", error }, void 0);
    }
  }
  /**
   * Injects a Content-Security-Policy meta tag into the HTML.
   */
  _injectPreamble({ html, csp }) {
    const cleanDomains = (s) => (s?.join(" ") || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const cspContent = `
			default-src 'none';
			script-src 'self' 'unsafe-inline' ${cleanDomains(csp?.resourceDomains)};
			style-src 'self' 'unsafe-inline' ${cleanDomains(csp?.resourceDomains)};
			connect-src 'self' ${cleanDomains(csp?.connectDomains)};
			img-src 'self' data: ${cleanDomains(csp?.resourceDomains)};
			font-src 'self' ${cleanDomains(csp?.resourceDomains)};
			media-src 'self' data: ${cleanDomains(csp?.resourceDomains)};
			frame-src ${cleanDomains(csp?.frameDomains) || `'none'`};
			object-src 'none';
			base-uri ${cleanDomains(csp?.baseUriDomains) || `'self'`};
		`;
    const cspTag = `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`;
    const postMessageRehoist = `
			<script>(() => {
				const api = acquireVsCodeApi();
				const setMessageSource = (obj, src) => new Proxy(obj, {
					get: (target, prop) => {
						if (prop === 'source')  {
							return src;
						}
						return target[prop];
					}
				});

				const wrappedFns = new WeakMap();

				let patchedPostMessage = (message, transfer) => api.postMessage(message, transfer);
				const wrap = target => new Proxy(target, {
					set: (obj, prop, value) => {
						if (prop === 'postMessage') {
							patchedPostMessage = (message, transfer) => value.call(target, message, transfer);
						} else {
							obj[prop] = value;
						}
						return true;
					},
					get: (obj, prop) => {
						if (prop === 'postMessage') {
							return patchedPostMessage;
						}
						return obj[prop];
					},
				});

				const originalAddEventListener = window.addEventListener.bind(window);
				window.addEventListener = (type, listener, options) => {
					if (type === 'message') {
						const originalListener = listener;
						const wrappedListener = (event) => {
							if (event.origin === document.location.origin && event.source !== window) { event = setMessageSource(event, window.parent); }
							originalListener(event);
						};
						wrappedFns.set(originalListener, wrappedListener);
						listener = wrappedListener;
					}

					return originalAddEventListener(type, listener, options);
				};

				const originalRemoveEventListener = window.removeEventListener.bind(window);
				window.removeEventListener = (type, listener, options) => {
					const wrappedListener = wrappedFns.get(listener) || listener;
					return originalRemoveEventListener(type, wrappedListener, options);
				};

				window.parent = wrap(window.parent);

				// Scroll boundary detection: bubble wheel events to parent when at scroll boundaries
				const shouldBubbleScroll = (event) => {
					// First check element-level scrolling (for elements with overflow: auto/scroll)
					for (let node = event.target; node; node = node.parentNode) {
						if (!(node instanceof Element)) {
							continue;
						}

						// Skip HTML and BODY - we check document-level scroll separately
						if (node === document.documentElement || node === document.body) {
							continue;
						}

						// Check if the element can actually scroll
						const overflow = window.getComputedStyle(node).overflowY;
						if (overflow === 'hidden' || overflow === 'visible') {
							continue;
						}

						// Scroll up: if there's content above (scrollTop > 0), don't bubble
						if (event.deltaY < 0 && node.scrollTop > 0) {
							return false;
						}

						// Scroll down: if there's content below, don't bubble
						if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
							// Account for rounding: scrollTop isn't rounded but scrollHeight/clientHeight are
							if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
								continue;
							}
							return false;
						}
					}

					// Check document-level scrolling (works even with overflow: visible on html/body)
					const docEl = document.documentElement;
					const scrollTop = window.scrollY || docEl.scrollTop || document.body.scrollTop || 0;
					const scrollHeight = Math.max(docEl.scrollHeight, document.body.scrollHeight);
					const clientHeight = docEl.clientHeight;
					const scrollableDistance = scrollHeight - clientHeight;

					if (scrollableDistance > 2) {
						// Document is scrollable
						if (event.deltaY < 0 && scrollTop > 0) {
							return false;
						}
						if (event.deltaY > 0 && scrollTop < scrollableDistance - 2) {
							return false;
						}
					}

					return true;
				};

				window.addEventListener('wheel', (event) => {
					if (event.defaultPrevented || !shouldBubbleScroll(event)) {
						return;
					}
					api.postMessage({
						method: 'ui/notifications/sandbox-wheel',
						params: {
							deltaMode: event.deltaMode,
							deltaX: event.deltaX,
							deltaY: event.deltaY,
							deltaZ: event.deltaZ,
						}
					});
				}, { passive: true });
			})();<\/script>
		`;
    return this._prependToHead(html, cspTag + postMessageRehoist);
  }
  _prependToHead(html, content) {
    const headMatch = html.match(/<head[^>]*>/i);
    if (headMatch) {
      const insertIndex = headMatch.index + headMatch[0].length;
      return html.slice(0, insertIndex) + "\n" + content + html.slice(insertIndex);
    }
    const htmlMatch = html.match(/<html[^>]*>/i);
    if (htmlMatch) {
      const insertIndex = htmlMatch.index + htmlMatch[0].length;
      return html.slice(0, insertIndex) + "\n<head>" + content + "</head>" + html.slice(insertIndex);
    }
    return `<!DOCTYPE html><html><head>${content}</head><body>${html}</body></html>`;
  }
  /**
   * Handles incoming JSON-RPC messages from the webview.
   */
  async _handleWebviewMessage(message) {
    const request = message;
    const token = this._disposeCts.token;
    try {
      let result = {};
      switch (request.method) {
        case "ui/initialize":
          result = await this._handleInitialize(request.params);
          break;
        case "tools/call":
          result = await this._handleToolsCall(request.params, token);
          break;
        case "resources/read":
          result = await this._handleResourcesRead(request.params, token);
          break;
        case "sampling/createMessage":
          result = await this._handleSamplingCreateMessage(request.params, token);
          break;
        case "ping":
          break;
        case "ui/notifications/size-changed":
          this._handleSizeChanged(request.params);
          break;
        case "ui/open-link":
          result = await this._handleOpenLink(request.params);
          break;
        case "ui/download-file":
          result = await this._handleDownloadFile(request.params);
          break;
        case "ui/request-display-mode":
          result = { mode: "inline" };
          break;
        case "ui/notifications/initialized":
          break;
        case "ui/message":
          result = await this._handleUiMessage(request.params);
          break;
        case "ui/update-model-context":
          result = await this._handleUpdateModelContext(request.params);
          break;
        case "notifications/message":
          await this._mcpToolCallUI.log(request.params);
          break;
        case "ui/notifications/sandbox-wheel":
          this._handleSandboxWheel(request.params);
          break;
        default: {
          softAssertNever(request);
          const cast = request;
          if (cast.id !== void 0) {
            await this._sendError(cast.id, -32601, `Method not found: ${cast.method}`);
          }
          return;
        }
      }
      if (hasKey(request, { id: true })) {
        await this._sendResponse(request.id, result);
      }
    } catch (error) {
      this._logService.error(`[MCP App] Error handling ${request.method}:`, error);
      if (hasKey(request, { id: true })) {
        const message2 = error instanceof Error ? error.message : String(error);
        await this._sendError(request.id, -32e3, message2);
      }
    }
  }
  /**
   * Handles the ui/initialize request from the MCP App View.
   */
  async _handleInitialize(_params) {
    this._announcedCapabilities = true;
    let args;
    try {
      args = JSON.parse(this.renderData.input);
    } catch {
      args = this.renderData.input;
    }
    const timeout = this._register(disposableTimeout(async () => {
      this._store.delete(timeout);
      await this._sendNotification({
        method: "ui/notifications/tool-input",
        params: { arguments: args }
      });
      if (this.toolInvocation.kind === "toolInvocationSerialized") {
        this._sendToolResult(this.toolInvocation.resultDetails);
      } else if (this.toolInvocation.kind === "toolInvocation") {
        const invocation = this.toolInvocation;
        this._register(autorunSelfDisposable((reader) => {
          const state = invocation.state.read(reader);
          if (state.type === IChatToolInvocation.StateKind.Completed) {
            this._sendToolResult(state.resultDetails);
            reader.dispose();
          }
        }));
      }
    }));
    return {
      protocolVersion: McpApps.LATEST_PROTOCOL_VERSION,
      hostInfo: {
        name: this._productService.nameLong,
        version: this._productService.version
      },
      hostCapabilities: {
        openLinks: {},
        serverTools: { listChanged: true },
        serverResources: { listChanged: true },
        logging: {},
        sandbox: {
          csp: this._latestCsp,
          permissions: { clipboardWrite: {} }
        },
        updateModelContext: {
          audio: {},
          image: {},
          resourceLink: {},
          resource: {},
          structuredContent: {}
        },
        downloadFile: {}
      },
      hostContext: this.hostContext.get()
    };
  }
  /**
   * Sends the tool result notification when the result becomes available.
   */
  /**
   * Returns a stable identifier for the originating MCP server to use
   * as the webview origin key. Local servers use their definition id,
   * agent-host servers use the per-session `serverId`.
   */
  _serverOriginId() {
    return this.renderData.kind === "agentHost" ? this.renderData.serverId : this.renderData.serverDefinitionId;
  }
  /**
   * Picks a stable webview origin for this server. Local MCP servers
   * get a persisted origin via {@link WebviewOriginStore} since their
   * server-definition id is stable across VS Code restarts. Agent-host
   * servers fall back to the static in-memory {@link _agentHostOrigins}
   * map keyed by `serverId`, so origins are stable within the app
   * lifetime without leaking entries into application storage for
   * every session.
   */
  _computeWebviewOrigin() {
    if (this.renderData.kind !== "agentHost") {
      return this._originStore.getOrigin("mcpApp", this._serverOriginId());
    }
    const key = this._serverOriginId();
    let origin = ChatMcpAppModel._agentHostOrigins.get(key);
    if (!origin) {
      origin = generateUuid();
      ChatMcpAppModel._agentHostOrigins.set(key, origin);
    }
    return origin;
  }
  /**
   * Resolves a server-relative resource URI into a workbench URI.
   * - Local servers: wrap in {@link McpResourceURI.fromServer} so it
   *   resolves through the MCP filesystem provider.
   * - Agent-host servers: pass through as a plain {@link URI}. There's
   *   no host-side resolver for AHP-backed servers in v1, so these
   *   URIs may not be openable, but they preserve the original
   *   resource reference for the user.
   */
  _resolveServerResourceUri(serverUri) {
    if (this.renderData.kind === "agentHost") {
      return URI.parse(serverUri);
    }
    return McpResourceURI.fromServer({ id: this.renderData.serverDefinitionId, label: "" }, serverUri);
  }
  _sendToolResult(resultDetails) {
    if (isToolResultInputOutputDetails(resultDetails) && resultDetails.mcpOutput) {
      this._sendNotification({
        method: "ui/notifications/tool-result",
        params: resultDetails.mcpOutput
      });
    }
  }
  async _handleUiMessage(params) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
    if (!widget) {
      return { isError: true };
    }
    if (!isFalsyOrWhitespace(widget.getInput())) {
      return { isError: true };
    }
    widget.setInput(params.content.filter((c) => c.type === "text").map((c) => c.text).join("\n\n"));
    widget.attachmentModel.clearAndSetContext(...params.content.map((c, i) => {
      const id = `mcpui-${i}-${Date.now()}`;
      if (c.type === "image") {
        return { kind: "image", value: decodeBase64(c.data).buffer, id, name: "Image" };
      } else if (c.type === "resource_link") {
        const uri = this._resolveServerResourceUri(c.uri);
        return { kind: "file", value: uri, id, name: basename(uri) };
      } else {
        return void 0;
      }
    }).filter(isDefined));
    widget.focusInput();
    return { isError: false };
  }
  async _handleUpdateModelContext(params) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
    if (!widget) {
      return {};
    }
    const idPrefix = `mcpui-context-${hash(this._serverOriginId())}-`;
    const toDelete = widget.attachmentModel.getAttachmentIDs();
    const idsToDelete = Array.from(toDelete).filter((id) => id.startsWith(idPrefix));
    const entries = [];
    let entryIndex = 0;
    if (params.content) {
      for (const block of params.content) {
        const id = `${idPrefix}${entryIndex++}`;
        if (block.type === "image") {
          entries.push({
            kind: "image",
            value: decodeBase64(block.data).buffer,
            id,
            name: "Image",
            mimeType: block.mimeType
          });
        } else if (block.type === "resource_link") {
          const uri = this._resolveServerResourceUri(block.uri);
          entries.push({
            kind: "file",
            value: uri,
            id,
            name: basename(uri)
          });
        } else if (block.type === "text") {
          const preview = block.text.replaceAll(/\s+/g, " ").trim();
          const truncateTo = 20;
          entries.push({
            kind: "generic",
            value: block.text,
            id,
            tooltip: new MarkdownString().appendCodeblock("plaintext", block.text),
            name: preview.length > truncateTo ? preview.slice(0, truncateTo) + "\u2026" : preview
          });
        }
      }
    }
    if (params.structuredContent && Object.keys(params.structuredContent).length > 0) {
      const id = `${idPrefix}structured`;
      const value = JSON.stringify(params.structuredContent, null, 2);
      entries.push({
        kind: "generic",
        value,
        tooltip: new MarkdownString().appendCodeblock("json", value),
        id,
        name: "UI Data"
      });
    }
    widget.attachmentModel.updateContext(idsToDelete, entries);
    return {};
  }
  _handleSizeChanged(params) {
    if (params.height !== void 0 && params.height !== this._height) {
      this._height = params.height;
      ChatMcpAppModel.heightCache.set(this.toolInvocation, params.height);
      this._onDidChangeHeight.fire();
    }
  }
  _handleSandboxWheel(params) {
    let defaultPrevented = false;
    const evt = {
      wheelDeltaX: params.deltaX,
      wheelDeltaY: -params.deltaY,
      wheelDelta: Math.abs(params.deltaY),
      deltaX: params.deltaX,
      deltaY: -params.deltaY,
      deltaZ: params.deltaZ,
      deltaMode: params.deltaMode,
      preventDefault: () => {
        defaultPrevented = true;
      },
      stopPropagation: () => {
      },
      get defaultPrevented() {
        return defaultPrevented;
      }
    };
    const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
    widget?.delegateScrollFromMouseWheelEvent(evt);
  }
  async _handleDownloadFile(params) {
    const newParts = [];
    let hadError = false;
    for (const content of params.contents) {
      try {
        if (content.type === "resource") {
          const resource = content.resource;
          const parsed = URI.parse(resource.uri);
          const data = hasKey(resource, { text: true }) ? new TextEncoder().encode(resource.text) : { base64: resource.blob };
          const uri = this._chatResponseResourceFsProvider.associate(this.renderData.sessionResource, data, basename(parsed));
          newParts.push({ kind: "data", mimeType: resource.mimeType, uri });
        } else if (content.type === "resource_link") {
          const mcpUri = this._resolveServerResourceUri(content.uri);
          newParts.push({ kind: "data", mimeType: content.mimeType, uri: mcpUri });
        }
      } catch (error) {
        hadError = true;
        this._logService.warn("[MCP App] Failed to process ui/download-file content", error);
      }
    }
    if (newParts.length > 0) {
      const existing = this._downloadParts.get();
      this._downloadParts.set([...existing, ...newParts], void 0);
    }
    return hadError ? { isError: true } : {};
  }
  async _handleOpenLink(params) {
    let parsed;
    try {
      parsed = URI.parse(params.url, true);
    } catch {
      this._logService.warn(`[MCP App] Rejected ui/open-link with unparseable URL`);
      return { isError: true };
    }
    if (parsed.scheme !== "http" && parsed.scheme !== "https") {
      this._logService.warn(`[MCP App] Rejected ui/open-link with non-http(s) scheme: ${parsed.scheme}`);
      return { isError: true };
    }
    const ok = await this._openerService.open(parsed, { openExternal: true });
    return { isError: !ok };
  }
  /**
   * Handles tools/call requests from the MCP App.
   */
  async _handleToolsCall(params, token) {
    if (!params?.name) {
      throw new Error("Missing tool name in tools/call request");
    }
    return this._mcpToolCallUI.callTool(params.name, params.arguments || {}, token);
  }
  /**
   * Handles resources/read requests from the MCP App.
   */
  async _handleResourcesRead(params, token) {
    if (!params?.uri) {
      throw new Error("Missing uri in resources/read request");
    }
    return this._mcpToolCallUI.readResource(params.uri, token);
  }
  /**
   * Handles sampling/createMessage requests from the MCP App. Forwarded
   * to the host-side sampling implementation through the underlying
   * transport (typically an agent host that owns the MCP server).
   */
  async _handleSamplingCreateMessage(params, token) {
    if (!params) {
      throw new Error("Missing params in sampling/createMessage request");
    }
    return this._mcpToolCallUI.sampling(params, token);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async _sendResponse(id, result) {
    await this._webview.postMessage({
      jsonrpc: "2.0",
      id,
      result
    });
  }
  async _sendError(id, code, message) {
    await this._webview.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code, message }
    });
  }
  async _sendNotification(message) {
    await this._webview.postMessage({
      jsonrpc: "2.0",
      ...message
    });
  }
  dispose() {
    this._disposeCts.dispose(true);
    super.dispose();
  }
};
ChatMcpAppModel.heightCache = /* @__PURE__ */ new WeakMap();
/**
 * In-memory origin map for agent-host MCP servers. Agent-host server
 * ids embed the session id, so they're effectively single-use across
 * VS Code restarts — using {@link WebviewOriginStore} for them would
 * accumulate one persisted entry per agent-host session forever. The
 * in-memory map keeps origins stable for the lifetime of the app
 * (enough for webview state to persist across re-renders) without
 * touching application storage.
 */
ChatMcpAppModel._agentHostOrigins = /* @__PURE__ */ new Map();
ChatMcpAppModel = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, IWebviewService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IChatResponseResourceFileSystemProvider),
  __decorateParam(10, ILogService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IOpenerService)
], ChatMcpAppModel);
export {
  ChatMcpAppModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRNY3BBcHBNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBzb2Z0QXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGF1dG9ydW5TZWxmRGlzcG9zYWJsZSwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vd2lkZ2V0L2NoYXRSZXNwb25zZVJlc291cmNlRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuXG5pbXBvcnQgeyBJTWNwQXBwUmVzb3VyY2VDb250ZW50LCBNY3BUb29sQ2FsbFVJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbWNwL2Jyb3dzZXIvbWNwVG9vbENhbGxVSS5qcyc7XG5pbXBvcnQgeyBNY3BSZXNvdXJjZVVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBNY3BBcHBzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbEFwcHMuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdFbGVtZW50LCBJV2Vidmlld1NlcnZpY2UsIFdlYnZpZXdDb250ZW50UHVycG9zZSwgV2Vidmlld09yaWdpblN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgSVRvb2xSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0IH0gZnJvbSAnLi4vY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IElNY3BBcHBSZW5kZXJEYXRhIH0gZnJvbSAnLi9jaGF0TWNwQXBwU3ViUGFydC5qcyc7XG5cbi8qKiBTdG9yYWdlIGtleSBmb3IgcGVyc2lzdGVudCB3ZWJ2aWV3IG9yaWdpbnMgKi9cbmNvbnN0IE9SSUdJTl9TVE9SRV9LRVkgPSAnY2hhdE1jcEFwcC5vcmlnaW5zJztcblxuLyoqXG4gKiBMb2FkIHN0YXRlIGZvciB0aGUgTUNQIEFwcCBtb2RlbC5cbiAqL1xuZXhwb3J0IHR5cGUgTWNwQXBwTG9hZFN0YXRlID1cblx0fCB7IHJlYWRvbmx5IHN0YXR1czogJ2xvYWRpbmcnIH1cblx0fCB7IHJlYWRvbmx5IHN0YXR1czogJ2xvYWRlZCcgfVxuXHR8IHsgcmVhZG9ubHkgc3RhdHVzOiAnZXJyb3InOyByZWFkb25seSBlcnJvcjogRXJyb3IgfTtcblxuLyoqXG4gKiBNb2RlbCB0aGF0IG93bnMgYW4gTUNQIEFwcCB3ZWJ2aWV3IGFuZCBhbGwgaXRzIHN0YXRlL2xvZ2ljLlxuICogVGhlIHdlYnZpZXcgaXMgY3JlYXRlZCBsYXppbHkgb24gZmlyc3QgY2xhaW0gYW5kIHN1cnZpdmVzIGFjcm9zcyByZS1yZW5kZXJzLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdE1jcEFwcE1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGhlaWdodENhY2hlID0gbmV3IFdlYWtNYXA8SUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBudW1iZXI+KCk7XG5cblx0LyoqXG5cdCAqIEluLW1lbW9yeSBvcmlnaW4gbWFwIGZvciBhZ2VudC1ob3N0IE1DUCBzZXJ2ZXJzLiBBZ2VudC1ob3N0IHNlcnZlclxuXHQgKiBpZHMgZW1iZWQgdGhlIHNlc3Npb24gaWQsIHNvIHRoZXkncmUgZWZmZWN0aXZlbHkgc2luZ2xlLXVzZSBhY3Jvc3Ncblx0ICogVlMgQ29kZSByZXN0YXJ0cyBcdTIwMTQgdXNpbmcge0BsaW5rIFdlYnZpZXdPcmlnaW5TdG9yZX0gZm9yIHRoZW0gd291bGRcblx0ICogYWNjdW11bGF0ZSBvbmUgcGVyc2lzdGVkIGVudHJ5IHBlciBhZ2VudC1ob3N0IHNlc3Npb24gZm9yZXZlci4gVGhlXG5cdCAqIGluLW1lbW9yeSBtYXAga2VlcHMgb3JpZ2lucyBzdGFibGUgZm9yIHRoZSBsaWZldGltZSBvZiB0aGUgYXBwXG5cdCAqIChlbm91Z2ggZm9yIHdlYnZpZXcgc3RhdGUgdG8gcGVyc2lzdCBhY3Jvc3MgcmUtcmVuZGVycykgd2l0aG91dFxuXHQgKiB0b3VjaGluZyBhcHBsaWNhdGlvbiBzdG9yYWdlLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2FnZW50SG9zdE9yaWdpbnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdC8qKiBPcmlnaW4gc3RvcmUgZm9yIHBlcnNpc3RlbnQgd2VidmlldyBvcmlnaW5zIHBlciBzZXJ2ZXIgKGxvY2FsIE1DUCBvbmx5KSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5TdG9yZTogV2Vidmlld09yaWdpblN0b3JlO1xuXG5cdC8qKiBUaGUgd2VidmlldyBlbGVtZW50IGluc3RhbmNlICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYnZpZXc6IElXZWJ2aWV3RWxlbWVudDtcblxuXHQvKiogVG9vbCBjYWxsIFVJIGZvciBsb2FkaW5nIHJlc291cmNlcyBhbmQgcHJveHlpbmcgY2FsbHMgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbWNwVG9vbENhbGxVSTogTWNwVG9vbENhbGxVSTtcblxuXHQvKiogQ2FuY2VsbGF0aW9uIHNvdXJjZSBmb3IgYXN5bmMgb3BlcmF0aW9ucyAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NlQ3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdC8qKiBXaGV0aGVyIHVpL2luaXRpYWxpemUgaGFzIGJlZW4gY2FsbGVkIGFuZCBjYXBhYmlsaXRpZXMgYW5ub3VuY2VkICovXG5cdHByaXZhdGUgX2Fubm91bmNlZENhcGFiaWxpdGllcyA9IGZhbHNlO1xuXG5cdC8qKiBMYXRlc3QgQ1NQIHVzZWQgZm9yIHRoZSBmcmFtZSAqL1xuXHRwcml2YXRlIF9sYXRlc3RDc3A6IE1jcEFwcHMuTWNwVWlSZXNvdXJjZUNzcCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHQvKiogQ3VycmVudCBoZWlnaHQgb2YgdGhlIHdlYnZpZXcgKi9cblx0cHJpdmF0ZSBfaGVpZ2h0OiBudW1iZXI7XG5cblx0LyoqIFRoZSBwZXJzaXN0ZW50IHdlYnZpZXcgb3JpZ2luICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYnZpZXdPcmlnaW46IHN0cmluZztcblxuXHQvKiogT2JzZXJ2YWJsZSBmb3IgbG9hZCBzdGF0ZSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2FkU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8TWNwQXBwTG9hZFN0YXRlPih0aGlzLCB7IHN0YXR1czogJ2xvYWRpbmcnIH0pO1xuXHRwdWJsaWMgcmVhZG9ubHkgbG9hZFN0YXRlOiBJT2JzZXJ2YWJsZTxNY3BBcHBMb2FkU3RhdGU+ID0gdGhpcy5fbG9hZFN0YXRlO1xuXG5cdC8qKiBFdmVudCBmaXJlZCB3aGVuIGhlaWdodCBjaGFuZ2VzICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHQvKiogQWNjdW11bGF0ZWQgZG93bmxvYWQgcmVzb3VyY2UgcGFydHMgZnJvbSB1aS9kb3dubG9hZC1maWxlIGNhbGxzICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rvd25sb2FkUGFydHMgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXT4odGhpcywgW10pO1xuXHRwdWJsaWMgcmVhZG9ubHkgZG93bmxvYWRQYXJ0czogSU9ic2VydmFibGU8SUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXT4gPSB0aGlzLl9kb3dubG9hZFBhcnRzO1xuXG5cdC8qKiBGdWxsIGhvc3QgY29udGV4dCBmb3IgdGhlIE1DUCBBcHAgKi9cblx0cHVibGljIHJlYWRvbmx5IGhvc3RDb250ZXh0OiBJT2JzZXJ2YWJsZTxNY3BBcHBzLk1jcFVpSG9zdENvbnRleHQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLFxuXHRcdHB1YmxpYyByZWFkb25seSByZW5kZXJEYXRhOiBJTWNwQXBwUmVuZGVyRGF0YSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG1heEhlaWdodDogSU9ic2VydmFibGU8bnVtYmVyPixcblx0XHRjdXJyZW50V2lkdGg6IElPYnNlcnZhYmxlPG51bWJlcj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVdlYnZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dlYnZpZXdTZXJ2aWNlOiBJV2Vidmlld1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIgcHJpdmF0ZSByZWFkb25seSBfY2hhdFJlc3BvbnNlUmVzb3VyY2VGc1Byb3ZpZGVyOiBJQ2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9vcmlnaW5TdG9yZSA9IG5ldyBXZWJ2aWV3T3JpZ2luU3RvcmUoT1JJR0lOX1NUT1JFX0tFWSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX3dlYnZpZXdPcmlnaW4gPSB0aGlzLl9jb21wdXRlV2Vidmlld09yaWdpbigpO1xuXHRcdHRoaXMuX21jcFRvb2xDYWxsVUkgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BUb29sQ2FsbFVJLCByZW5kZXJEYXRhKSk7XG5cdFx0dGhpcy5faGVpZ2h0ID0gQ2hhdE1jcEFwcE1vZGVsLmhlaWdodENhY2hlLmdldCh0aGlzLnRvb2xJbnZvY2F0aW9uKSA/PyAzMDA7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHdlYnZpZXcgZWxlbWVudFxuXHRcdHRoaXMuX3dlYnZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl93ZWJ2aWV3U2VydmljZS5jcmVhdGVXZWJ2aWV3RWxlbWVudCh7XG5cdFx0XHRvcmlnaW46IHRoaXMuX3dlYnZpZXdPcmlnaW4sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcEFwcFRpdGxlJywgJ01DUCBBcHAnKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0cHVycG9zZTogV2Vidmlld0NvbnRlbnRQdXJwb3NlLkNoYXRPdXRwdXRJdGVtLFxuXHRcdFx0XHRlbmFibGVGaW5kV2lkZ2V0OiBmYWxzZSxcblx0XHRcdFx0ZGlzYWJsZVNlcnZpY2VXb3JrZXI6IHRydWUsXG5cdFx0XHRcdHJldGFpbkNvbnRleHRXaGVuSGlkZGVuOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGNvbnRlbnRPcHRpb25zOiB7XG5cdFx0XHRcdGFsbG93TXVsdGlwbGVBUElBY3F1aXJlOiB0cnVlLFxuXHRcdFx0XHRhbGxvd1NjcmlwdHM6IHRydWUsXG5cdFx0XHRcdGFsbG93Rm9ybXM6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gTW91bnQgdGhlIHdlYnZpZXcgdG8gdGhlIGNvbnRhaW5lclxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5fY29udGFpbmVyKTtcblx0XHR0aGlzLl93ZWJ2aWV3Lm1vdW50VG8odGhpcy5fY29udGFpbmVyLCB0YXJnZXRXaW5kb3cpO1xuXG5cdFx0Ly8gQnVpbGQgaG9zdCBjb250ZXh0IG9ic2VydmFibGVcblx0XHR0aGlzLmhvc3RDb250ZXh0ID0gdGhpcy5fbWNwVG9vbENhbGxVSS5ob3N0Q29udGV4dC5tYXAoKGNvbnRleHQsIHJlYWRlcikgPT4gKHtcblx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRjb250YWluZXJEaW1lbnNpb25zOiB7XG5cdFx0XHRcdHdpZHRoOiBjdXJyZW50V2lkdGgucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRtYXhIZWlnaHQ6IG1heEhlaWdodC5yZWFkKHJlYWRlciksXG5cdFx0XHR9LFxuXHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0dG9vbENhbGxJZDogdGhpcy50b29sSW52b2NhdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogdGhpcy50b29sSW52b2NhdGlvbi50b29sSWQsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdC8vIFNldCB1cCBob3N0IGNvbnRleHQgY2hhbmdlIG5vdGlmaWNhdGlvbnNcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5ob3N0Q29udGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodGhpcy5fYW5ub3VuY2VkQ2FwYWJpbGl0aWVzKSB7XG5cdFx0XHRcdHRoaXMuX3NlbmROb3RpZmljYXRpb24oe1xuXHRcdFx0XHRcdG1ldGhvZDogJ3VpL25vdGlmaWNhdGlvbnMvaG9zdC1jb250ZXh0LWNoYW5nZWQnLFxuXHRcdFx0XHRcdHBhcmFtczogY29udGV4dFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgdXAgbWVzc2FnZSBoYW5kbGluZ1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dlYnZpZXcub25NZXNzYWdlKGFzeW5jICh7IG1lc3NhZ2UgfSkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlV2Vidmlld01lc3NhZ2UobWVzc2FnZSBhcyBNY3BBcHBzLkFwcE1lc3NhZ2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21jcFRvb2xDYWxsVUkub25Ob3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2Fubm91bmNlZENhcGFiaWxpdGllcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93ZWJ2aWV3LnBvc3RNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogbi5tZXRob2QsIHBhcmFtczogbi5wYXJhbXMgfSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3RhcnQgbG9hZGluZyB0aGUgY29udGVudFxuXHRcdHRoaXMuX2xvYWRDb250ZW50KCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgY3VycmVudCBoZWlnaHQgb2YgdGhlIHdlYnZpZXcuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9oZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3VudCgpIHtcblx0XHR0aGlzLl93ZWJ2aWV3LnJlaW5pdGlhbGl6ZUFmdGVyRGlzbW91bnQoKTtcblx0XHR0aGlzLl9hbm5vdW5jZWRDYXBhYmlsaXRpZXMgPSBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXRyaWVzIGxvYWRpbmcgdGhlIE1DUCBBcHAgY29udGVudC5cblx0ICovXG5cdHB1YmxpYyByZXRyeSgpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2FkU3RhdGUuc2V0KHsgc3RhdHVzOiAnbG9hZGluZycgfSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9sb2FkQ29udGVudCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvYWRzIHRoZSBNQ1AgQXBwIGNvbnRlbnQgaW50byB0aGUgd2Vidmlldy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2xvYWRDb250ZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fZGlzcG9zZUN0cy50b2tlbjtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBMb2FkIHRoZSBVSSByZXNvdXJjZSBmcm9tIHRoZSBNQ1Agc2VydmVyXG5cdFx0XHRjb25zdCByZXNvdXJjZUNvbnRlbnQgPSBhd2FpdCB0aGlzLl9tY3BUb29sQ2FsbFVJLmxvYWRSZXNvdXJjZSh0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmplY3QgQ1NQIGludG8gdGhlIEhUTUxcblx0XHRcdGNvbnN0IGh0bWxXaXRoQ3NwID0gdGhpcy5faW5qZWN0UHJlYW1ibGUocmVzb3VyY2VDb250ZW50KTtcblxuXHRcdFx0Ly8gUmVzZXQgdGhlIHN0YXRlXG5cdFx0XHR0aGlzLl9hbm5vdW5jZWRDYXBhYmlsaXRpZXMgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2xhdGVzdENzcCA9IHJlc291cmNlQ29udGVudC5jc3A7XG5cblx0XHRcdC8vIFNldCB0aGUgSFRNTCBjb250ZW50XG5cdFx0XHR0aGlzLl93ZWJ2aWV3LnNldEh0bWwoaHRtbFdpdGhDc3ApO1xuXG5cdFx0XHR0aGlzLl9sb2FkU3RhdGUuc2V0KHsgc3RhdHVzOiAnbG9hZGVkJyB9LCB1bmRlZmluZWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbTUNQIEFwcF0gRXJyb3IgbG9hZGluZyBhcHA6JywgZXJyb3IpO1xuXHRcdFx0dGhpcy5fbG9hZFN0YXRlLnNldCh7IHN0YXR1czogJ2Vycm9yJywgZXJyb3I6IGVycm9yIGFzIEVycm9yIH0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEluamVjdHMgYSBDb250ZW50LVNlY3VyaXR5LVBvbGljeSBtZXRhIHRhZyBpbnRvIHRoZSBIVE1MLlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5qZWN0UHJlYW1ibGUoeyBodG1sLCBjc3AgfTogSU1jcEFwcFJlc291cmNlQ29udGVudCk6IHN0cmluZyB7XG5cdFx0Ly8gTm90ZTogdGhpcyBpcyBub3QgYnVsbGV0cHJvb2YgYWdhaW5zdCBtYWxmb3JtZWQgZG9tYWlucy4gSG93ZXZlciBpdCBkb2VzIG5vdFxuXHRcdC8vIG5lZWQgdG8gYmUuIFRoZSBzZXJ2ZXIgaXMgdGhlIG9uZSBnaXZpbmcgdXMgYm90aCB0aGUgQ1NQIGFzIHdlbGwgYXMgdGhlIEhUTUxcblx0XHQvLyB0byByZW5kZXIgaW4gdGhlIGlmcmFtZS4gTUNQIEFwcHMgZ2l2ZSB0aGUgQ1NQIHNlcGFyYXRlbHkgc28gdGhhdCBzeXN0ZW1zIHRoYXRcblx0XHQvLyBwcm94eSB0aGUgSFRNTCBmcm9tIGEgc2VydmVyIGNhbiBzZXQgaXQgaW4gYSBoZWFkZXIsIGJ1dCB0aGUgQ1NQIGFuZCB0aGUgSFRNTFxuXHRcdC8vIGNvbWUgZnJvbSB0aGUgc2FtZSBzb3VyY2UgYW5kIGFyZSB3aXRoaW4gdGhlIHNhbWUgdHJ1c3QgYm91bmRhcnkuIFdlIG9ubHlcblx0XHQvLyBwcm9jZXNzIHRoZSBDU1AgZW5vdWdoIChlc2NhcGluZyBIVE1MIHNwZWNpYWwgY2hhcmFjdGVycykgdG8gYXZvaWQgYnJlYWtpbmcgaXQuXG5cdFx0Ly9cblx0XHQvLyBJdCB3b3VsZCBjZXJ0YWlubHkgYmUgbW9yZSBkdXJhYmxlIHRvIHVzZSBgRE9NUGFyc2VyLnBhcnNlRnJvbVN0cmluZ2AgaGVyZVxuXHRcdC8vIGFuZCBvcGVyYXRlIG9uIHRoZSBEb2N1bWVudEZyYWdtZW50IG9mIHRoZSBIVE1MLCBob3dldmVyIChldmVuIHRob3VnaCBrZWVwaW5nXG5cdFx0Ly8gaXQgc29sZWx5IGFzIGEgZGV0YWNoZWQgZG9jdW1lbnQgaXMgc2FmZSkgdGhpcyByZXF1aXJlcyBtYWtpbmcgdGhlIEhUTUwgdHJ1c3RlZFxuXHRcdC8vIGluIHRoZSByZW5kZXJlciBhbmQgYnlwYXNzaW5nIHZhcmlvdXMgdHNlYyB3YXJuaW5ncy4gSSBjb25zaWRlciB0aGUgc3RyaW5nXG5cdFx0Ly8gbXVuZ2luZyBoZXJlIHRvIGJlIHRoZSBsZXNzZXIgb2YgdHdvIGV2aWxzLlxuXHRcdGNvbnN0IGNsZWFuRG9tYWlucyA9IChzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCkgPT4gKHM/LmpvaW4oJyAnKSB8fCAnJylcblx0XHRcdC5yZXBsYWNlQWxsKCcmJywgJyZhbXA7Jylcblx0XHRcdC5yZXBsYWNlQWxsKCc8JywgJyZsdDsnKVxuXHRcdFx0LnJlcGxhY2VBbGwoJz4nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZUFsbCgnXCInLCAnJnF1b3Q7Jyk7XG5cblx0XHRjb25zdCBjc3BDb250ZW50ID0gYFxuXHRcdFx0ZGVmYXVsdC1zcmMgJ25vbmUnO1xuXHRcdFx0c2NyaXB0LXNyYyAnc2VsZicgJ3Vuc2FmZS1pbmxpbmUnICR7Y2xlYW5Eb21haW5zKGNzcD8ucmVzb3VyY2VEb21haW5zKX07XG5cdFx0XHRzdHlsZS1zcmMgJ3NlbGYnICd1bnNhZmUtaW5saW5lJyAke2NsZWFuRG9tYWlucyhjc3A/LnJlc291cmNlRG9tYWlucyl9O1xuXHRcdFx0Y29ubmVjdC1zcmMgJ3NlbGYnICR7Y2xlYW5Eb21haW5zKGNzcD8uY29ubmVjdERvbWFpbnMpfTtcblx0XHRcdGltZy1zcmMgJ3NlbGYnIGRhdGE6ICR7Y2xlYW5Eb21haW5zKGNzcD8ucmVzb3VyY2VEb21haW5zKX07XG5cdFx0XHRmb250LXNyYyAnc2VsZicgJHtjbGVhbkRvbWFpbnMoY3NwPy5yZXNvdXJjZURvbWFpbnMpfTtcblx0XHRcdG1lZGlhLXNyYyAnc2VsZicgZGF0YTogJHtjbGVhbkRvbWFpbnMoY3NwPy5yZXNvdXJjZURvbWFpbnMpfTtcblx0XHRcdGZyYW1lLXNyYyAke2NsZWFuRG9tYWlucyhjc3A/LmZyYW1lRG9tYWlucykgfHwgYCdub25lJ2B9O1xuXHRcdFx0b2JqZWN0LXNyYyAnbm9uZSc7XG5cdFx0XHRiYXNlLXVyaSAke2NsZWFuRG9tYWlucyhjc3A/LmJhc2VVcmlEb21haW5zKSB8fCBgJ3NlbGYnYH07XG5cdFx0YDtcblxuXHRcdGNvbnN0IGNzcFRhZyA9IGA8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIiBjb250ZW50PVwiJHtjc3BDb250ZW50fVwiPmA7XG5cblx0XHQvLyB3aW5kb3cudG9wIGFuZCB3aW5kb3cucGFyZW50IGdldCByZXNldCB0byBgd2luZG93YCBhZnRlciB0aGUgdnNjb2RlIEFQSSBpcyBtYWRlLlxuXHRcdC8vIEhvd2V2ZXIsIHRoZSBNQ1AgQXBwIFNESyBieSBkZWZhdWx0IHRyaWVzIHRvIHVzZSB0aGVzZSBmb3IgcG9zdE1lc3NhZ2UuIFNvLCB3cmFwIHRoZW0uXG5cdFx0Ly8gV2UgYWxzbyBuZWVkIHRvIHdyYXAgdGhlIGV2ZW50IGxpc3RlbmVycyBvdGhlcndpc2UgdGhlIGV2ZW50LnNvdXJjZSB3b24ndCBtYXRjaFxuXHRcdC8vIHRoZSB3cmFwcGVkIHdpbmRvdy5wYXJlbnQvd2luZG93LnRvcC5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzJhNGM4ZjViOGE3MTVkNDVkZDJhMzY3Nzg5MDZiNTgxMGU0YTE5MDUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvYnJvd3Nlci9wcmUvaW5kZXguaHRtbCNMMjQyLUwyNDRcblx0XHRjb25zdCBwb3N0TWVzc2FnZVJlaG9pc3QgPSBgXG5cdFx0XHQ8c2NyaXB0PigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFwaSA9IGFjcXVpcmVWc0NvZGVBcGkoKTtcblx0XHRcdFx0Y29uc3Qgc2V0TWVzc2FnZVNvdXJjZSA9IChvYmosIHNyYykgPT4gbmV3IFByb3h5KG9iaiwge1xuXHRcdFx0XHRcdGdldDogKHRhcmdldCwgcHJvcCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHByb3AgPT09ICdzb3VyY2UnKSAge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc3JjO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRhcmdldFtwcm9wXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHdyYXBwZWRGbnMgPSBuZXcgV2Vha01hcCgpO1xuXG5cdFx0XHRcdGxldCBwYXRjaGVkUG9zdE1lc3NhZ2UgPSAobWVzc2FnZSwgdHJhbnNmZXIpID0+IGFwaS5wb3N0TWVzc2FnZShtZXNzYWdlLCB0cmFuc2Zlcik7XG5cdFx0XHRcdGNvbnN0IHdyYXAgPSB0YXJnZXQgPT4gbmV3IFByb3h5KHRhcmdldCwge1xuXHRcdFx0XHRcdHNldDogKG9iaiwgcHJvcCwgdmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdGlmIChwcm9wID09PSAncG9zdE1lc3NhZ2UnKSB7XG5cdFx0XHRcdFx0XHRcdHBhdGNoZWRQb3N0TWVzc2FnZSA9IChtZXNzYWdlLCB0cmFuc2ZlcikgPT4gdmFsdWUuY2FsbCh0YXJnZXQsIG1lc3NhZ2UsIHRyYW5zZmVyKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG9ialtwcm9wXSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQ6IChvYmosIHByb3ApID0+IHtcblx0XHRcdFx0XHRcdGlmIChwcm9wID09PSAncG9zdE1lc3NhZ2UnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBwYXRjaGVkUG9zdE1lc3NhZ2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gb2JqW3Byb3BdO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsQWRkRXZlbnRMaXN0ZW5lciA9IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyLmJpbmQod2luZG93KTtcblx0XHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIgPSAodHlwZSwgbGlzdGVuZXIsIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRpZiAodHlwZSA9PT0gJ21lc3NhZ2UnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbExpc3RlbmVyID0gbGlzdGVuZXI7XG5cdFx0XHRcdFx0XHRjb25zdCB3cmFwcGVkTGlzdGVuZXIgPSAoZXZlbnQpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGV2ZW50Lm9yaWdpbiA9PT0gZG9jdW1lbnQubG9jYXRpb24ub3JpZ2luICYmIGV2ZW50LnNvdXJjZSAhPT0gd2luZG93KSB7IGV2ZW50ID0gc2V0TWVzc2FnZVNvdXJjZShldmVudCwgd2luZG93LnBhcmVudCk7IH1cblx0XHRcdFx0XHRcdFx0b3JpZ2luYWxMaXN0ZW5lcihldmVudCk7XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0d3JhcHBlZEZucy5zZXQob3JpZ2luYWxMaXN0ZW5lciwgd3JhcHBlZExpc3RlbmVyKTtcblx0XHRcdFx0XHRcdGxpc3RlbmVyID0gd3JhcHBlZExpc3RlbmVyO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbEFkZEV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIsIG9wdGlvbnMpO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsUmVtb3ZlRXZlbnRMaXN0ZW5lciA9IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyLmJpbmQod2luZG93KTtcblx0XHRcdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIgPSAodHlwZSwgbGlzdGVuZXIsIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRjb25zdCB3cmFwcGVkTGlzdGVuZXIgPSB3cmFwcGVkRm5zLmdldChsaXN0ZW5lcikgfHwgbGlzdGVuZXI7XG5cdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsUmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCB3cmFwcGVkTGlzdGVuZXIsIG9wdGlvbnMpO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHdpbmRvdy5wYXJlbnQgPSB3cmFwKHdpbmRvdy5wYXJlbnQpO1xuXG5cdFx0XHRcdC8vIFNjcm9sbCBib3VuZGFyeSBkZXRlY3Rpb246IGJ1YmJsZSB3aGVlbCBldmVudHMgdG8gcGFyZW50IHdoZW4gYXQgc2Nyb2xsIGJvdW5kYXJpZXNcblx0XHRcdFx0Y29uc3Qgc2hvdWxkQnViYmxlU2Nyb2xsID0gKGV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0Ly8gRmlyc3QgY2hlY2sgZWxlbWVudC1sZXZlbCBzY3JvbGxpbmcgKGZvciBlbGVtZW50cyB3aXRoIG92ZXJmbG93OiBhdXRvL3Njcm9sbClcblx0XHRcdFx0XHRmb3IgKGxldCBub2RlID0gZXZlbnQudGFyZ2V0OyBub2RlOyBub2RlID0gbm9kZS5wYXJlbnROb2RlKSB7XG5cdFx0XHRcdFx0XHRpZiAoIShub2RlIGluc3RhbmNlb2YgRWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFNraXAgSFRNTCBhbmQgQk9EWSAtIHdlIGNoZWNrIGRvY3VtZW50LWxldmVsIHNjcm9sbCBzZXBhcmF0ZWx5XG5cdFx0XHRcdFx0XHRpZiAobm9kZSA9PT0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IG5vZGUgPT09IGRvY3VtZW50LmJvZHkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBlbGVtZW50IGNhbiBhY3R1YWxseSBzY3JvbGxcblx0XHRcdFx0XHRcdGNvbnN0IG92ZXJmbG93ID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUobm9kZSkub3ZlcmZsb3dZO1xuXHRcdFx0XHRcdFx0aWYgKG92ZXJmbG93ID09PSAnaGlkZGVuJyB8fCBvdmVyZmxvdyA9PT0gJ3Zpc2libGUnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBTY3JvbGwgdXA6IGlmIHRoZXJlJ3MgY29udGVudCBhYm92ZSAoc2Nyb2xsVG9wID4gMCksIGRvbid0IGJ1YmJsZVxuXHRcdFx0XHRcdFx0aWYgKGV2ZW50LmRlbHRhWSA8IDAgJiYgbm9kZS5zY3JvbGxUb3AgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gU2Nyb2xsIGRvd246IGlmIHRoZXJlJ3MgY29udGVudCBiZWxvdywgZG9uJ3QgYnViYmxlXG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQuZGVsdGFZID4gMCAmJiBub2RlLnNjcm9sbFRvcCArIG5vZGUuY2xpZW50SGVpZ2h0IDwgbm9kZS5zY3JvbGxIZWlnaHQpIHtcblx0XHRcdFx0XHRcdFx0Ly8gQWNjb3VudCBmb3Igcm91bmRpbmc6IHNjcm9sbFRvcCBpc24ndCByb3VuZGVkIGJ1dCBzY3JvbGxIZWlnaHQvY2xpZW50SGVpZ2h0IGFyZVxuXHRcdFx0XHRcdFx0XHRpZiAobm9kZS5zY3JvbGxIZWlnaHQgLSBub2RlLnNjcm9sbFRvcCAtIG5vZGUuY2xpZW50SGVpZ2h0IDwgMikge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBDaGVjayBkb2N1bWVudC1sZXZlbCBzY3JvbGxpbmcgKHdvcmtzIGV2ZW4gd2l0aCBvdmVyZmxvdzogdmlzaWJsZSBvbiBodG1sL2JvZHkpXG5cdFx0XHRcdFx0Y29uc3QgZG9jRWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG5cdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsVG9wID0gd2luZG93LnNjcm9sbFkgfHwgZG9jRWwuc2Nyb2xsVG9wIHx8IGRvY3VtZW50LmJvZHkuc2Nyb2xsVG9wIHx8IDA7XG5cdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gTWF0aC5tYXgoZG9jRWwuc2Nyb2xsSGVpZ2h0LCBkb2N1bWVudC5ib2R5LnNjcm9sbEhlaWdodCk7XG5cdFx0XHRcdFx0Y29uc3QgY2xpZW50SGVpZ2h0ID0gZG9jRWwuY2xpZW50SGVpZ2h0O1xuXHRcdFx0XHRcdGNvbnN0IHNjcm9sbGFibGVEaXN0YW5jZSA9IHNjcm9sbEhlaWdodCAtIGNsaWVudEhlaWdodDtcblxuXHRcdFx0XHRcdGlmIChzY3JvbGxhYmxlRGlzdGFuY2UgPiAyKSB7XG5cdFx0XHRcdFx0XHQvLyBEb2N1bWVudCBpcyBzY3JvbGxhYmxlXG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQuZGVsdGFZIDwgMCAmJiBzY3JvbGxUb3AgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChldmVudC5kZWx0YVkgPiAwICYmIHNjcm9sbFRvcCA8IHNjcm9sbGFibGVEaXN0YW5jZSAtIDIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIChldmVudCkgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudC5kZWZhdWx0UHJldmVudGVkIHx8ICFzaG91bGRCdWJibGVTY3JvbGwoZXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFwaS5wb3N0TWVzc2FnZSh7XG5cdFx0XHRcdFx0XHRtZXRob2Q6ICd1aS9ub3RpZmljYXRpb25zL3NhbmRib3gtd2hlZWwnLFxuXHRcdFx0XHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdFx0XHRcdGRlbHRhTW9kZTogZXZlbnQuZGVsdGFNb2RlLFxuXHRcdFx0XHRcdFx0XHRkZWx0YVg6IGV2ZW50LmRlbHRhWCxcblx0XHRcdFx0XHRcdFx0ZGVsdGFZOiBldmVudC5kZWx0YVksXG5cdFx0XHRcdFx0XHRcdGRlbHRhWjogZXZlbnQuZGVsdGFaLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LCB7IHBhc3NpdmU6IHRydWUgfSk7XG5cdFx0XHR9KSgpOzwvc2NyaXB0PlxuXHRcdGA7XG5cblx0XHRyZXR1cm4gdGhpcy5fcHJlcGVuZFRvSGVhZChodG1sLCBjc3BUYWcgKyBwb3N0TWVzc2FnZVJlaG9pc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJlcGVuZFRvSGVhZChodG1sOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Ly8gVHJ5IHRvIGluamVjdCBpbnRvIDxoZWFkPlxuXHRcdGNvbnN0IGhlYWRNYXRjaCA9IGh0bWwubWF0Y2goLzxoZWFkW14+XSo+L2kpO1xuXHRcdGlmIChoZWFkTWF0Y2gpIHtcblx0XHRcdGNvbnN0IGluc2VydEluZGV4ID0gaGVhZE1hdGNoLmluZGV4ISArIGhlYWRNYXRjaFswXS5sZW5ndGg7XG5cdFx0XHRyZXR1cm4gaHRtbC5zbGljZSgwLCBpbnNlcnRJbmRleCkgKyAnXFxuJyArIGNvbnRlbnQgKyBodG1sLnNsaWNlKGluc2VydEluZGV4KTtcblx0XHR9XG5cblx0XHQvLyBJZiBubyA8aGVhZD4sIHRyeSB0byBpbmplY3QgYWZ0ZXIgPGh0bWw+XG5cdFx0Y29uc3QgaHRtbE1hdGNoID0gaHRtbC5tYXRjaCgvPGh0bWxbXj5dKj4vaSk7XG5cdFx0aWYgKGh0bWxNYXRjaCkge1xuXHRcdFx0Y29uc3QgaW5zZXJ0SW5kZXggPSBodG1sTWF0Y2guaW5kZXghICsgaHRtbE1hdGNoWzBdLmxlbmd0aDtcblx0XHRcdHJldHVybiBodG1sLnNsaWNlKDAsIGluc2VydEluZGV4KSArICdcXG48aGVhZD4nICsgY29udGVudCArICc8L2hlYWQ+JyArIGh0bWwuc2xpY2UoaW5zZXJ0SW5kZXgpO1xuXHRcdH1cblxuXHRcdC8vIElmIG5vIDxodG1sPiwgcHJlcGVuZFxuXHRcdHJldHVybiBgPCFET0NUWVBFIGh0bWw+PGh0bWw+PGhlYWQ+JHtjb250ZW50fTwvaGVhZD48Ym9keT4ke2h0bWx9PC9ib2R5PjwvaHRtbD5gO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgaW5jb21pbmcgSlNPTi1SUEMgbWVzc2FnZXMgZnJvbSB0aGUgd2Vidmlldy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVdlYnZpZXdNZXNzYWdlKG1lc3NhZ2U6IE1jcEFwcHMuQXBwTWVzc2FnZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtZXNzYWdlO1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fZGlzcG9zZUN0cy50b2tlbjtcblxuXHRcdHRyeSB7XG5cdFx0XHRsZXQgcmVzdWx0OiBNY3BBcHBzLkhvc3RSZXN1bHQgPSB7fTtcblxuXHRcdFx0c3dpdGNoIChyZXF1ZXN0Lm1ldGhvZCkge1xuXHRcdFx0XHRjYXNlICd1aS9pbml0aWFsaXplJzpcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVJbml0aWFsaXplKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd0b29scy9jYWxsJzpcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVUb29sc0NhbGwocmVxdWVzdC5wYXJhbXMsIHRva2VuKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdyZXNvdXJjZXMvcmVhZCc6XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlUmVzb3VyY2VzUmVhZChyZXF1ZXN0LnBhcmFtcywgdG9rZW4pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3NhbXBsaW5nL2NyZWF0ZU1lc3NhZ2UnOlxuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZVNhbXBsaW5nQ3JlYXRlTWVzc2FnZShyZXF1ZXN0LnBhcmFtcywgdG9rZW4pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3BpbmcnOlxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3VpL25vdGlmaWNhdGlvbnMvc2l6ZS1jaGFuZ2VkJzpcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVTaXplQ2hhbmdlZChyZXF1ZXN0LnBhcmFtcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAndWkvb3Blbi1saW5rJzpcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVPcGVuTGluayhyZXF1ZXN0LnBhcmFtcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAndWkvZG93bmxvYWQtZmlsZSc6XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlRG93bmxvYWRGaWxlKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd1aS9yZXF1ZXN0LWRpc3BsYXktbW9kZSc6XG5cdFx0XHRcdFx0Ly8gVlMgQ29kZSBvbmx5IHN1cHBvcnRzIGlubGluZSBkaXNwbGF5IG1vZGVcblx0XHRcdFx0XHRyZXN1bHQgPSB7IG1vZGU6ICdpbmxpbmUnIH0gc2F0aXNmaWVzIE1jcEFwcHMuTWNwVWlSZXF1ZXN0RGlzcGxheU1vZGVSZXN1bHQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAndWkvbm90aWZpY2F0aW9ucy9pbml0aWFsaXplZCc6XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAndWkvbWVzc2FnZSc6XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlVWlNZXNzYWdlKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd1aS91cGRhdGUtbW9kZWwtY29udGV4dCc6XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlVXBkYXRlTW9kZWxDb250ZXh0KHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdub3RpZmljYXRpb25zL21lc3NhZ2UnOlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX21jcFRvb2xDYWxsVUkubG9nKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd1aS9ub3RpZmljYXRpb25zL3NhbmRib3gtd2hlZWwnOlxuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZVNhbmRib3hXaGVlbChyZXF1ZXN0LnBhcmFtcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdHNvZnRBc3NlcnROZXZlcihyZXF1ZXN0KTtcblx0XHRcdFx0XHRjb25zdCBjYXN0ID0gcmVxdWVzdCBhcyBNQ1AuSlNPTlJQQ1JlcXVlc3Q7XG5cdFx0XHRcdFx0aWYgKGNhc3QuaWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2VuZEVycm9yKGNhc3QuaWQsIC0zMjYwMSwgYE1ldGhvZCBub3QgZm91bmQ6ICR7Y2FzdC5tZXRob2R9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZW5kIHJlc3BvbnNlIGlmIHRoaXMgd2FzIGEgcmVxdWVzdCAoaGFzIGlkKVxuXHRcdFx0aWYgKGhhc0tleShyZXF1ZXN0LCB7IGlkOiB0cnVlIH0pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3NlbmRSZXNwb25zZShyZXF1ZXN0LmlkLCByZXN1bHQpO1xuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtNQ1AgQXBwXSBFcnJvciBoYW5kbGluZyAke3JlcXVlc3QubWV0aG9kfTpgLCBlcnJvcik7XG5cdFx0XHRpZiAoaGFzS2V5KHJlcXVlc3QsIHsgaWQ6IHRydWUgfSkpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2VuZEVycm9yKHJlcXVlc3QuaWQsIC0zMjAwMCwgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlIHVpL2luaXRpYWxpemUgcmVxdWVzdCBmcm9tIHRoZSBNQ1AgQXBwIFZpZXcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVJbml0aWFsaXplKF9wYXJhbXM6IE1jcEFwcHMuTWNwVWlJbml0aWFsaXplUmVxdWVzdFsncGFyYW1zJ10pOiBQcm9taXNlPE1jcEFwcHMuTWNwVWlJbml0aWFsaXplUmVzdWx0PiB7XG5cdFx0dGhpcy5fYW5ub3VuY2VkQ2FwYWJpbGl0aWVzID0gdHJ1ZTtcblxuXHRcdC8vIFwiSG9zdCBNVVNUIHNlbmQgdGhpcyBub3RpZmljYXRpb24gd2l0aCB0aGUgY29tcGxldGUgdG9vbCBhcmd1bWVudHMgYWZ0ZXIgdGhlIEd1ZXN0IFVJJ3MgaW5pdGlhbGl6ZSByZXF1ZXN0IGNvbXBsZXRlc1wiXG5cdFx0Ly8gQ2FzdCB0byBgYW55YCBkdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL21vZGVsY29udGV4dHByb3RvY29sL2V4dC1hcHBzL2lzc3Vlcy8xOTdcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGxldCBhcmdzOiBhbnk7XG5cdFx0dHJ5IHtcblx0XHRcdGFyZ3MgPSBKU09OLnBhcnNlKHRoaXMucmVuZGVyRGF0YS5pbnB1dCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRhcmdzID0gdGhpcy5yZW5kZXJEYXRhLmlucHV0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpbWVvdXQgPSB0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlVGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUodGltZW91dCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9zZW5kTm90aWZpY2F0aW9uKHtcblx0XHRcdFx0bWV0aG9kOiAndWkvbm90aWZpY2F0aW9ucy90b29sLWlucHV0Jyxcblx0XHRcdFx0cGFyYW1zOiB7IGFyZ3VtZW50czogYXJncyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdFx0dGhpcy5fc2VuZFRvb2xSZXN1bHQodGhpcy50b29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy50b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0aGlzLnRvb2xJbnZvY2F0aW9uO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuU2VsZkRpc3Bvc2FibGUocmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NlbmRUb29sUmVzdWx0KHN0YXRlLnJlc3VsdERldGFpbHMpO1xuXHRcdFx0XHRcdFx0cmVhZGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBNY3BBcHBzLkxBVEVTVF9QUk9UT0NPTF9WRVJTSU9OLFxuXHRcdFx0aG9zdEluZm86IHtcblx0XHRcdFx0bmFtZTogdGhpcy5fcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsXG5cdFx0XHRcdHZlcnNpb246IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHR9LFxuXHRcdFx0aG9zdENhcGFiaWxpdGllczoge1xuXHRcdFx0XHRvcGVuTGlua3M6IHt9LFxuXHRcdFx0XHRzZXJ2ZXJUb29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LFxuXHRcdFx0XHRzZXJ2ZXJSZXNvdXJjZXM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSxcblx0XHRcdFx0bG9nZ2luZzoge30sXG5cdFx0XHRcdHNhbmRib3g6IHtcblx0XHRcdFx0XHRjc3A6IHRoaXMuX2xhdGVzdENzcCxcblx0XHRcdFx0XHRwZXJtaXNzaW9uczogeyBjbGlwYm9hcmRXcml0ZToge30gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dXBkYXRlTW9kZWxDb250ZXh0OiB7XG5cdFx0XHRcdFx0YXVkaW86IHt9LFxuXHRcdFx0XHRcdGltYWdlOiB7fSxcblx0XHRcdFx0XHRyZXNvdXJjZUxpbms6IHt9LFxuXHRcdFx0XHRcdHJlc291cmNlOiB7fSxcblx0XHRcdFx0XHRzdHJ1Y3R1cmVkQ29udGVudDoge30sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRvd25sb2FkRmlsZToge30sXG5cdFx0XHR9LFxuXHRcdFx0aG9zdENvbnRleHQ6IHRoaXMuaG9zdENvbnRleHQuZ2V0KCksXG5cdFx0fSBzYXRpc2ZpZXMgUmVxdWlyZWQ8TWNwQXBwcy5NY3BVaUluaXRpYWxpemVSZXN1bHQ+O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmRzIHRoZSB0b29sIHJlc3VsdCBub3RpZmljYXRpb24gd2hlbiB0aGUgcmVzdWx0IGJlY29tZXMgYXZhaWxhYmxlLlxuXHQgKi9cblx0LyoqXG5cdCAqIFJldHVybnMgYSBzdGFibGUgaWRlbnRpZmllciBmb3IgdGhlIG9yaWdpbmF0aW5nIE1DUCBzZXJ2ZXIgdG8gdXNlXG5cdCAqIGFzIHRoZSB3ZWJ2aWV3IG9yaWdpbiBrZXkuIExvY2FsIHNlcnZlcnMgdXNlIHRoZWlyIGRlZmluaXRpb24gaWQsXG5cdCAqIGFnZW50LWhvc3Qgc2VydmVycyB1c2UgdGhlIHBlci1zZXNzaW9uIGBzZXJ2ZXJJZGAuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXJ2ZXJPcmlnaW5JZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnJlbmRlckRhdGEua2luZCA9PT0gJ2FnZW50SG9zdCdcblx0XHRcdD8gdGhpcy5yZW5kZXJEYXRhLnNlcnZlcklkXG5cdFx0XHQ6IHRoaXMucmVuZGVyRGF0YS5zZXJ2ZXJEZWZpbml0aW9uSWQ7XG5cdH1cblxuXHQvKipcblx0ICogUGlja3MgYSBzdGFibGUgd2VidmlldyBvcmlnaW4gZm9yIHRoaXMgc2VydmVyLiBMb2NhbCBNQ1Agc2VydmVyc1xuXHQgKiBnZXQgYSBwZXJzaXN0ZWQgb3JpZ2luIHZpYSB7QGxpbmsgV2Vidmlld09yaWdpblN0b3JlfSBzaW5jZSB0aGVpclxuXHQgKiBzZXJ2ZXItZGVmaW5pdGlvbiBpZCBpcyBzdGFibGUgYWNyb3NzIFZTIENvZGUgcmVzdGFydHMuIEFnZW50LWhvc3Rcblx0ICogc2VydmVycyBmYWxsIGJhY2sgdG8gdGhlIHN0YXRpYyBpbi1tZW1vcnkge0BsaW5rIF9hZ2VudEhvc3RPcmlnaW5zfVxuXHQgKiBtYXAga2V5ZWQgYnkgYHNlcnZlcklkYCwgc28gb3JpZ2lucyBhcmUgc3RhYmxlIHdpdGhpbiB0aGUgYXBwXG5cdCAqIGxpZmV0aW1lIHdpdGhvdXQgbGVha2luZyBlbnRyaWVzIGludG8gYXBwbGljYXRpb24gc3RvcmFnZSBmb3Jcblx0ICogZXZlcnkgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVXZWJ2aWV3T3JpZ2luKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMucmVuZGVyRGF0YS5raW5kICE9PSAnYWdlbnRIb3N0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29yaWdpblN0b3JlLmdldE9yaWdpbignbWNwQXBwJywgdGhpcy5fc2VydmVyT3JpZ2luSWQoKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHRoaXMuX3NlcnZlck9yaWdpbklkKCk7XG5cdFx0bGV0IG9yaWdpbiA9IENoYXRNY3BBcHBNb2RlbC5fYWdlbnRIb3N0T3JpZ2lucy5nZXQoa2V5KTtcblx0XHRpZiAoIW9yaWdpbikge1xuXHRcdFx0b3JpZ2luID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRDaGF0TWNwQXBwTW9kZWwuX2FnZW50SG9zdE9yaWdpbnMuc2V0KGtleSwgb3JpZ2luKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9yaWdpbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIHNlcnZlci1yZWxhdGl2ZSByZXNvdXJjZSBVUkkgaW50byBhIHdvcmtiZW5jaCBVUkkuXG5cdCAqIC0gTG9jYWwgc2VydmVyczogd3JhcCBpbiB7QGxpbmsgTWNwUmVzb3VyY2VVUkkuZnJvbVNlcnZlcn0gc28gaXRcblx0ICogICByZXNvbHZlcyB0aHJvdWdoIHRoZSBNQ1AgZmlsZXN5c3RlbSBwcm92aWRlci5cblx0ICogLSBBZ2VudC1ob3N0IHNlcnZlcnM6IHBhc3MgdGhyb3VnaCBhcyBhIHBsYWluIHtAbGluayBVUkl9LiBUaGVyZSdzXG5cdCAqICAgbm8gaG9zdC1zaWRlIHJlc29sdmVyIGZvciBBSFAtYmFja2VkIHNlcnZlcnMgaW4gdjEsIHNvIHRoZXNlXG5cdCAqICAgVVJJcyBtYXkgbm90IGJlIG9wZW5hYmxlLCBidXQgdGhleSBwcmVzZXJ2ZSB0aGUgb3JpZ2luYWxcblx0ICogICByZXNvdXJjZSByZWZlcmVuY2UgZm9yIHRoZSB1c2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlcnZlclJlc291cmNlVXJpKHNlcnZlclVyaTogc3RyaW5nKTogVVJJIHtcblx0XHRpZiAodGhpcy5yZW5kZXJEYXRhLmtpbmQgPT09ICdhZ2VudEhvc3QnKSB7XG5cdFx0XHRyZXR1cm4gVVJJLnBhcnNlKHNlcnZlclVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBNY3BSZXNvdXJjZVVSSS5mcm9tU2VydmVyKHsgaWQ6IHRoaXMucmVuZGVyRGF0YS5zZXJ2ZXJEZWZpbml0aW9uSWQsIGxhYmVsOiAnJyB9LCBzZXJ2ZXJVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFRvb2xSZXN1bHQocmVzdWx0RGV0YWlsczogSVRvb2xSZXN1bHRbJ3Rvb2xSZXN1bHREZXRhaWxzJ10gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZFsncmVzdWx0RGV0YWlscyddKTogdm9pZCB7XG5cdFx0aWYgKGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyhyZXN1bHREZXRhaWxzKSAmJiByZXN1bHREZXRhaWxzLm1jcE91dHB1dCkge1xuXHRcdFx0dGhpcy5fc2VuZE5vdGlmaWNhdGlvbih7XG5cdFx0XHRcdG1ldGhvZDogJ3VpL25vdGlmaWNhdGlvbnMvdG9vbC1yZXN1bHQnLFxuXHRcdFx0XHRwYXJhbXM6IHJlc3VsdERldGFpbHMubWNwT3V0cHV0IGFzIE1DUC5DYWxsVG9vbFJlc3VsdCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVVpTWVzc2FnZShwYXJhbXM6IE1jcEFwcHMuTWNwVWlNZXNzYWdlUmVxdWVzdFsncGFyYW1zJ10pOiBQcm9taXNlPE1jcEFwcHMuTWNwVWlNZXNzYWdlUmVzdWx0PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UodGhpcy5yZW5kZXJEYXRhLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybiB7IGlzRXJyb3I6IHRydWUgfTtcblx0XHR9XG5cblx0XHRpZiAoIWlzRmFsc3lPcldoaXRlc3BhY2Uod2lkZ2V0LmdldElucHV0KCkpKSB7XG5cdFx0XHRyZXR1cm4geyBpc0Vycm9yOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0d2lkZ2V0LnNldElucHV0KHBhcmFtcy5jb250ZW50LmZpbHRlcihjID0+IGMudHlwZSA9PT0gJ3RleHQnKS5tYXAoYyA9PiBjLnRleHQpLmpvaW4oJ1xcblxcbicpKTtcblx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmNsZWFyQW5kU2V0Q29udGV4dCguLi5wYXJhbXMuY29udGVudC5tYXAoKGMsIGkpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IGlkID0gYG1jcHVpLSR7aX0tJHtEYXRlLm5vdygpfWA7XG5cdFx0XHRpZiAoYy50eXBlID09PSAnaW1hZ2UnKSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdpbWFnZScsIHZhbHVlOiBkZWNvZGVCYXNlNjQoYy5kYXRhKS5idWZmZXIsIGlkLCBuYW1lOiAnSW1hZ2UnIH07XG5cdFx0XHR9IGVsc2UgaWYgKGMudHlwZSA9PT0gJ3Jlc291cmNlX2xpbmsnKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IHRoaXMuX3Jlc29sdmVTZXJ2ZXJSZXNvdXJjZVVyaShjLnVyaSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdmaWxlJywgdmFsdWU6IHVyaSwgaWQsIG5hbWU6IGJhc2VuYW1lKHVyaSkgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCkpO1xuXHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cblx0XHRyZXR1cm4geyBpc0Vycm9yOiBmYWxzZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVXBkYXRlTW9kZWxDb250ZXh0KHBhcmFtczogTWNwQXBwcy5NY3BVaVVwZGF0ZU1vZGVsQ29udGV4dFJlcXVlc3RbJ3BhcmFtcyddKTogUHJvbWlzZTxNQ1AuRW1wdHlSZXN1bHQ+IHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSh0aGlzLnJlbmRlckRhdGEuc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGlkUHJlZml4ID0gYG1jcHVpLWNvbnRleHQtJHtoYXNoKHRoaXMuX3NlcnZlck9yaWdpbklkKCkpfS1gO1xuXHRcdGNvbnN0IHRvRGVsZXRlID0gd2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5nZXRBdHRhY2htZW50SURzKCk7XG5cdFx0Y29uc3QgaWRzVG9EZWxldGUgPSBBcnJheS5mcm9tKHRvRGVsZXRlKS5maWx0ZXIoaWQgPT4gaWQuc3RhcnRzV2l0aChpZFByZWZpeCkpO1xuXHRcdGNvbnN0IGVudHJpZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdGxldCBlbnRyeUluZGV4ID0gMDtcblxuXHRcdGlmIChwYXJhbXMuY29udGVudCkge1xuXHRcdFx0Zm9yIChjb25zdCBibG9jayBvZiBwYXJhbXMuY29udGVudCkge1xuXHRcdFx0XHRjb25zdCBpZCA9IGAke2lkUHJlZml4fSR7ZW50cnlJbmRleCsrfWA7XG5cdFx0XHRcdGlmIChibG9jay50eXBlID09PSAnaW1hZ2UnKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogZGVjb2RlQmFzZTY0KGJsb2NrLmRhdGEpLmJ1ZmZlcixcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0bmFtZTogJ0ltYWdlJyxcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiBibG9jay5taW1lVHlwZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChibG9jay50eXBlID09PSAncmVzb3VyY2VfbGluaycpIHtcblx0XHRcdFx0XHRjb25zdCB1cmkgPSB0aGlzLl9yZXNvbHZlU2VydmVyUmVzb3VyY2VVcmkoYmxvY2sudXJpKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHVyaSxcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChibG9jay50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRjb25zdCBwcmV2aWV3ID0gYmxvY2sudGV4dC5yZXBsYWNlQWxsKC9cXHMrL2csICcgJykudHJpbSgpO1xuXHRcdFx0XHRcdGNvbnN0IHRydW5jYXRlVG8gPSAyMDtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGJsb2NrLnRleHQsXG5cdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygncGxhaW50ZXh0JywgYmxvY2sudGV4dCksXG5cdFx0XHRcdFx0XHRuYW1lOiBwcmV2aWV3Lmxlbmd0aCA+IHRydW5jYXRlVG8gPyBwcmV2aWV3LnNsaWNlKDAsIHRydW5jYXRlVG8pICsgJ1x1MjAyNicgOiBwcmV2aWV3LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHBhcmFtcy5zdHJ1Y3R1cmVkQ29udGVudCAmJiBPYmplY3Qua2V5cyhwYXJhbXMuc3RydWN0dXJlZENvbnRlbnQpLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGlkID0gYCR7aWRQcmVmaXh9c3RydWN0dXJlZGA7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHBhcmFtcy5zdHJ1Y3R1cmVkQ29udGVudCwgbnVsbCwgMik7XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdHZhbHVlLFxuXHRcdFx0XHR0b29sdGlwOiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRDb2RlYmxvY2soJ2pzb24nLCB2YWx1ZSksXG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRuYW1lOiAnVUkgRGF0YScsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLnVwZGF0ZUNvbnRleHQoaWRzVG9EZWxldGUsIGVudHJpZXMpO1xuXG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlU2l6ZUNoYW5nZWQocGFyYW1zOiBNY3BBcHBzLk1jcFVpU2l6ZUNoYW5nZWROb3RpZmljYXRpb25bJ3BhcmFtcyddKTogdm9pZCB7XG5cdFx0aWYgKHBhcmFtcy5oZWlnaHQgIT09IHVuZGVmaW5lZCAmJiBwYXJhbXMuaGVpZ2h0ICE9PSB0aGlzLl9oZWlnaHQpIHtcblx0XHRcdHRoaXMuX2hlaWdodCA9IHBhcmFtcy5oZWlnaHQ7XG5cdFx0XHRDaGF0TWNwQXBwTW9kZWwuaGVpZ2h0Q2FjaGUuc2V0KHRoaXMudG9vbEludm9jYXRpb24sIHBhcmFtcy5oZWlnaHQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVNhbmRib3hXaGVlbChwYXJhbXM6IE1jcEFwcHMuQ3VzdG9tU2FuZGJveFdoZWVsTm90aWZpY2F0aW9uWydwYXJhbXMnXSk6IHZvaWQge1xuXHRcdGxldCBkZWZhdWx0UHJldmVudGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZXZ0OiBQYXJ0aWFsPElNb3VzZVdoZWVsRXZlbnQ+ID0ge1xuXHRcdFx0d2hlZWxEZWx0YVg6IHBhcmFtcy5kZWx0YVgsXG5cdFx0XHR3aGVlbERlbHRhWTogLXBhcmFtcy5kZWx0YVksXG5cdFx0XHR3aGVlbERlbHRhOiBNYXRoLmFicyhwYXJhbXMuZGVsdGFZKSxcblxuXHRcdFx0ZGVsdGFYOiBwYXJhbXMuZGVsdGFYLFxuXHRcdFx0ZGVsdGFZOiAtcGFyYW1zLmRlbHRhWSxcblx0XHRcdGRlbHRhWjogcGFyYW1zLmRlbHRhWixcblx0XHRcdGRlbHRhTW9kZTogcGFyYW1zLmRlbHRhTW9kZSxcblx0XHRcdHByZXZlbnREZWZhdWx0OiAoKSA9PiB7XG5cdFx0XHRcdGRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHN0b3BQcm9wYWdhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0Z2V0IGRlZmF1bHRQcmV2ZW50ZWQoKSB7XG5cdFx0XHRcdHJldHVybiBkZWZhdWx0UHJldmVudGVkO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSh0aGlzLnJlbmRlckRhdGEuc2Vzc2lvblJlc291cmNlKTtcblx0XHR3aWRnZXQ/LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChldnQgYXMgSU1vdXNlV2hlZWxFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVEb3dubG9hZEZpbGUocGFyYW1zOiBNY3BBcHBzLk1jcFVpRG93bmxvYWRGaWxlUmVxdWVzdFsncGFyYW1zJ10pOiBQcm9taXNlPE1jcEFwcHMuTWNwVWlEb3dubG9hZEZpbGVSZXN1bHQ+IHtcblx0XHRjb25zdCBuZXdQYXJ0czogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXSA9IFtdO1xuXHRcdGxldCBoYWRFcnJvciA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBjb250ZW50IG9mIHBhcmFtcy5jb250ZW50cykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGNvbnRlbnQudHlwZSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0XHRcdC8vIEVtYmVkZGVkUmVzb3VyY2UgXHUyMDE0IGFzc29jaWF0ZSBpbmxpbmUgY29udGVudCB3aXRoIHRoZSBjaGF0IHJlc3BvbnNlIEZTXG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBjb250ZW50LnJlc291cmNlO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZCA9IFVSSS5wYXJzZShyZXNvdXJjZS51cmkpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZGF0YTogVWludDhBcnJheSB8IHsgYmFzZTY0OiBzdHJpbmcgfSA9IGhhc0tleShyZXNvdXJjZSwgeyB0ZXh0OiB0cnVlIH0pXG5cdFx0XHRcdFx0XHQ/IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShyZXNvdXJjZS50ZXh0KVxuXHRcdFx0XHRcdFx0OiB7IGJhc2U2NDogcmVzb3VyY2UuYmxvYiB9O1xuXG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gdGhpcy5fY2hhdFJlc3BvbnNlUmVzb3VyY2VGc1Byb3ZpZGVyLmFzc29jaWF0ZSh0aGlzLnJlbmRlckRhdGEuc2Vzc2lvblJlc291cmNlLCBkYXRhLCBiYXNlbmFtZShwYXJzZWQpKTtcblx0XHRcdFx0XHRuZXdQYXJ0cy5wdXNoKHsga2luZDogJ2RhdGEnLCBtaW1lVHlwZTogcmVzb3VyY2UubWltZVR5cGUsIHVyaSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChjb250ZW50LnR5cGUgPT09ICdyZXNvdXJjZV9saW5rJykge1xuXHRcdFx0XHRcdC8vIFJlc291cmNlTGluayBcdTIwMTQgY3JlYXRlIGEgcGFydCB3aXRoIGFuIE1DUCByZXNvdXJjZSBVUkksIHJlc29sdmVkIGxhemlseSBvbiBzYXZlXG5cdFx0XHRcdFx0Y29uc3QgbWNwVXJpID0gdGhpcy5fcmVzb2x2ZVNlcnZlclJlc291cmNlVXJpKGNvbnRlbnQudXJpKTtcblx0XHRcdFx0XHRuZXdQYXJ0cy5wdXNoKHsga2luZDogJ2RhdGEnLCBtaW1lVHlwZTogY29udGVudC5taW1lVHlwZSwgdXJpOiBtY3BVcmkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGhhZEVycm9yID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbTUNQIEFwcF0gRmFpbGVkIHRvIHByb2Nlc3MgdWkvZG93bmxvYWQtZmlsZSBjb250ZW50JywgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChuZXdQYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2Rvd25sb2FkUGFydHMuZ2V0KCk7XG5cdFx0XHR0aGlzLl9kb3dubG9hZFBhcnRzLnNldChbLi4uZXhpc3RpbmcsIC4uLm5ld1BhcnRzXSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaGFkRXJyb3IgPyB7IGlzRXJyb3I6IHRydWUgfSA6IHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlT3BlbkxpbmsocGFyYW1zOiBNY3BBcHBzLk1jcFVpT3BlbkxpbmtSZXF1ZXN0WydwYXJhbXMnXSk6IFByb21pc2U8TWNwQXBwcy5NY3BVaU9wZW5MaW5rUmVzdWx0PiB7XG5cdFx0Ly8gVGhlIE1DUCBBcHBzIHByb3RvY29sIHNjb3BlcyB1aS9vcGVuLWxpbmsgdG8gXCJvcGVuIGFuIGV4dGVybmFsIFVSTCBpblxuXHRcdC8vIHRoZSBob3N0J3MgZGVmYXVsdCBicm93c2VyXCIuIFJlc3RyaWN0IHRvIGh0dHAvaHR0cHMgc28gZ3Vlc3QgY29udGVudFxuXHRcdC8vIGNhbm5vdCByZWFjaCBpbnRlcm5hbCBwcm9kdWN0LXNjaGVtZSBVUkwgaGFuZGxlcnMgKGUuZy4gZm9yZ2luZyBhblxuXHRcdC8vIGF1dGggY2FsbGJhY2spIHRocm91Z2ggdGhpcyBjYXBhYmlsaXR5LlxuXHRcdGxldCBwYXJzZWQ6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gVVJJLnBhcnNlKHBhcmFtcy51cmwsIHRydWUpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTUNQIEFwcF0gUmVqZWN0ZWQgdWkvb3Blbi1saW5rIHdpdGggdW5wYXJzZWFibGUgVVJMYCk7XG5cdFx0XHRyZXR1cm4geyBpc0Vycm9yOiB0cnVlIH07XG5cdFx0fVxuXHRcdGlmIChwYXJzZWQuc2NoZW1lICE9PSAnaHR0cCcgJiYgcGFyc2VkLnNjaGVtZSAhPT0gJ2h0dHBzJykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTUNQIEFwcF0gUmVqZWN0ZWQgdWkvb3Blbi1saW5rIHdpdGggbm9uLWh0dHAocykgc2NoZW1lOiAke3BhcnNlZC5zY2hlbWV9YCk7XG5cdFx0XHRyZXR1cm4geyBpc0Vycm9yOiB0cnVlIH07XG5cdFx0fVxuXHRcdGNvbnN0IG9rID0gYXdhaXQgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKHBhcnNlZCwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHsgaXNFcnJvcjogIW9rIH07XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0b29scy9jYWxsIHJlcXVlc3RzIGZyb20gdGhlIE1DUCBBcHAuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVUb29sc0NhbGwocGFyYW1zOiBNQ1AuQ2FsbFRvb2xSZXF1ZXN0UGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4ge1xuXHRcdGlmICghcGFyYW1zPy5uYW1lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdG9vbCBuYW1lIGluIHRvb2xzL2NhbGwgcmVxdWVzdCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9tY3BUb29sQ2FsbFVJLmNhbGxUb29sKHBhcmFtcy5uYW1lLCBwYXJhbXMuYXJndW1lbnRzIHx8IHt9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyByZXNvdXJjZXMvcmVhZCByZXF1ZXN0cyBmcm9tIHRoZSBNQ1AgQXBwLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUmVzb3VyY2VzUmVhZChwYXJhbXM6IE1DUC5SZWFkUmVzb3VyY2VSZXF1ZXN0UGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZWFkUmVzb3VyY2VSZXN1bHQ+IHtcblx0XHRpZiAoIXBhcmFtcz8udXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXJpIGluIHJlc291cmNlcy9yZWFkIHJlcXVlc3QnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbWNwVG9vbENhbGxVSS5yZWFkUmVzb3VyY2UocGFyYW1zLnVyaSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgc2FtcGxpbmcvY3JlYXRlTWVzc2FnZSByZXF1ZXN0cyBmcm9tIHRoZSBNQ1AgQXBwLiBGb3J3YXJkZWRcblx0ICogdG8gdGhlIGhvc3Qtc2lkZSBzYW1wbGluZyBpbXBsZW1lbnRhdGlvbiB0aHJvdWdoIHRoZSB1bmRlcmx5aW5nXG5cdCAqIHRyYW5zcG9ydCAodHlwaWNhbGx5IGFuIGFnZW50IGhvc3QgdGhhdCBvd25zIHRoZSBNQ1Agc2VydmVyKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVNhbXBsaW5nQ3JlYXRlTWVzc2FnZShwYXJhbXM6IE1DUC5DcmVhdGVNZXNzYWdlUmVxdWVzdFBhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ3JlYXRlTWVzc2FnZVJlc3VsdD4ge1xuXHRcdGlmICghcGFyYW1zKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgcGFyYW1zIGluIHNhbXBsaW5nL2NyZWF0ZU1lc3NhZ2UgcmVxdWVzdCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWNwVG9vbENhbGxVSS5zYW1wbGluZyhwYXJhbXMsIHRva2VuKTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHByaXZhdGUgYXN5bmMgX3NlbmRSZXNwb25zZShpZDogbnVtYmVyIHwgc3RyaW5nLCByZXN1bHQ6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3dlYnZpZXcucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZCxcblx0XHRcdHJlc3VsdCxcblx0XHR9IHNhdGlzZmllcyBNQ1AuSlNPTlJQQ1Jlc3BvbnNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRFcnJvcihpZDogbnVtYmVyIHwgc3RyaW5nLCBjb2RlOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3dlYnZpZXcucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZCxcblx0XHRcdGVycm9yOiB7IGNvZGUsIG1lc3NhZ2UgfSxcblx0XHR9IHNhdGlzZmllcyBNQ1AuSlNPTlJQQ0Vycm9yUmVzcG9uc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZE5vdGlmaWNhdGlvbihtZXNzYWdlOiBNY3BBcHBzLkhvc3ROb3RpZmljYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3LnBvc3RNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0Li4ubWVzc2FnZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2VDdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUFTLHNC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
