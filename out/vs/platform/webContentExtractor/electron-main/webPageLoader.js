import { Queue, raceTimeout, TimeoutTimer } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { convertAXTreeToMarkdown } from "./cdpAccessibilityDomain.js";
const _WebPageLoader = class _WebPageLoader extends Disposable {
  constructor(browserWindowFactory, _logger, _uri, _options, _isTrustedDomain, _agentNetworkFilterService) {
    super();
    this._logger = _logger;
    this._uri = _uri;
    this._options = _options;
    this._isTrustedDomain = _isTrustedDomain;
    this._agentNetworkFilterService = _agentNetworkFilterService;
    this._requests = /* @__PURE__ */ new Set();
    this._queue = this._register(new Queue());
    this._timeout = this._register(new TimeoutTimer());
    this._idleDebounceTimer = this._register(new TimeoutTimer());
    this._onResult = (_result) => {
    };
    this._didFinishLoad = false;
    this._receivedMarkdown = false;
    this._window = browserWindowFactory({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        partition: generateUuid(),
        // do not share any state with the default renderer session
        javascript: true,
        offscreen: true,
        sandbox: true,
        webgl: false
      }
    });
    this._register(toDisposable(() => this._window.destroy()));
    this._debugger = this._window.webContents.debugger;
    this._debugger.attach("1.1");
    this._debugger.on("message", this.onDebugMessage.bind(this));
    this._window.webContents.once("did-start-loading", this.onStartLoading.bind(this)).once("did-finish-load", this.onFinishLoad.bind(this)).once("did-fail-load", this.onFailLoad.bind(this)).on("will-navigate", this.onRedirect.bind(this)).on("will-redirect", this.onRedirect.bind(this)).on("select-client-certificate", (event) => event.preventDefault());
    this._window.webContents.session.webRequest.onBeforeSendHeaders(
      this.onBeforeSendHeaders.bind(this)
    );
    this._window.webContents.session.webRequest.onHeadersReceived(
      this.onHeadersReceived.bind(this)
    );
    this._window.webContents.session.on("will-download", this.onDownload.bind(this));
  }
  trace(message) {
    this._logger.trace(`[WebPageLoader] [${this._uri}] ${message}`);
  }
  /**
   * Loads the web page and extracts its content.
   */
  async load() {
    return await new Promise((resolve) => {
      this._onResult = createSingleCallFunction((result) => {
        switch (result.status) {
          case "ok":
            this.trace(`Loaded web page content, status: ${result.status}, title: '${result.title}', length: ${result.result.length}`);
            break;
          case "redirect":
            this.trace(`Loaded web page content, status: ${result.status}, toURI: ${result.toURI}`);
            break;
          case "error":
            this.trace(`Loaded web page content, status: ${result.status}, code: ${result.statusCode}, error: '${result.error}', title: '${result.title}', length: ${result.result?.length ?? 0}`);
            break;
        }
        const content = result.status !== "redirect" ? result.result : void 0;
        if (content !== void 0) {
          this.trace(content.length < 200 ? `Extracted content: '${content}'` : `Extracted content preview: '${content.substring(0, 200)}...'`);
        }
        resolve(result);
        this.dispose();
      });
      this.trace(`Loading web page content`);
      void this._window.loadURL(this._uri.toString(true));
      this.setTimeout(_WebPageLoader.TIMEOUT);
    });
  }
  /**
   * Sets a timeout to trigger content extraction regardless of current loading state.
   */
  setTimeout(time) {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Setting page load timeout to ${time} ms`);
    this._timeout.cancelAndSet(() => {
      this.trace(`Page load timeout reached`);
      void this._queue.queue(() => this.extractContent());
    }, time);
  }
  /**
   * Updates HTTP headers for each web request.
   */
  onBeforeSendHeaders(details, callback) {
    const headers = { ...details.requestHeaders };
    headers["DNT"] = "1";
    headers["Sec-GPC"] = "1";
    if (details.resourceType === "mainFrame") {
      headers["Accept"] = "text/markdown, text/html;q=0.9, application/xhtml+xml;q=0.9, application/xml;q=0.8, */*;q=0.7";
    }
    callback({ requestHeaders: headers });
  }
  /**
   * Checks response headers for download-triggering Content-Disposition.
   * For text-based content types, replaces it with 'inline' so the content
   * is rendered and can be extracted. For binary content, cancels the response.
   */
  onHeadersReceived(details, callback) {
    const headers = details.responseHeaders;
    if (headers) {
      let hasAttachment = false;
      let attachmentHeaderName;
      let contentType;
      for (const name of Object.keys(headers)) {
        const lowerName = name.toLowerCase();
        if (lowerName === "content-disposition" && headers[name]?.some((v) => v.toLowerCase().includes("attachment"))) {
          hasAttachment = true;
          attachmentHeaderName = name;
        }
        if (lowerName === "content-type") {
          contentType = headers[name]?.[0]?.toLowerCase();
        }
      }
      if (details.resourceType === "mainFrame") {
        this._receivedMarkdown = contentType?.split(";")[0].trim() === "text/markdown";
        if (this._receivedMarkdown) {
          this.trace("Received text/markdown response, will extract document text content directly");
        }
      }
      if (hasAttachment && attachmentHeaderName) {
        if (this.isTextMimeType(contentType)) {
          this.trace(`Replacing Content-Disposition: attachment with inline for ${details.url} (content-type: ${contentType})`);
          headers[attachmentHeaderName] = ["inline"];
          callback({ responseHeaders: headers, cancel: false });
        } else {
          this.trace(`Blocked binary download (Content-Disposition: attachment, content-type: ${contentType}) for ${details.url}`);
          callback({ cancel: true });
        }
        return;
      }
    }
    callback({ cancel: false });
  }
  isTextMimeType(contentType) {
    const mimeType = contentType?.split(";")[0].trim();
    return !!mimeType && _WebPageLoader.TEXT_MIME_TYPE_RE.test(mimeType);
  }
  /**
   * Handles the 'will-download' event, blocking any downloads.
   */
  onDownload(_event, item) {
    const filename = item.getFilename();
    this.trace(`Blocked download: ${filename}`);
    item.cancel();
    void this._queue.queue(() => this.extractContent({ status: "error", error: `Download not allowed: ${filename}` }));
  }
  /**
   * Handles the 'did-start-loading' event, enabling network tracking.
   */
  onStartLoading() {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'did-start-loading' event`);
    void this._debugger.sendCommand("Network.enable").catch(() => {
    });
  }
  /**
   * Handles the 'did-finish-load' event, checking for idle state
   * and updating timeout to allow for post-load activities.
   */
  onFinishLoad() {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'did-finish-load' event`);
    this._didFinishLoad = true;
    this.scheduleIdleCheck();
    this.setTimeout(_WebPageLoader.POST_LOAD_TIMEOUT);
  }
  /**
   * Handles the 'did-fail-load' event, reporting load failures.
   */
  onFailLoad(_event, statusCode, error) {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'did-fail-load' event, code: ${statusCode}, error: '${error}'`);
    if (statusCode === -3) {
      this.trace(`Ignoring ERR_ABORTED (-3) as it may be caused by CSP or other measures`);
      void this._queue.queue(() => this.extractContent());
    } else if (statusCode === -27) {
      this.trace(`Ignoring ERR_BLOCKED_BY_CLIENT (-27) as it may be caused by ad-blockers or similar extensions`);
      void this._queue.queue(() => this.extractContent());
    } else {
      void this._queue.queue(() => this.extractContent({ status: "error", statusCode, error }));
    }
  }
  /**
   * Handles the 'will-navigate' and 'will-redirect' events, managing redirects.
   */
  onRedirect(event, url) {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'will-navigate' or 'will-redirect' event, url: ${url}`);
    const toURI = URI.parse(url);
    if (!this._agentNetworkFilterService.isUriAllowed(toURI)) {
      this.trace(`Blocking navigation to ${url} (blocked by domain filter policy)`);
      event.preventDefault();
      this._onResult({ status: "error", error: this._agentNetworkFilterService.formatError(toURI) });
      return;
    }
    if (!this._options?.followRedirects) {
      if (this.normalizeAuthority(toURI.authority) === this.normalizeAuthority(this._uri.authority)) {
        return;
      }
      if (this._isTrustedDomain(toURI)) {
        return;
      }
      if (this._didFinishLoad) {
        this.trace(`Blocking post-load navigation to ${url} (likely ad/tracker script)`);
        event.preventDefault();
        return;
      }
      event.preventDefault();
      this._onResult({ status: "redirect", toURI });
    }
  }
  /**
   * Normalizes an authority by removing the 'www.' prefix if present.
   */
  normalizeAuthority(authority) {
    return authority.toLowerCase().replace(/^www\./, "");
  }
  /**
   * Handles debugger messages related to network requests, tracking their lifecycle.
   * @note DO NOT add logging to this function, microsoft.com will freeze when too many logs are generated
   */
  onDebugMessage(_event, method, params) {
    if (this._store.isDisposed) {
      return;
    }
    const { requestId, type, response } = params;
    switch (method) {
      case "Network.requestWillBeSent":
        if (requestId !== void 0) {
          this._requests.add(requestId);
          this._idleDebounceTimer.cancel();
        }
        break;
      case "Network.loadingFinished":
      case "Network.loadingFailed":
        if (requestId !== void 0) {
          this._requests.delete(requestId);
          if (this._requests.size === 0 && this._didFinishLoad) {
            this.scheduleIdleCheck();
          }
        }
        break;
      case "Network.responseReceived":
        if (type === "Document") {
          const statusCode = response?.status ?? 0;
          if (statusCode >= 400) {
            const error = response?.statusText || `HTTP error ${statusCode}`;
            void this._queue.queue(() => this.extractContent({ status: "error", statusCode, error }));
          }
        }
        break;
    }
  }
  /**
   * Schedules an idle check after a debounce period to allow for bursts of network activity.
   * If idle is detected, proceeds to extract content.
   */
  scheduleIdleCheck() {
    if (this._store.isDisposed) {
      return;
    }
    this._idleDebounceTimer.cancelAndSet(async () => {
      if (this._store.isDisposed) {
        return;
      }
      await this.nextFrame();
      if (this._requests.size === 0) {
        this._queue.queue(() => this.extractContent());
      } else {
        this.trace(`New network requests detected, deferring content extraction`);
      }
    }, _WebPageLoader.IDLE_DEBOUNCE_TIME);
  }
  /**
   * Waits for a rendering frame to ensure the page had a chance to update.
   */
  async nextFrame() {
    if (this._store.isDisposed) {
      return;
    }
    await raceTimeout(
      new Promise((resolve) => {
        try {
          this.trace(`Waiting for a frame to be rendered`);
          this._window.webContents.beginFrameSubscription(false, () => {
            try {
              this.trace(`A frame has been rendered`);
              this._window.webContents.endFrameSubscription();
            } catch {
            }
            resolve();
          });
        } catch {
          resolve();
        }
      }),
      _WebPageLoader.FRAME_TIMEOUT
    );
  }
  /**
   * Extracts the content of the loaded web page using the Accessibility domain and reports the result.
   */
  async extractContent(errorResult) {
    if (this._store.isDisposed) {
      return;
    }
    try {
      const title = this._window.webContents.getTitle();
      let result = "";
      const cts = new CancellationTokenSource();
      try {
        await raceTimeout((async () => {
          if (this._receivedMarkdown) {
            this.trace("Extracting markdown text content from document");
            result = await this._window.webContents.executeJavaScript('document.body?.textContent ?? document.documentElement?.textContent ?? ""') ?? "";
            return;
          }
          if (!cts.token.isCancellationRequested) {
            result = await this.extractAccessibilityTreeContent(cts.token) ?? "";
          }
          if (!cts.token.isCancellationRequested && result.length < _WebPageLoader.MIN_CONTENT_LENGTH) {
            this.trace(`Accessibility tree extraction yielded insufficient content, trying main DOM element extraction`);
            const domContent = await this.extractMainDomElementContent() ?? "";
            result = domContent.length > result.length ? domContent : result;
          }
        })(), _WebPageLoader.EXTRACT_CONTENT_TIMEOUT);
      } finally {
        cts.cancel();
        cts.dispose();
      }
      if (result.length === 0) {
        this._onResult({ status: "error", error: "Failed to extract meaningful content from the web page" });
      } else if (errorResult !== void 0) {
        this._onResult({ ...errorResult, result, title });
      } else {
        this._onResult({ status: "ok", result, title });
      }
    } catch (e) {
      if (errorResult !== void 0) {
        this._onResult(errorResult);
      } else {
        this._onResult({
          status: "error",
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
  }
  /**
   * Extracts content from the Accessibility tree of the loaded web page.
   * @param token Cancellation token to abort the operation.
   * @return The extracted content, or undefined if extraction fails or is cancelled.
   */
  async extractAccessibilityTreeContent(token) {
    this.trace(`Extracting content using Accessibility domain`);
    try {
      await this._debugger.sendCommand("Page.enable");
      if (token.isCancellationRequested) {
        return void 0;
      }
      const { frameTree } = await this._debugger.sendCommand("Page.getFrameTree");
      if (token.isCancellationRequested) {
        return void 0;
      }
      const frameNodes = [frameTree];
      for (let i = 0; i < frameNodes.length; i++) {
        frameNodes.push(...frameNodes[i].childFrames ?? []);
      }
      const allNodes = [];
      for (const { frame } of frameNodes) {
        try {
          const { nodes } = await this._debugger.sendCommand("Accessibility.getFullAXTree", { frameId: frame.id });
          allNodes.push(...nodes);
          if (token.isCancellationRequested) {
            return void 0;
          }
        } catch {
        }
      }
      return convertAXTreeToMarkdown(this._uri, allNodes);
    } catch (error) {
      this.trace(`Accessibility tree extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
  /**
   * Fallback method for extracting web page content when Accessibility tree extraction yields insufficient content.
   * Attempts to extract meaningful text content from the main DOM elements of the loaded web page.
   * @returns The extracted text content, or undefined if extraction fails.
   */
  async extractMainDomElementContent() {
    try {
      this.trace(`Extracting content from main DOM element`);
      return await this._window.webContents.executeJavaScript(`
				(() => {
					const selectors = ['main','article','[role="main"]','.main-content','#main-content','.article-body','.post-content','.entry-content','.content','body'];
					for (const selector of selectors) {
						const content = document.querySelector(selector)?.textContent?.replace(/[ \\t]+/g, ' ').replace(/\\s{2,}/gm, '\\n').trim();
						if (content && content.length > ${_WebPageLoader.MIN_CONTENT_LENGTH}) {
							return content;
						}
					}
					return undefined;
				})();
			`);
    } catch (error) {
      this.trace(`DOM extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
};
_WebPageLoader.TIMEOUT = 3e4;
// 30 seconds
_WebPageLoader.POST_LOAD_TIMEOUT = 5e3;
// 5 seconds - increased for dynamic content
_WebPageLoader.FRAME_TIMEOUT = 500;
// 0.5 seconds
_WebPageLoader.EXTRACT_CONTENT_TIMEOUT = 2e3;
// 2 seconds
_WebPageLoader.IDLE_DEBOUNCE_TIME = 500;
// 0.5 seconds - wait after last network request
_WebPageLoader.MIN_CONTENT_LENGTH = 100;
/**
 * Returns whether the given MIME type represents text-based content
 * that can be meaningfully rendered and extracted.
 */
_WebPageLoader.TEXT_MIME_TYPE_RE = /^(?:text\/|application\/(?:json|xml|xhtml\+xml|rss\+xml|atom\+xml|svg\+xml|javascript|ecmascript|x-yaml|yaml|toml|.*\+(?:xml|json))$)/;
let WebPageLoader = _WebPageLoader;
export {
  WebPageLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvZWxlY3Ryb24tbWFpbi93ZWJQYWdlTG9hZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBCZWZvcmVTZW5kUmVzcG9uc2UsIEJyb3dzZXJXaW5kb3csIEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMsIEV2ZW50LCBIZWFkZXJzUmVjZWl2ZWRSZXNwb25zZSwgT25CZWZvcmVTZW5kSGVhZGVyc0xpc3RlbmVyRGV0YWlscywgT25IZWFkZXJzUmVjZWl2ZWRMaXN0ZW5lckRldGFpbHMgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBRdWV1ZSwgcmFjZVRpbWVvdXQsIFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdlYkNvbnRlbnRFeHRyYWN0b3JPcHRpb25zLCBXZWJDb250ZW50RXh0cmFjdFJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IEFYTm9kZSwgY29udmVydEFYVHJlZVRvTWFya2Rvd24gfSBmcm9tICcuL2NkcEFjY2Vzc2liaWxpdHlEb21haW4uanMnO1xuXG50eXBlIE5ldHdvcmtSZXF1ZXN0RXZlbnRQYXJhbXMgPSBSZWFkb25seTx7XG5cdHJlcXVlc3RJZD86IHN0cmluZztcblx0cmVxdWVzdD86IHsgdXJsPzogc3RyaW5nIH07XG5cdHJlc3BvbnNlPzogeyBzdGF0dXM/OiBudW1iZXI7IHN0YXR1c1RleHQ/OiBzdHJpbmcgfTtcblx0dHlwZT86IHN0cmluZztcbn0+O1xuXG50eXBlIEZyYW1lSW5mbyA9IFJlYWRvbmx5PHtcblx0aWQ6IHN0cmluZztcblx0dXJsPzogc3RyaW5nO1xuXHRuYW1lPzogc3RyaW5nO1xufT47XG5cbnR5cGUgRnJhbWVUcmVlTm9kZSA9IFJlYWRvbmx5PHtcblx0ZnJhbWU6IEZyYW1lSW5mbztcblx0Y2hpbGRGcmFtZXM/OiBGcmFtZVRyZWVOb2RlW107XG59PjtcblxuLyoqXG4gKiBBIHdlYiBwYWdlIGxvYWRlciB0aGF0IHVzZXMgRWxlY3Ryb24gdG8gbG9hZCB3ZWIgcGFnZXMgYW5kIGV4dHJhY3QgdGhlaXIgY29udGVudC5cbiAqL1xuZXhwb3J0IGNsYXNzIFdlYlBhZ2VMb2FkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVElNRU9VVCA9IDMwMDAwOyAvLyAzMCBzZWNvbmRzXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBPU1RfTE9BRF9USU1FT1VUID0gNTAwMDsgLy8gNSBzZWNvbmRzIC0gaW5jcmVhc2VkIGZvciBkeW5hbWljIGNvbnRlbnRcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRlJBTUVfVElNRU9VVCA9IDUwMDsgLy8gMC41IHNlY29uZHNcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRVhUUkFDVF9DT05URU5UX1RJTUVPVVQgPSAyMDAwOyAvLyAyIHNlY29uZHNcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSURMRV9ERUJPVU5DRV9USU1FID0gNTAwOyAvLyAwLjUgc2Vjb25kcyAtIHdhaXQgYWZ0ZXIgbGFzdCBuZXR3b3JrIHJlcXVlc3Rcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUlOX0NPTlRFTlRfTEVOR1RIID0gMTAwOyAvLyBNaW5pbXVtIGNvbnRlbnQgbGVuZ3RoIHRvIGNvbnNpZGVyIGV4dHJhY3Rpb24gc3VjY2Vzc2Z1bFxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvdzogQnJvd3NlcldpbmRvdztcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdnZXI6IEVsZWN0cm9uLkRlYnVnZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWV1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBRdWV1ZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGltZW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaW1lb3V0VGltZXIoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkbGVEZWJvdW5jZVRpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRpbWVvdXRUaW1lcigpKTtcblx0cHJpdmF0ZSBfb25SZXN1bHQgPSAoX3Jlc3VsdDogV2ViQ29udGVudEV4dHJhY3RSZXN1bHQpID0+IHsgfTtcblx0cHJpdmF0ZSBfZGlkRmluaXNoTG9hZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9yZWNlaXZlZE1hcmtkb3duID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YnJvd3NlcldpbmRvd0ZhY3Rvcnk6IChvcHRpb25zOiBCcm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zKSA9PiBCcm93c2VyV2luZG93LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcjogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdXJpOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVdlYkNvbnRlbnRFeHRyYWN0b3JPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzVHJ1c3RlZERvbWFpbjogKHVyaTogVVJJKSA9PiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2U6IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fd2luZG93ID0gYnJvd3NlcldpbmRvd0ZhY3Rvcnkoe1xuXHRcdFx0d2lkdGg6IDgwMCxcblx0XHRcdGhlaWdodDogNjAwLFxuXHRcdFx0c2hvdzogZmFsc2UsXG5cdFx0XHR3ZWJQcmVmZXJlbmNlczoge1xuXHRcdFx0XHRwYXJ0aXRpb246IGdlbmVyYXRlVXVpZCgpLCAvLyBkbyBub3Qgc2hhcmUgYW55IHN0YXRlIHdpdGggdGhlIGRlZmF1bHQgcmVuZGVyZXIgc2Vzc2lvblxuXHRcdFx0XHRqYXZhc2NyaXB0OiB0cnVlLFxuXHRcdFx0XHRvZmZzY3JlZW46IHRydWUsXG5cdFx0XHRcdHNhbmRib3g6IHRydWUsXG5cdFx0XHRcdHdlYmdsOiBmYWxzZSxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl93aW5kb3cuZGVzdHJveSgpKSk7XG5cblx0XHR0aGlzLl9kZWJ1Z2dlciA9IHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlcjtcblx0XHR0aGlzLl9kZWJ1Z2dlci5hdHRhY2goJzEuMScpO1xuXHRcdHRoaXMuX2RlYnVnZ2VyLm9uKCdtZXNzYWdlJywgdGhpcy5vbkRlYnVnTWVzc2FnZS5iaW5kKHRoaXMpKTtcblxuXHRcdHRoaXMuX3dpbmRvdy53ZWJDb250ZW50c1xuXHRcdFx0Lm9uY2UoJ2RpZC1zdGFydC1sb2FkaW5nJywgdGhpcy5vblN0YXJ0TG9hZGluZy5iaW5kKHRoaXMpKVxuXHRcdFx0Lm9uY2UoJ2RpZC1maW5pc2gtbG9hZCcsIHRoaXMub25GaW5pc2hMb2FkLmJpbmQodGhpcykpXG5cdFx0XHQub25jZSgnZGlkLWZhaWwtbG9hZCcsIHRoaXMub25GYWlsTG9hZC5iaW5kKHRoaXMpKVxuXHRcdFx0Lm9uKCd3aWxsLW5hdmlnYXRlJywgdGhpcy5vblJlZGlyZWN0LmJpbmQodGhpcykpXG5cdFx0XHQub24oJ3dpbGwtcmVkaXJlY3QnLCB0aGlzLm9uUmVkaXJlY3QuYmluZCh0aGlzKSlcblx0XHRcdC5vbignc2VsZWN0LWNsaWVudC1jZXJ0aWZpY2F0ZScsIChldmVudCkgPT4gZXZlbnQucHJldmVudERlZmF1bHQoKSk7XG5cblx0XHR0aGlzLl93aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uQmVmb3JlU2VuZEhlYWRlcnMoXG5cdFx0XHR0aGlzLm9uQmVmb3JlU2VuZEhlYWRlcnMuYmluZCh0aGlzKSk7XG5cblx0XHR0aGlzLl93aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkKFxuXHRcdFx0dGhpcy5vbkhlYWRlcnNSZWNlaXZlZC5iaW5kKHRoaXMpKTtcblxuXHRcdHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLm9uKCd3aWxsLWRvd25sb2FkJywgdGhpcy5vbkRvd25sb2FkLmJpbmQodGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmFjZShtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9sb2dnZXIudHJhY2UoYFtXZWJQYWdlTG9hZGVyXSBbJHt0aGlzLl91cml9XSAke21lc3NhZ2V9YCk7XG5cdH1cblxuXHQvKipcblx0ICogTG9hZHMgdGhlIHdlYiBwYWdlIGFuZCBleHRyYWN0cyBpdHMgY29udGVudC5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBsb2FkKCkge1xuXHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxXZWJDb250ZW50RXh0cmFjdFJlc3VsdD4oKHJlc29sdmUpID0+IHtcblx0XHRcdHRoaXMuX29uUmVzdWx0ID0gY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKChyZXN1bHQpID0+IHtcblx0XHRcdFx0c3dpdGNoIChyZXN1bHQuc3RhdHVzKSB7XG5cdFx0XHRcdFx0Y2FzZSAnb2snOlxuXHRcdFx0XHRcdFx0dGhpcy50cmFjZShgTG9hZGVkIHdlYiBwYWdlIGNvbnRlbnQsIHN0YXR1czogJHtyZXN1bHQuc3RhdHVzfSwgdGl0bGU6ICcke3Jlc3VsdC50aXRsZX0nLCBsZW5ndGg6ICR7cmVzdWx0LnJlc3VsdC5sZW5ndGh9YCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyZWRpcmVjdCc6XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKGBMb2FkZWQgd2ViIHBhZ2UgY29udGVudCwgc3RhdHVzOiAke3Jlc3VsdC5zdGF0dXN9LCB0b1VSSTogJHtyZXN1bHQudG9VUkl9YCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKGBMb2FkZWQgd2ViIHBhZ2UgY29udGVudCwgc3RhdHVzOiAke3Jlc3VsdC5zdGF0dXN9LCBjb2RlOiAke3Jlc3VsdC5zdGF0dXNDb2RlfSwgZXJyb3I6ICcke3Jlc3VsdC5lcnJvcn0nLCB0aXRsZTogJyR7cmVzdWx0LnRpdGxlfScsIGxlbmd0aDogJHtyZXN1bHQucmVzdWx0Py5sZW5ndGggPz8gMH1gKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHJlc3VsdC5zdGF0dXMgIT09ICdyZWRpcmVjdCcgPyByZXN1bHQucmVzdWx0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY29udGVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy50cmFjZShjb250ZW50Lmxlbmd0aCA8IDIwMCA/IGBFeHRyYWN0ZWQgY29udGVudDogJyR7Y29udGVudH0nYCA6IGBFeHRyYWN0ZWQgY29udGVudCBwcmV2aWV3OiAnJHtjb250ZW50LnN1YnN0cmluZygwLCAyMDApfS4uLidgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy50cmFjZShgTG9hZGluZyB3ZWIgcGFnZSBjb250ZW50YCk7XG5cdFx0XHR2b2lkIHRoaXMuX3dpbmRvdy5sb2FkVVJMKHRoaXMuX3VyaS50b1N0cmluZyh0cnVlKSk7XG5cdFx0XHR0aGlzLnNldFRpbWVvdXQoV2ViUGFnZUxvYWRlci5USU1FT1VUKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIGEgdGltZW91dCB0byB0cmlnZ2VyIGNvbnRlbnQgZXh0cmFjdGlvbiByZWdhcmRsZXNzIG9mIGN1cnJlbnQgbG9hZGluZyBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgc2V0VGltZW91dCh0aW1lOiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoYFNldHRpbmcgcGFnZSBsb2FkIHRpbWVvdXQgdG8gJHt0aW1lfSBtc2ApO1xuXHRcdHRoaXMuX3RpbWVvdXQuY2FuY2VsQW5kU2V0KCgpID0+IHtcblx0XHRcdHRoaXMudHJhY2UoYFBhZ2UgbG9hZCB0aW1lb3V0IHJlYWNoZWRgKTtcblx0XHRcdHZvaWQgdGhpcy5fcXVldWUucXVldWUoKCkgPT4gdGhpcy5leHRyYWN0Q29udGVudCgpKTtcblx0XHR9LCB0aW1lKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIEhUVFAgaGVhZGVycyBmb3IgZWFjaCB3ZWIgcmVxdWVzdC5cblx0ICovXG5cdHByaXZhdGUgb25CZWZvcmVTZW5kSGVhZGVycyhkZXRhaWxzOiBPbkJlZm9yZVNlbmRIZWFkZXJzTGlzdGVuZXJEZXRhaWxzLCBjYWxsYmFjazogKGJlZm9yZVNlbmRSZXNwb25zZTogQmVmb3JlU2VuZFJlc3BvbnNlKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgaGVhZGVycyA9IHsgLi4uZGV0YWlscy5yZXF1ZXN0SGVhZGVycyB9O1xuXG5cdFx0Ly8gUmVxdWVzdCBwcml2YWN5IGZvciB3ZWItc2l0ZXMgdGhhdCByZXNwZWN0IHRoZXNlLlxuXHRcdGhlYWRlcnNbJ0ROVCddID0gJzEnO1xuXHRcdGhlYWRlcnNbJ1NlYy1HUEMnXSA9ICcxJztcblxuXHRcdC8vIEZvciB0aGUgbWFpbiBkb2N1bWVudCByZXF1ZXN0LCBwcmVmZXIgbWFya2Rvd24gcmVzcG9uc2VzIGZyb20gc2l0ZXMgdGhhdFxuXHRcdC8vIHN1cHBvcnQgYWdlbnQtZnJpZW5kbHkgY29udGVudCBuZWdvdGlhdGlvbiAoZS5nLiBNaWNyb3NvZnQgTGVhcm4sIENsb3VkZmxhcmUgZG9jcykuXG5cdFx0aWYgKGRldGFpbHMucmVzb3VyY2VUeXBlID09PSAnbWFpbkZyYW1lJykge1xuXHRcdFx0aGVhZGVyc1snQWNjZXB0J10gPSAndGV4dC9tYXJrZG93biwgdGV4dC9odG1sO3E9MC45LCBhcHBsaWNhdGlvbi94aHRtbCt4bWw7cT0wLjksIGFwcGxpY2F0aW9uL3htbDtxPTAuOCwgKi8qO3E9MC43Jztcblx0XHR9XG5cblx0XHRjYWxsYmFjayh7IHJlcXVlc3RIZWFkZXJzOiBoZWFkZXJzIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyByZXNwb25zZSBoZWFkZXJzIGZvciBkb3dubG9hZC10cmlnZ2VyaW5nIENvbnRlbnQtRGlzcG9zaXRpb24uXG5cdCAqIEZvciB0ZXh0LWJhc2VkIGNvbnRlbnQgdHlwZXMsIHJlcGxhY2VzIGl0IHdpdGggJ2lubGluZScgc28gdGhlIGNvbnRlbnRcblx0ICogaXMgcmVuZGVyZWQgYW5kIGNhbiBiZSBleHRyYWN0ZWQuIEZvciBiaW5hcnkgY29udGVudCwgY2FuY2VscyB0aGUgcmVzcG9uc2UuXG5cdCAqL1xuXHRwcml2YXRlIG9uSGVhZGVyc1JlY2VpdmVkKGRldGFpbHM6IE9uSGVhZGVyc1JlY2VpdmVkTGlzdGVuZXJEZXRhaWxzLCBjYWxsYmFjazogKGhlYWRlcnNSZWNlaXZlZFJlc3BvbnNlOiBIZWFkZXJzUmVjZWl2ZWRSZXNwb25zZSkgPT4gdm9pZCkge1xuXHRcdGNvbnN0IGhlYWRlcnMgPSBkZXRhaWxzLnJlc3BvbnNlSGVhZGVycztcblx0XHRpZiAoaGVhZGVycykge1xuXHRcdFx0bGV0IGhhc0F0dGFjaG1lbnQgPSBmYWxzZTtcblx0XHRcdGxldCBhdHRhY2htZW50SGVhZGVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGNvbnRlbnRUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGZvciAoY29uc3QgbmFtZSBvZiBPYmplY3Qua2V5cyhoZWFkZXJzKSkge1xuXHRcdFx0XHRjb25zdCBsb3dlck5hbWUgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmIChsb3dlck5hbWUgPT09ICdjb250ZW50LWRpc3Bvc2l0aW9uJyAmJiBoZWFkZXJzW25hbWVdPy5zb21lKHYgPT4gdi50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdhdHRhY2htZW50JykpKSB7XG5cdFx0XHRcdFx0aGFzQXR0YWNobWVudCA9IHRydWU7XG5cdFx0XHRcdFx0YXR0YWNobWVudEhlYWRlck5hbWUgPSBuYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsb3dlck5hbWUgPT09ICdjb250ZW50LXR5cGUnKSB7XG5cdFx0XHRcdFx0Y29udGVudFR5cGUgPSBoZWFkZXJzW25hbWVdPy5bMF0/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJhY2sgd2hldGhlciB0aGUgY3VycmVudCBtYWluLWZyYW1lIHJlc3BvbnNlIGlzIG1hcmtkb3duIChyZWRpcmVjdHMgY2FuIGNoYW5nZSBjb250ZW50LXR5cGUpXG5cdFx0XHRpZiAoZGV0YWlscy5yZXNvdXJjZVR5cGUgPT09ICdtYWluRnJhbWUnKSB7XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVkTWFya2Rvd24gPSBjb250ZW50VHlwZT8uc3BsaXQoJzsnKVswXS50cmltKCkgPT09ICd0ZXh0L21hcmtkb3duJztcblx0XHRcdFx0aWYgKHRoaXMuX3JlY2VpdmVkTWFya2Rvd24pIHtcblx0XHRcdFx0XHR0aGlzLnRyYWNlKCdSZWNlaXZlZCB0ZXh0L21hcmtkb3duIHJlc3BvbnNlLCB3aWxsIGV4dHJhY3QgZG9jdW1lbnQgdGV4dCBjb250ZW50IGRpcmVjdGx5Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGhhc0F0dGFjaG1lbnQgJiYgYXR0YWNobWVudEhlYWRlck5hbWUpIHtcblx0XHRcdFx0aWYgKHRoaXMuaXNUZXh0TWltZVR5cGUoY29udGVudFR5cGUpKSB7XG5cdFx0XHRcdFx0dGhpcy50cmFjZShgUmVwbGFjaW5nIENvbnRlbnQtRGlzcG9zaXRpb246IGF0dGFjaG1lbnQgd2l0aCBpbmxpbmUgZm9yICR7ZGV0YWlscy51cmx9IChjb250ZW50LXR5cGU6ICR7Y29udGVudFR5cGV9KWApO1xuXHRcdFx0XHRcdGhlYWRlcnNbYXR0YWNobWVudEhlYWRlck5hbWVdID0gWydpbmxpbmUnXTtcblx0XHRcdFx0XHRjYWxsYmFjayh7IHJlc3BvbnNlSGVhZGVyczogaGVhZGVycywgY2FuY2VsOiBmYWxzZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnRyYWNlKGBCbG9ja2VkIGJpbmFyeSBkb3dubG9hZCAoQ29udGVudC1EaXNwb3NpdGlvbjogYXR0YWNobWVudCwgY29udGVudC10eXBlOiAke2NvbnRlbnRUeXBlfSkgZm9yICR7ZGV0YWlscy51cmx9YCk7XG5cdFx0XHRcdFx0Y2FsbGJhY2soeyBjYW5jZWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UgfSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBNSU1FIHR5cGUgcmVwcmVzZW50cyB0ZXh0LWJhc2VkIGNvbnRlbnRcblx0ICogdGhhdCBjYW4gYmUgbWVhbmluZ2Z1bGx5IHJlbmRlcmVkIGFuZCBleHRyYWN0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBURVhUX01JTUVfVFlQRV9SRSA9IC9eKD86dGV4dFxcL3xhcHBsaWNhdGlvblxcLyg/Ompzb258eG1sfHhodG1sXFwreG1sfHJzc1xcK3htbHxhdG9tXFwreG1sfHN2Z1xcK3htbHxqYXZhc2NyaXB0fGVjbWFzY3JpcHR8eC15YW1sfHlhbWx8dG9tbHwuKlxcKyg/OnhtbHxqc29uKSkkKS87XG5cblx0cHJpdmF0ZSBpc1RleHRNaW1lVHlwZShjb250ZW50VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbWltZVR5cGUgPSBjb250ZW50VHlwZT8uc3BsaXQoJzsnKVswXS50cmltKCk7XG5cdFx0cmV0dXJuICEhbWltZVR5cGUgJiYgV2ViUGFnZUxvYWRlci5URVhUX01JTUVfVFlQRV9SRS50ZXN0KG1pbWVUeXBlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSAnd2lsbC1kb3dubG9hZCcgZXZlbnQsIGJsb2NraW5nIGFueSBkb3dubG9hZHMuXG5cdCAqL1xuXHRwcml2YXRlIG9uRG93bmxvYWQoX2V2ZW50OiBFdmVudCwgaXRlbTogRWxlY3Ryb24uRG93bmxvYWRJdGVtKSB7XG5cdFx0Y29uc3QgZmlsZW5hbWUgPSBpdGVtLmdldEZpbGVuYW1lKCk7XG5cdFx0dGhpcy50cmFjZShgQmxvY2tlZCBkb3dubG9hZDogJHtmaWxlbmFtZX1gKTtcblx0XHRpdGVtLmNhbmNlbCgpO1xuXHRcdHZvaWQgdGhpcy5fcXVldWUucXVldWUoKCkgPT4gdGhpcy5leHRyYWN0Q29udGVudCh7IHN0YXR1czogJ2Vycm9yJywgZXJyb3I6IGBEb3dubG9hZCBub3QgYWxsb3dlZDogJHtmaWxlbmFtZX1gIH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSAnZGlkLXN0YXJ0LWxvYWRpbmcnIGV2ZW50LCBlbmFibGluZyBuZXR3b3JrIHRyYWNraW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBvblN0YXJ0TG9hZGluZygpIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoYFJlY2VpdmVkICdkaWQtc3RhcnQtbG9hZGluZycgZXZlbnRgKTtcblx0XHR2b2lkIHRoaXMuX2RlYnVnZ2VyLnNlbmRDb21tYW5kKCdOZXR3b3JrLmVuYWJsZScpLmNhdGNoKCgpID0+IHtcblx0XHRcdC8vIFRoaXMgdGhyb3dzIHdoZW4gd2UgZGVzdHJveSB0aGUgd2luZG93IG9uIHJlZGlyZWN0LlxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlICdkaWQtZmluaXNoLWxvYWQnIGV2ZW50LCBjaGVja2luZyBmb3IgaWRsZSBzdGF0ZVxuXHQgKiBhbmQgdXBkYXRpbmcgdGltZW91dCB0byBhbGxvdyBmb3IgcG9zdC1sb2FkIGFjdGl2aXRpZXMuXG5cdCAqL1xuXHRwcml2YXRlIG9uRmluaXNoTG9hZCgpIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoYFJlY2VpdmVkICdkaWQtZmluaXNoLWxvYWQnIGV2ZW50YCk7XG5cdFx0dGhpcy5fZGlkRmluaXNoTG9hZCA9IHRydWU7XG5cdFx0dGhpcy5zY2hlZHVsZUlkbGVDaGVjaygpO1xuXHRcdHRoaXMuc2V0VGltZW91dChXZWJQYWdlTG9hZGVyLlBPU1RfTE9BRF9USU1FT1VUKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSAnZGlkLWZhaWwtbG9hZCcgZXZlbnQsIHJlcG9ydGluZyBsb2FkIGZhaWx1cmVzLlxuXHQgKi9cblx0cHJpdmF0ZSBvbkZhaWxMb2FkKF9ldmVudDogRXZlbnQsIHN0YXR1c0NvZGU6IG51bWJlciwgZXJyb3I6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZShgUmVjZWl2ZWQgJ2RpZC1mYWlsLWxvYWQnIGV2ZW50LCBjb2RlOiAke3N0YXR1c0NvZGV9LCBlcnJvcjogJyR7ZXJyb3J9J2ApO1xuXHRcdGlmIChzdGF0dXNDb2RlID09PSAtMykge1xuXHRcdFx0dGhpcy50cmFjZShgSWdub3JpbmcgRVJSX0FCT1JURUQgKC0zKSBhcyBpdCBtYXkgYmUgY2F1c2VkIGJ5IENTUCBvciBvdGhlciBtZWFzdXJlc2ApO1xuXHRcdFx0dm9pZCB0aGlzLl9xdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLmV4dHJhY3RDb250ZW50KCkpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdHVzQ29kZSA9PT0gLTI3KSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBJZ25vcmluZyBFUlJfQkxPQ0tFRF9CWV9DTElFTlQgKC0yNykgYXMgaXQgbWF5IGJlIGNhdXNlZCBieSBhZC1ibG9ja2VycyBvciBzaW1pbGFyIGV4dGVuc2lvbnNgKTtcblx0XHRcdHZvaWQgdGhpcy5fcXVldWUucXVldWUoKCkgPT4gdGhpcy5leHRyYWN0Q29udGVudCgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dm9pZCB0aGlzLl9xdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLmV4dHJhY3RDb250ZW50KHsgc3RhdHVzOiAnZXJyb3InLCBzdGF0dXNDb2RlLCBlcnJvciB9KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlICd3aWxsLW5hdmlnYXRlJyBhbmQgJ3dpbGwtcmVkaXJlY3QnIGV2ZW50cywgbWFuYWdpbmcgcmVkaXJlY3RzLlxuXHQgKi9cblx0cHJpdmF0ZSBvblJlZGlyZWN0KGV2ZW50OiBFdmVudCwgdXJsOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoYFJlY2VpdmVkICd3aWxsLW5hdmlnYXRlJyBvciAnd2lsbC1yZWRpcmVjdCcgZXZlbnQsIHVybDogJHt1cmx9YCk7XG5cblx0XHQvLyBDaGVjayBkb21haW4gZmlsdGVyIHBvbGljeSBmaXJzdCBcdTIwMTQgdGhpcyBhcHBsaWVzIHJlZ2FyZGxlc3Mgb2YgZm9sbG93UmVkaXJlY3RzXG5cdFx0Y29uc3QgdG9VUkkgPSBVUkkucGFyc2UodXJsKTtcblx0XHRpZiAoIXRoaXMuX2FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UuaXNVcmlBbGxvd2VkKHRvVVJJKSkge1xuXHRcdFx0dGhpcy50cmFjZShgQmxvY2tpbmcgbmF2aWdhdGlvbiB0byAke3VybH0gKGJsb2NrZWQgYnkgZG9tYWluIGZpbHRlciBwb2xpY3kpYCk7XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fb25SZXN1bHQoeyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiB0aGlzLl9hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLmZvcm1hdEVycm9yKHRvVVJJKSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX29wdGlvbnM/LmZvbGxvd1JlZGlyZWN0cykge1xuXHRcdFx0Ly8gQWxsb3cgcmVkaXJlY3QgaWYgYXV0aG9yaXR5IGlzIHRoZSBzYW1lIHdoZW4gaWdub3Jpbmcgd3d3IHByZWZpeFxuXHRcdFx0aWYgKHRoaXMubm9ybWFsaXplQXV0aG9yaXR5KHRvVVJJLmF1dGhvcml0eSkgPT09IHRoaXMubm9ybWFsaXplQXV0aG9yaXR5KHRoaXMuX3VyaS5hdXRob3JpdHkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWxsb3cgcmVkaXJlY3QgaWYgdGFyZ2V0IGlzIGEgdHJ1c3RlZCBkb21haW5cblx0XHRcdGlmICh0aGlzLl9pc1RydXN0ZWREb21haW4odG9VUkkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWdub3JlIHNjcmlwdC1pbml0aWF0ZWQgbmF2aWdhdGlvbiAoYWRzL3RyYWNrZXJzIGV0Yylcblx0XHRcdGlmICh0aGlzLl9kaWRGaW5pc2hMb2FkKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoYEJsb2NraW5nIHBvc3QtbG9hZCBuYXZpZ2F0aW9uIHRvICR7dXJsfSAobGlrZWx5IGFkL3RyYWNrZXIgc2NyaXB0KWApO1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE90aGVyd2lzZSwgcHJldmVudCByZWRpcmVjdCBhbmQgcmVwb3J0IGl0XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fb25SZXN1bHQoeyBzdGF0dXM6ICdyZWRpcmVjdCcsIHRvVVJJIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBOb3JtYWxpemVzIGFuIGF1dGhvcml0eSBieSByZW1vdmluZyB0aGUgJ3d3dy4nIHByZWZpeCBpZiBwcmVzZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBub3JtYWxpemVBdXRob3JpdHkoYXV0aG9yaXR5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBhdXRob3JpdHkudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgZGVidWdnZXIgbWVzc2FnZXMgcmVsYXRlZCB0byBuZXR3b3JrIHJlcXVlc3RzLCB0cmFja2luZyB0aGVpciBsaWZlY3ljbGUuXG5cdCAqIEBub3RlIERPIE5PVCBhZGQgbG9nZ2luZyB0byB0aGlzIGZ1bmN0aW9uLCBtaWNyb3NvZnQuY29tIHdpbGwgZnJlZXplIHdoZW4gdG9vIG1hbnkgbG9ncyBhcmUgZ2VuZXJhdGVkXG5cdCAqL1xuXHRwcml2YXRlIG9uRGVidWdNZXNzYWdlKF9ldmVudDogRXZlbnQsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IE5ldHdvcmtSZXF1ZXN0RXZlbnRQYXJhbXMpIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmVxdWVzdElkLCB0eXBlLCByZXNwb25zZSB9ID0gcGFyYW1zO1xuXHRcdHN3aXRjaCAobWV0aG9kKSB7XG5cdFx0XHRjYXNlICdOZXR3b3JrLnJlcXVlc3RXaWxsQmVTZW50Jzpcblx0XHRcdFx0aWYgKHJlcXVlc3RJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVxdWVzdHMuYWRkKHJlcXVlc3RJZCk7XG5cdFx0XHRcdFx0dGhpcy5faWRsZURlYm91bmNlVGltZXIuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdOZXR3b3JrLmxvYWRpbmdGaW5pc2hlZCc6XG5cdFx0XHRjYXNlICdOZXR3b3JrLmxvYWRpbmdGYWlsZWQnOlxuXHRcdFx0XHRpZiAocmVxdWVzdElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXF1ZXN0cy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fcmVxdWVzdHMuc2l6ZSA9PT0gMCAmJiB0aGlzLl9kaWRGaW5pc2hMb2FkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlSWRsZUNoZWNrKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnTmV0d29yay5yZXNwb25zZVJlY2VpdmVkJzpcblx0XHRcdFx0aWYgKHR5cGUgPT09ICdEb2N1bWVudCcpIHtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNDb2RlID0gcmVzcG9uc2U/LnN0YXR1cyA/PyAwO1xuXHRcdFx0XHRcdGlmIChzdGF0dXNDb2RlID49IDQwMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyb3IgPSByZXNwb25zZT8uc3RhdHVzVGV4dCB8fCBgSFRUUCBlcnJvciAke3N0YXR1c0NvZGV9YDtcblx0XHRcdFx0XHRcdHZvaWQgdGhpcy5fcXVldWUucXVldWUoKCkgPT4gdGhpcy5leHRyYWN0Q29udGVudCh7IHN0YXR1czogJ2Vycm9yJywgc3RhdHVzQ29kZSwgZXJyb3IgfSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2NoZWR1bGVzIGFuIGlkbGUgY2hlY2sgYWZ0ZXIgYSBkZWJvdW5jZSBwZXJpb2QgdG8gYWxsb3cgZm9yIGJ1cnN0cyBvZiBuZXR3b3JrIGFjdGl2aXR5LlxuXHQgKiBJZiBpZGxlIGlzIGRldGVjdGVkLCBwcm9jZWVkcyB0byBleHRyYWN0IGNvbnRlbnQuXG5cdCAqL1xuXHRwcml2YXRlIHNjaGVkdWxlSWRsZUNoZWNrKCkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faWRsZURlYm91bmNlVGltZXIuY2FuY2VsQW5kU2V0KGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5uZXh0RnJhbWUoKTtcblxuXHRcdFx0aWYgKHRoaXMuX3JlcXVlc3RzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcXVldWUucXVldWUoKCkgPT4gdGhpcy5leHRyYWN0Q29udGVudCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoYE5ldyBuZXR3b3JrIHJlcXVlc3RzIGRldGVjdGVkLCBkZWZlcnJpbmcgY29udGVudCBleHRyYWN0aW9uYCk7XG5cdFx0XHR9XG5cdFx0fSwgV2ViUGFnZUxvYWRlci5JRExFX0RFQk9VTkNFX1RJTUUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciBhIHJlbmRlcmluZyBmcmFtZSB0byBlbnN1cmUgdGhlIHBhZ2UgaGFkIGEgY2hhbmNlIHRvIHVwZGF0ZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgbmV4dEZyYW1lKCkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2FpdCBmb3IgYSByZW5kZXJpbmcgZnJhbWUgdG8gZW5zdXJlIHRoZSBwYWdlIGhhZCBhIGNoYW5jZSB0byB1cGRhdGUuXG5cdFx0YXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMudHJhY2UoYFdhaXRpbmcgZm9yIGEgZnJhbWUgdG8gYmUgcmVuZGVyZWRgKTtcblx0XHRcdFx0XHR0aGlzLl93aW5kb3cud2ViQ29udGVudHMuYmVnaW5GcmFtZVN1YnNjcmlwdGlvbihmYWxzZSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0dGhpcy50cmFjZShgQSBmcmFtZSBoYXMgYmVlbiByZW5kZXJlZGApO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl93aW5kb3cud2ViQ29udGVudHMuZW5kRnJhbWVTdWJzY3JpcHRpb24oKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHQvLyBpZ25vcmUgZXJyb3JzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSBlcnJvcnNcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0V2ViUGFnZUxvYWRlci5GUkFNRV9USU1FT1VUXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHRyYWN0cyB0aGUgY29udGVudCBvZiB0aGUgbG9hZGVkIHdlYiBwYWdlIHVzaW5nIHRoZSBBY2Nlc3NpYmlsaXR5IGRvbWFpbiBhbmQgcmVwb3J0cyB0aGUgcmVzdWx0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBleHRyYWN0Q29udGVudChlcnJvclJlc3VsdD86IFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0ICYgeyBzdGF0dXM6ICdlcnJvcicgfSkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fd2luZG93LndlYkNvbnRlbnRzLmdldFRpdGxlKCk7XG5cblx0XHRcdGxldCByZXN1bHQgPSAnJztcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcmFjZVRpbWVvdXQoKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyBJZiB0aGUgc2VydmVyIHJldHVybmVkIHRleHQvbWFya2Rvd24sIHRoZSBkb2N1bWVudCBpcyBhbHJlYWR5IHBsYWluIHRleHQuXG5cdFx0XHRcdFx0Ly8gRXh0cmFjdCBpdCBkaXJlY3RseSBmcm9tIHRoZSBkb2N1bWVudCBpbnN0ZWFkIG9mIHJ1bm5pbmcgYWNjZXNzaWJpbGl0eS9ET00gaGV1cmlzdGljcy5cblx0XHRcdFx0XHRpZiAodGhpcy5fcmVjZWl2ZWRNYXJrZG93bikge1xuXHRcdFx0XHRcdFx0dGhpcy50cmFjZSgnRXh0cmFjdGluZyBtYXJrZG93biB0ZXh0IGNvbnRlbnQgZnJvbSBkb2N1bWVudCcpO1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fd2luZG93LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KCdkb2N1bWVudC5ib2R5Py50ZXh0Q29udGVudCA/PyBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IFwiXCInKSA/PyAnJztcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5leHRyYWN0QWNjZXNzaWJpbGl0eVRyZWVDb250ZW50KGN0cy50b2tlbikgPz8gJyc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgcmVzdWx0Lmxlbmd0aCA8IFdlYlBhZ2VMb2FkZXIuTUlOX0NPTlRFTlRfTEVOR1RIKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKGBBY2Nlc3NpYmlsaXR5IHRyZWUgZXh0cmFjdGlvbiB5aWVsZGVkIGluc3VmZmljaWVudCBjb250ZW50LCB0cnlpbmcgbWFpbiBET00gZWxlbWVudCBleHRyYWN0aW9uYCk7XG5cdFx0XHRcdFx0XHRjb25zdCBkb21Db250ZW50ID0gYXdhaXQgdGhpcy5leHRyYWN0TWFpbkRvbUVsZW1lbnRDb250ZW50KCkgPz8gJyc7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBkb21Db250ZW50Lmxlbmd0aCA+IHJlc3VsdC5sZW5ndGggPyBkb21Db250ZW50IDogcmVzdWx0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKSwgV2ViUGFnZUxvYWRlci5FWFRSQUNUX0NPTlRFTlRfVElNRU9VVCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KHsgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogJ0ZhaWxlZCB0byBleHRyYWN0IG1lYW5pbmdmdWwgY29udGVudCBmcm9tIHRoZSB3ZWIgcGFnZScgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVycm9yUmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fb25SZXN1bHQoeyAuLi5lcnJvclJlc3VsdCwgcmVzdWx0LCB0aXRsZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KHsgc3RhdHVzOiAnb2snLCByZXN1bHQsIHRpdGxlIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlcnJvclJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KGVycm9yUmVzdWx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KHtcblx0XHRcdFx0XHRzdGF0dXM6ICdlcnJvcicsXG5cdFx0XHRcdFx0ZXJyb3I6IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRXh0cmFjdHMgY29udGVudCBmcm9tIHRoZSBBY2Nlc3NpYmlsaXR5IHRyZWUgb2YgdGhlIGxvYWRlZCB3ZWIgcGFnZS5cblx0ICogQHBhcmFtIHRva2VuIENhbmNlbGxhdGlvbiB0b2tlbiB0byBhYm9ydCB0aGUgb3BlcmF0aW9uLlxuXHQgKiBAcmV0dXJuIFRoZSBleHRyYWN0ZWQgY29udGVudCwgb3IgdW5kZWZpbmVkIGlmIGV4dHJhY3Rpb24gZmFpbHMgb3IgaXMgY2FuY2VsbGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBleHRyYWN0QWNjZXNzaWJpbGl0eVRyZWVDb250ZW50KHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy50cmFjZShgRXh0cmFjdGluZyBjb250ZW50IHVzaW5nIEFjY2Vzc2liaWxpdHkgZG9tYWluYCk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEVuYWJsZSB0aGUgUGFnZSBkb21haW4gdG8gZ2V0IGZyYW1lIGluZm9ybWF0aW9uXG5cdFx0XHRhd2FpdCB0aGlzLl9kZWJ1Z2dlci5zZW5kQ29tbWFuZCgnUGFnZS5lbmFibGUnKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBHZXQgYWxsIGZyYW1lcyBpbmNsdWRpbmcgaWZyYW1lc1xuXHRcdFx0Y29uc3QgeyBmcmFtZVRyZWUgfSA9IGF3YWl0IHRoaXMuX2RlYnVnZ2VyLnNlbmRDb21tYW5kKCdQYWdlLmdldEZyYW1lVHJlZScpIGFzIHsgZnJhbWVUcmVlOiBGcmFtZVRyZWVOb2RlIH07XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZnJhbWVOb2RlcyA9IFtmcmFtZVRyZWVdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmcmFtZU5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGZyYW1lTm9kZXMucHVzaCguLi5mcmFtZU5vZGVzW2ldLmNoaWxkRnJhbWVzID8/IFtdKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29sbGVjdCBhY2Nlc3NpYmlsaXR5IG5vZGVzIGZyb20gYWxsIGZyYW1lc1xuXHRcdFx0Y29uc3QgYWxsTm9kZXM6IEFYTm9kZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHsgZnJhbWUgfSBvZiBmcmFtZU5vZGVzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBub2RlcyB9ID0gYXdhaXQgdGhpcy5fZGVidWdnZXIuc2VuZENvbW1hbmQoJ0FjY2Vzc2liaWxpdHkuZ2V0RnVsbEFYVHJlZScsIHsgZnJhbWVJZDogZnJhbWUuaWQgfSkgYXMgeyBub2RlczogQVhOb2RlW10gfTtcblx0XHRcdFx0XHRhbGxOb2Rlcy5wdXNoKC4uLm5vZGVzKTtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGhpcy5fdXJpLCBhbGxOb2Rlcyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMudHJhY2UoYEFjY2Vzc2liaWxpdHkgdHJlZSBleHRyYWN0aW9uIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGYWxsYmFjayBtZXRob2QgZm9yIGV4dHJhY3Rpbmcgd2ViIHBhZ2UgY29udGVudCB3aGVuIEFjY2Vzc2liaWxpdHkgdHJlZSBleHRyYWN0aW9uIHlpZWxkcyBpbnN1ZmZpY2llbnQgY29udGVudC5cblx0ICogQXR0ZW1wdHMgdG8gZXh0cmFjdCBtZWFuaW5nZnVsIHRleHQgY29udGVudCBmcm9tIHRoZSBtYWluIERPTSBlbGVtZW50cyBvZiB0aGUgbG9hZGVkIHdlYiBwYWdlLlxuXHQgKiBAcmV0dXJucyBUaGUgZXh0cmFjdGVkIHRleHQgY29udGVudCwgb3IgdW5kZWZpbmVkIGlmIGV4dHJhY3Rpb24gZmFpbHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGV4dHJhY3RNYWluRG9tRWxlbWVudENvbnRlbnQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy50cmFjZShgRXh0cmFjdGluZyBjb250ZW50IGZyb20gbWFpbiBET00gZWxlbWVudGApO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdChgXG5cdFx0XHRcdCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0b3JzID0gWydtYWluJywnYXJ0aWNsZScsJ1tyb2xlPVwibWFpblwiXScsJy5tYWluLWNvbnRlbnQnLCcjbWFpbi1jb250ZW50JywnLmFydGljbGUtYm9keScsJy5wb3N0LWNvbnRlbnQnLCcuZW50cnktY29udGVudCcsJy5jb250ZW50JywnYm9keSddO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik/LnRleHRDb250ZW50Py5yZXBsYWNlKC9bIFxcXFx0XSsvZywgJyAnKS5yZXBsYWNlKC9cXFxcc3syLH0vZ20sICdcXFxcbicpLnRyaW0oKTtcblx0XHRcdFx0XHRcdGlmIChjb250ZW50ICYmIGNvbnRlbnQubGVuZ3RoID4gJHtXZWJQYWdlTG9hZGVyLk1JTl9DT05URU5UX0xFTkdUSH0pIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHRgKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy50cmFjZShgRE9NIGV4dHJhY3Rpb24gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLE9BQU8sYUFBYSxvQkFBb0I7QUFDakQsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBSTdCLFNBQWlCLCtCQUErQjtBQXVCekMsTUFBTSxpQkFBTixNQUFNLHVCQUFzQixXQUFXO0FBQUEsRUFrQjdDLFlBQ0Msc0JBQ2lCLFNBQ0EsTUFDQSxVQUNBLGtCQUNBLDRCQUNoQjtBQUNELFVBQU07QUFOVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBZGxCLFNBQWlCLFlBQVksb0JBQUksSUFBWTtBQUM3QyxTQUFpQixTQUFTLEtBQUssVUFBVSxJQUFJLE1BQU0sQ0FBQztBQUNwRCxTQUFpQixXQUFXLEtBQUssVUFBVSxJQUFJLGFBQWEsQ0FBQztBQUM3RCxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksYUFBYSxDQUFDO0FBQ3ZFLFNBQVEsWUFBWSxDQUFDLFlBQXFDO0FBQUEsSUFBRTtBQUM1RCxTQUFRLGlCQUFpQjtBQUN6QixTQUFRLG9CQUFvQjtBQVkzQixTQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFDbkMsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04s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
