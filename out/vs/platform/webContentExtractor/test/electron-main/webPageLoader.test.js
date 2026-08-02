import * as assert from "assert";
import * as sinon from "sinon";
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { WebPageLoader } from "../../electron-main/webPageLoader.js";
class MockWebContents {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
    this._onceListeners = /* @__PURE__ */ new Set();
    this.loadURL = sinon.stub().resolves();
    this.getTitle = sinon.stub().returns("Test Page Title");
    this.executeJavaScript = sinon.stub().resolves(void 0);
    this.session = {
      webRequest: {
        onBeforeSendHeaders: sinon.stub(),
        onHeadersReceived: sinon.stub()
      },
      on: sinon.stub()
    };
    this.debugger = new MockDebugger();
  }
  once(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
    this._onceListeners.add(listener);
    return this;
  }
  on(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
    return this;
  }
  emit(event, ...args) {
    const listeners = this._listeners.get(event) || [];
    for (const listener of listeners) {
      listener(...args);
    }
    const remaining = listeners.filter((l) => !this._onceListeners.has(l));
    for (const listener of listeners) {
      this._onceListeners.delete(listener);
    }
    if (remaining.length > 0) {
      this._listeners.set(event, remaining);
    } else {
      this._listeners.delete(event);
    }
  }
  beginFrameSubscription(_onlyDirty, callback) {
    setTimeout(() => callback(), 0);
  }
  endFrameSubscription() {
  }
}
class MockDebugger {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
    this.attach = sinon.stub();
    this.sendCommand = sinon.stub().resolves({});
  }
  on(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
    return this;
  }
  emit(event, ...args) {
    const listeners = this._listeners.get(event) || [];
    for (const listener of listeners) {
      listener(...args);
    }
  }
}
class MockBrowserWindow {
  constructor(_options) {
    this.destroy = sinon.stub();
    this.loadURL = sinon.stub().resolves();
    this.webContents = new MockWebContents();
  }
}
suite("WebPageLoader", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let window;
  teardown(() => {
    sinon.restore();
  });
  function createWebPageLoader(uri, options, isTrustedDomain, isDomainAllowed) {
    const agentNetworkFilterService = {
      _serviceBrand: void 0,
      onDidChange: Event.None,
      isUriAllowed: isDomainAllowed ?? (() => true),
      formatError: (u) => `Access to ${u.authority} is blocked by network domain policy.`
    };
    const loader = new WebPageLoader((options2) => {
      window = new MockBrowserWindow(options2);
      return window;
    }, new NullLogService(), uri, options, isTrustedDomain ?? (() => false), agentNetworkFilterService);
    disposables.add(loader);
    return loader;
  }
  function createMockAXNodes() {
    return [
      {
        nodeId: "node1",
        ignored: false,
        role: { type: "role", value: "paragraph" },
        childIds: ["node2"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Test content from page" }
      }
    ];
  }
  function setupDebuggerMock(options = {}) {
    const {
      axNodes = createMockAXNodes(),
      frameTree = { frame: { id: "main-frame" }, childFrames: [] },
      accessibilityHang
    } = options;
    window.webContents.debugger.sendCommand.callsFake((command, params) => {
      switch (command) {
        case "Network.enable":
          return Promise.resolve();
        case "Page.enable":
          return Promise.resolve();
        case "Page.getFrameTree":
          return Promise.resolve({ frameTree });
        case "Accessibility.getFullAXTree":
          if (accessibilityHang) {
            return new Promise(() => {
            });
          } else if (typeof axNodes === "function") {
            return Promise.resolve({ nodes: axNodes(params?.frameId ?? "") });
          } else {
            return Promise.resolve({ nodes: axNodes });
          }
        default:
          assert.fail(`Unexpected command: ${command}`);
      }
    });
  }
  test("successful page load returns ok status with content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    assert.strictEqual(result.title, "Test Page Title");
    assert.ok(result.result.includes("Test content from page"));
  }));
  test("page load failure returns error status", async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.emit("did-fail-load", mockEvent, -6, "ERR_CONNECTION_REFUSED");
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, -6);
      assert.strictEqual(result.error, "ERR_CONNECTION_REFUSED");
    }
  });
  test("ERR_ABORTED is ignored and content extraction continues", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.emit("did-fail-load", mockEvent, -3, "ERR_ABORTED");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("Test content from page"));
    }
  }));
  test("ERR_BLOCKED_BY_CLIENT is ignored and content extraction continues", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.emit("did-fail-load", mockEvent, -27, "ERR_BLOCKED_BY_CLIENT");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("Test content from page"));
    }
  }));
  test("redirect to different authority returns redirect status when followRedirects is false", async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://other-domain.com/redirected";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    window.webContents.debugger.sendCommand.resolves({});
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    const result = await loadPromise;
    assert.strictEqual(result.status, "redirect");
    if (result.status === "redirect") {
      assert.strictEqual(result.toURI.authority, "other-domain.com");
    }
    assert.ok(mockEvent.preventDefault.called);
  });
  test("redirect to same authority is not treated as redirect", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://example.com/other-page";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect is followed when followRedirects option is true", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://other-domain.com/redirected";
    const loader = createWebPageLoader(uri, { followRedirects: true });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect from www to non-www same domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://www.example.com/page");
    const redirectUrl = "https://example.com/other-page";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect from non-www to www same domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://www.example.com/other-page";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect to trusted domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://trusted-domain.com/redirected";
    const loader = createWebPageLoader(
      uri,
      { followRedirects: false },
      (uri2) => uri2.authority === "trusted-domain.com" || uri2.authority === "another-trusted.com"
    );
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("post-load navigation to different domain is blocked silently and content is extracted", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const adRedirectUrl = "https://eus.rubiconproject.com/usync.html?p=12776";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", mockEvent, adRedirectUrl);
    const result = await loadPromise;
    assert.ok(mockEvent.preventDefault.called);
    assert.strictEqual(result.status, "ok");
    assert.ok(result.result.includes("Test content from page"));
  }));
  test("initial same-domain navigation is allowed but later cross-domain navigation is blocked", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const sameDomainUrl = "https://example.com/otherpage";
    const crossDomainUrl = "https://eus.rubiconproject.com/usync.html?p=12776";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const initialEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", initialEvent, sameDomainUrl);
    assert.ok(!initialEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const crossDomainEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", crossDomainEvent, crossDomainUrl);
    const result = await loadPromise;
    assert.ok(crossDomainEvent.preventDefault.called);
    assert.strictEqual(result.status, "ok");
    assert.ok(result.result.includes("Test content from page"));
  }));
  test("redirect to non-trusted domain is blocked", async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://untrusted-domain.com/redirected";
    const loader = createWebPageLoader(
      uri,
      { followRedirects: false },
      (uri2) => uri2.authority === "trusted-domain.com"
    );
    window.webContents.debugger.sendCommand.resolves({});
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    const result = await loadPromise;
    assert.ok(mockEvent.preventDefault.called);
    assert.strictEqual(result.status, "redirect");
    if (result.status === "redirect") {
      assert.strictEqual(result.toURI.authority, "untrusted-domain.com");
    }
  });
  test("redirect to wildcard subdomain trusted domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://sub.trusted-domain.com/redirected";
    const loader = createWebPageLoader(
      uri,
      { followRedirects: false },
      (uri2) => uri2.authority.endsWith(".trusted-domain.com") || uri2.authority === "trusted-domain.com"
    );
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("navigation to domain blocked by isDomainAllowed returns error", async () => {
    const uri = URI.parse("https://example.com/page");
    const blockedUrl = "https://blocked-domain.com/path";
    const loader = createWebPageLoader(uri, { followRedirects: true }, void 0, (u) => u.authority !== "blocked-domain.com");
    window.webContents.debugger.sendCommand.resolves({});
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", mockEvent, blockedUrl);
    const result = await loadPromise;
    assert.ok(mockEvent.preventDefault.called);
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error?.includes("blocked-domain.com"));
    }
  });
  test("navigation to allowed domain is not blocked by isDomainAllowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const allowedUrl = "https://allowed-domain.com/path";
    const loader = createWebPageLoader(uri, { followRedirects: true }, void 0, (u) => u.authority !== "blocked-domain.com");
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", mockEvent, allowedUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("HTTP error status code returns error with content", async () => {
    const uri = URI.parse("https://example.com/not-found");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.responseReceived", {
      requestId: "req1",
      type: "Document",
      response: {
        status: 404,
        statusText: "Not Found"
      }
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, 404);
      assert.strictEqual(result.error, "Not Found");
    }
  });
  test("HTTP 500 error returns server error status", async () => {
    const uri = URI.parse("https://example.com/server-error");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.responseReceived", {
      requestId: "req1",
      type: "Document",
      response: {
        status: 500,
        statusText: "Internal Server Error"
      }
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, 500);
      assert.strictEqual(result.error, "Internal Server Error");
    }
  });
  test("HTTP error without status text uses fallback message", async () => {
    const uri = URI.parse("https://example.com/error");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.responseReceived", {
      requestId: "req1",
      type: "Document",
      response: {
        status: 503
      }
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, 503);
      assert.strictEqual(result.error, "HTTP error 503");
    }
  });
  test("tracks network requests and waits for completion", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.requestWillBeSent", {
      requestId: "req1"
    });
    window.webContents.debugger.emit("message", mockEvent, "Network.requestWillBeSent", {
      requestId: "req2"
    });
    window.webContents.emit("did-finish-load");
    window.webContents.debugger.emit("message", mockEvent, "Network.loadingFinished", {
      requestId: "req1"
    });
    window.webContents.debugger.emit("message", mockEvent, "Network.loadingFinished", {
      requestId: "req2"
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("handles network request failures gracefully", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.requestWillBeSent", {
      requestId: "req1"
    });
    window.webContents.debugger.emit("message", mockEvent, "Network.loadingFailed", {
      requestId: "req1"
    });
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("extracts content from accessibility tree", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const axNodes = [
      {
        nodeId: "heading1",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "string", value: "Page Title" },
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        childIds: ["text1"]
      },
      {
        nodeId: "text1",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Page Title" }
      }
    ];
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ axNodes });
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("# Page Title"));
    }
  }));
  test("falls back to DOM extraction when accessibility tree yields insufficient content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const shortAXNodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Short" }
      }
    ];
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ axNodes: shortAXNodes });
    const domContent = "This is much longer content extracted from the DOM that exceeds the minimum content length requirement and should be used instead of the short accessibility tree content.";
    window.webContents.executeJavaScript.resolves(domContent);
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.strictEqual(result.result, domContent);
    }
    assert.ok(window.webContents.executeJavaScript.called);
  }));
  test("returns error when accessibility tree extraction hangs", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ accessibilityHang: true });
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error.includes("Failed to extract meaningful content"));
    }
    assert.ok(!window.webContents.executeJavaScript.called);
  }));
  test("returns error when both accessibility tree and DOM extraction yield no content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/empty-page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ axNodes: [] });
    window.webContents.executeJavaScript.resolves(void 0);
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error.includes("Failed to extract meaningful content"));
    }
    assert.ok(window.webContents.executeJavaScript.called);
  }));
  test("extracts content from multiple frames including iframes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page-with-iframes");
    const mainFrameNodes = [
      {
        nodeId: "main-root",
        ignored: false,
        role: { type: "role", value: "RootWebArea" },
        childIds: ["main-heading"]
      },
      {
        nodeId: "main-heading",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "string", value: "Main Page Content" },
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        childIds: ["main-text"]
      },
      {
        nodeId: "main-text",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Main Page Content" }
      }
    ];
    const iframeNodes = [
      {
        nodeId: "iframe-root",
        ignored: false,
        role: { type: "role", value: "RootWebArea" },
        childIds: ["iframe-heading"]
      },
      {
        nodeId: "iframe-heading",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "string", value: "Iframe Documentation Content" },
        properties: [{ name: "level", value: { type: "integer", value: 2 } }],
        childIds: ["iframe-text"]
      },
      {
        nodeId: "iframe-text",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Iframe Documentation Content" }
      }
    ];
    const nestedIframeNodes = [
      {
        nodeId: "nested-root",
        ignored: false,
        role: { type: "role", value: "RootWebArea" },
        childIds: ["nested-paragraph"]
      },
      {
        nodeId: "nested-paragraph",
        ignored: false,
        role: { type: "role", value: "paragraph" },
        childIds: ["nested-text"]
      },
      {
        nodeId: "nested-text",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Deeply nested iframe content that should also be extracted" }
      }
    ];
    const loader = createWebPageLoader(uri);
    const frameTree = {
      frame: { id: "main-frame", url: "https://example.com/page-with-iframes" },
      childFrames: [
        {
          frame: { id: "iframe-1", url: "https://example.com/iframe-content" },
          childFrames: [
            {
              frame: { id: "nested-iframe", url: "https://example.com/nested-content" },
              childFrames: []
            }
          ]
        }
      ]
    };
    setupDebuggerMock({
      frameTree,
      axNodes: (frameId) => {
        switch (frameId) {
          case "main-frame":
            return mainFrameNodes;
          case "iframe-1":
            return iframeNodes;
          case "nested-iframe":
            return nestedIframeNodes;
          default:
            return [];
        }
      }
    });
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("Main Page Content"), "Should include main frame content");
      assert.ok(result.result.includes("Iframe Documentation Content"), "Should include iframe content");
      assert.ok(result.result.includes("Deeply nested iframe content"), "Should include nested iframe content");
    }
    const getFullAXTreeCalls = window.webContents.debugger.sendCommand.getCalls().filter((call) => call.args[0] === "Accessibility.getFullAXTree");
    assert.strictEqual(getFullAXTreeCalls.length, 3, "Should call getFullAXTree for all 3 frames");
  }));
  test("onBeforeSendHeaders adds privacy headers for all requests", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    assert.ok(window.webContents.session.webRequest.onBeforeSendHeaders.called);
    const callback = window.webContents.session.webRequest.onBeforeSendHeaders.getCall(0).args[0];
    let modifiedHeaders;
    const mockCallback = (details) => {
      modifiedHeaders = details.requestHeaders;
    };
    callback(
      {
        url: "https://example.com/style.css",
        requestHeaders: {
          "TestHeader": "TestValue"
        }
      },
      mockCallback
    );
    assert.ok(modifiedHeaders);
    assert.strictEqual(modifiedHeaders["DNT"], "1");
    assert.strictEqual(modifiedHeaders["Sec-GPC"], "1");
    assert.strictEqual(modifiedHeaders["TestHeader"], "TestValue");
    assert.strictEqual(modifiedHeaders["Accept"], void 0);
  });
  test("onBeforeSendHeaders adds Accept header preferring markdown for mainFrame requests", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    assert.ok(window.webContents.session.webRequest.onBeforeSendHeaders.called);
    const callback = window.webContents.session.webRequest.onBeforeSendHeaders.getCall(0).args[0];
    let modifiedHeaders;
    const mockCallback = (details) => {
      modifiedHeaders = details.requestHeaders;
    };
    callback(
      {
        url: "https://example.com/page",
        resourceType: "mainFrame",
        requestHeaders: {}
      },
      mockCallback
    );
    assert.ok(modifiedHeaders);
    assert.ok(modifiedHeaders["Accept"]?.includes("text/markdown"));
    assert.ok(modifiedHeaders["Accept"]?.includes("text/html"));
  });
  test("onHeadersReceived replaces Content-Disposition attachment with inline for text content", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    assert.ok(window.webContents.session.webRequest.onHeadersReceived.called);
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    for (const contentType of ["application/xml", "text/html", "text/plain", "application/json", "application/xhtml+xml", "application/rss+xml", "application/vnd.custom+json"]) {
      let response;
      const mockCallback = (result) => {
        response = result;
      };
      listener(
        {
          url: "https://example.com/file",
          responseHeaders: {
            "Content-Disposition": ['attachment; filename="file.xml"'],
            "Content-Type": [contentType]
          }
        },
        mockCallback
      );
      assert.ok(response, `Expected response for ${contentType}`);
      assert.deepStrictEqual(response.responseHeaders["Content-Disposition"], ["inline"], `Expected inline for ${contentType}`);
      assert.strictEqual(response.cancel, false, `Should not cancel for ${contentType}`);
    }
  });
  test("onHeadersReceived cancels Content-Disposition attachment for binary content", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    for (const contentType of ["application/octet-stream", "application/zip", "application/pdf", "image/png", "video/mp4"]) {
      let response;
      const mockCallback = (result) => {
        response = result;
      };
      listener(
        {
          url: "https://example.com/file.bin",
          responseHeaders: {
            "Content-Disposition": ['attachment; filename="file.bin"'],
            "Content-Type": [contentType]
          }
        },
        mockCallback
      );
      assert.ok(response, `Expected response for ${contentType}`);
      assert.strictEqual(response.cancel, true, `Expected cancel for ${contentType}`);
    }
  });
  test("onHeadersReceived cancels Content-Disposition attachment when content type is missing", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    let response;
    const mockCallback = (result) => {
      response = result;
    };
    listener(
      {
        url: "https://example.com/file",
        responseHeaders: {
          "Content-Disposition": ['attachment; filename="file"']
        }
      },
      mockCallback
    );
    assert.ok(response);
    assert.strictEqual(response.cancel, true);
  });
  test("onHeadersReceived allows normal responses without Content-Disposition attachment", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    let response;
    const mockCallback = (result) => {
      response = result;
    };
    listener(
      {
        url: "https://example.com/page",
        responseHeaders: {
          "Content-Type": ["text/html"],
          "Content-Disposition": ["inline"]
        }
      },
      mockCallback
    );
    assert.ok(response);
    assert.strictEqual(response.responseHeaders, void 0);
  });
  test("will-download handler cancels download and returns error", async () => {
    const uri = URI.parse("https://dl.google.com/linux/chrome/rpm/stable/x86_64/repodata/repomd.xml");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    assert.ok(window.webContents.session.on.called);
    const willDownloadCall = window.webContents.session.on.getCalls().find((call) => call.args[0] === "will-download");
    assert.ok(willDownloadCall);
    const willDownloadHandler = willDownloadCall.args[1];
    const loadPromise = loader.load();
    const mockItem = {
      cancel: sinon.stub(),
      getFilename: sinon.stub().returns("repomd.xml")
    };
    willDownloadHandler({}, mockItem);
    const result = await loadPromise;
    assert.ok(mockItem.cancel.called);
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error.includes("Download not allowed"));
      assert.ok(result.error.includes("repomd.xml"));
    }
  });
  test("onHeadersReceived detects markdown content-type for mainFrame responses", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    let response;
    const mockCallback = (result) => {
      response = result;
    };
    listener(
      {
        url: "https://example.com/page",
        resourceType: "mainFrame",
        responseHeaders: {
          "Content-Type": ["text/markdown; charset=utf-8"]
        }
      },
      mockCallback
    );
    assert.ok(response);
    assert.strictEqual(response.cancel, false);
  });
  test("markdown content-type extraction uses raw body", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://learn.microsoft.com/en-us/docs");
    const loader = createWebPageLoader(uri);
    const longAXNodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "This is a long accessibility tree content that exceeds the minimum content length requirement of one hundred characters easily." }
      }
    ];
    setupDebuggerMock({ axNodes: longAXNodes });
    const headersListener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    const loadPromise = loader.load();
    headersListener(
      {
        url: uri.toString(),
        resourceType: "mainFrame",
        responseHeaders: {
          "Content-Type": ["text/markdown; charset=utf-8"]
        }
      },
      () => {
      }
    );
    window.webContents.executeJavaScript.resolves("# Hello World\n\nThis is markdown content.");
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    assert.ok(result.result.includes("# Hello World"));
    assert.ok(result.result.includes("This is markdown content."));
  }));
  test("disposes resources after load completes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    await loadPromise;
    assert.ok(window.destroy.called);
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvdGVzdC9lbGVjdHJvbi1tYWluL3dlYlBhZ2VMb2FkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25ldHdvcmtGaWx0ZXIvY29tbW9uL25ldHdvcmtGaWx0ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFYTm9kZSB9IGZyb20gJy4uLy4uL2VsZWN0cm9uLW1haW4vY2RwQWNjZXNzaWJpbGl0eURvbWFpbi5qcyc7XG5pbXBvcnQgeyBXZWJQYWdlTG9hZGVyIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tbWFpbi93ZWJQYWdlTG9hZGVyLmpzJztcbmltcG9ydCB7IElXZWJDb250ZW50RXh0cmFjdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcblxuaW50ZXJmYWNlIE1vY2tFbGVjdHJvbkV2ZW50IHtcblx0cHJldmVudERlZmF1bHQ/OiBzaW5vbi5TaW5vblN0dWI7XG59XG5cbmNsYXNzIE1vY2tXZWJDb250ZW50cyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RlbmVycyA9IG5ldyBNYXA8c3RyaW5nLCAoKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZClbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25jZUxpc3RlbmVycyA9IG5ldyBTZXQ8KC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZD4oKTtcblx0cHVibGljIHJlYWRvbmx5IGRlYnVnZ2VyOiBNb2NrRGVidWdnZXI7XG5cdHB1YmxpYyBsb2FkVVJMID0gc2lub24uc3R1YigpLnJlc29sdmVzKCk7XG5cdHB1YmxpYyBnZXRUaXRsZSA9IHNpbm9uLnN0dWIoKS5yZXR1cm5zKCdUZXN0IFBhZ2UgVGl0bGUnKTtcblx0cHVibGljIGV4ZWN1dGVKYXZhU2NyaXB0ID0gc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCk7XG5cblx0cHVibGljIHNlc3Npb24gPSB7XG5cdFx0d2ViUmVxdWVzdDoge1xuXHRcdFx0b25CZWZvcmVTZW5kSGVhZGVyczogc2lub24uc3R1YigpLFxuXHRcdFx0b25IZWFkZXJzUmVjZWl2ZWQ6IHNpbm9uLnN0dWIoKVxuXHRcdH0sXG5cdFx0b246IHNpbm9uLnN0dWIoKVxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuZGVidWdnZXIgPSBuZXcgTW9ja0RlYnVnZ2VyKCk7XG5cdH1cblxuXHRvbmNlKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdGhpcyB7XG5cdFx0aWYgKCF0aGlzLl9saXN0ZW5lcnMuaGFzKGV2ZW50KSkge1xuXHRcdFx0dGhpcy5fbGlzdGVuZXJzLnNldChldmVudCwgW10pO1xuXHRcdH1cblx0XHR0aGlzLl9saXN0ZW5lcnMuZ2V0KGV2ZW50KSEucHVzaChsaXN0ZW5lcik7XG5cdFx0dGhpcy5fb25jZUxpc3RlbmVycy5hZGQobGlzdGVuZXIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0b24oZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpOiB0aGlzIHtcblx0XHRpZiAoIXRoaXMuX2xpc3RlbmVycy5oYXMoZXZlbnQpKSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lcnMuc2V0KGV2ZW50LCBbXSk7XG5cdFx0fVxuXHRcdHRoaXMuX2xpc3RlbmVycy5nZXQoZXZlbnQpIS5wdXNoKGxpc3RlbmVyKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGVtaXQoZXZlbnQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzLmdldChldmVudCkgfHwgW107XG5cdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiBsaXN0ZW5lcnMpIHtcblx0XHRcdGxpc3RlbmVyKC4uLmFyZ3MpO1xuXHRcdH1cblx0XHQvLyBSZW1vdmUgb25jZSBsaXN0ZW5lcnMsIGtlZXAgb24gbGlzdGVuZXJzXG5cdFx0Y29uc3QgcmVtYWluaW5nID0gbGlzdGVuZXJzLmZpbHRlcihsID0+ICF0aGlzLl9vbmNlTGlzdGVuZXJzLmhhcyhsKSk7XG5cdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiBsaXN0ZW5lcnMpIHtcblx0XHRcdHRoaXMuX29uY2VMaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKTtcblx0XHR9XG5cdFx0aWYgKHJlbWFpbmluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lcnMuc2V0KGV2ZW50LCByZW1haW5pbmcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lcnMuZGVsZXRlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRiZWdpbkZyYW1lU3Vic2NyaXB0aW9uKF9vbmx5RGlydHk6IGJvb2xlYW4sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0c2V0VGltZW91dCgoKSA9PiBjYWxsYmFjaygpLCAwKTtcblx0fVxuXG5cdGVuZEZyYW1lU3Vic2NyaXB0aW9uKCk6IHZvaWQge1xuXHR9XG59XG5cbmNsYXNzIE1vY2tEZWJ1Z2dlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RlbmVycyA9IG5ldyBNYXA8c3RyaW5nLCAoKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZClbXT4oKTtcblx0cHVibGljIGF0dGFjaCA9IHNpbm9uLnN0dWIoKTtcblx0cHVibGljIHNlbmRDb21tYW5kID0gc2lub24uc3R1YigpLnJlc29sdmVzKHt9KTtcblxuXHRvbihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdGlmICghdGhpcy5fbGlzdGVuZXJzLmhhcyhldmVudCkpIHtcblx0XHRcdHRoaXMuX2xpc3RlbmVycy5zZXQoZXZlbnQsIFtdKTtcblx0XHR9XG5cdFx0dGhpcy5fbGlzdGVuZXJzLmdldChldmVudCkhLnB1c2gobGlzdGVuZXIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0ZW1pdChldmVudDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMuZ2V0KGV2ZW50KSB8fCBbXTtcblx0XHRmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIGxpc3RlbmVycykge1xuXHRcdFx0bGlzdGVuZXIoLi4uYXJncyk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE1vY2tCcm93c2VyV2luZG93IHtcblx0cHVibGljIHJlYWRvbmx5IHdlYkNvbnRlbnRzOiBNb2NrV2ViQ29udGVudHM7XG5cdHB1YmxpYyBkZXN0cm95ID0gc2lub24uc3R1YigpO1xuXHRwdWJsaWMgbG9hZFVSTCA9IHNpbm9uLnN0dWIoKS5yZXNvbHZlcygpO1xuXG5cdGNvbnN0cnVjdG9yKF9vcHRpb25zPzogRWxlY3Ryb24uQnJvd3NlcldpbmRvd0NvbnN0cnVjdG9yT3B0aW9ucykge1xuXHRcdHRoaXMud2ViQ29udGVudHMgPSBuZXcgTW9ja1dlYkNvbnRlbnRzKCk7XG5cdH1cbn1cblxuc3VpdGUoJ1dlYlBhZ2VMb2FkZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCB3aW5kb3c6IE1vY2tCcm93c2VyV2luZG93O1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpOiBVUkksIG9wdGlvbnM/OiBJV2ViQ29udGVudEV4dHJhY3Rvck9wdGlvbnMsIGlzVHJ1c3RlZERvbWFpbj86ICh1cmk6IFVSSSkgPT4gYm9vbGVhbiwgaXNEb21haW5BbGxvd2VkPzogKHVyaTogVVJJKSA9PiBib29sZWFuKTogV2ViUGFnZUxvYWRlciB7XG5cdFx0Y29uc3QgYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGlzVXJpQWxsb3dlZDogaXNEb21haW5BbGxvd2VkID8/ICgoKSA9PiB0cnVlKSxcblx0XHRcdGZvcm1hdEVycm9yOiAodSkgPT4gYEFjY2VzcyB0byAke3UuYXV0aG9yaXR5fSBpcyBibG9ja2VkIGJ5IG5ldHdvcmsgZG9tYWluIHBvbGljeS5gLFxuXHRcdH07XG5cdFx0Y29uc3QgbG9hZGVyID0gbmV3IFdlYlBhZ2VMb2FkZXIoKG9wdGlvbnMpID0+IHtcblx0XHRcdHdpbmRvdyA9IG5ldyBNb2NrQnJvd3NlcldpbmRvdyhvcHRpb25zKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIHdpbmRvdyBhcyBhbnk7XG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHVyaSwgb3B0aW9ucywgaXNUcnVzdGVkRG9tYWluID8/ICgoKSA9PiBmYWxzZSksIGFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsb2FkZXIpO1xuXHRcdHJldHVybiBsb2FkZXI7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrQVhOb2RlcygpOiBBWE5vZGVbXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAncGFyYWdyYXBoJyB9LFxuXHRcdFx0XHRjaGlsZElkczogWydub2RlMiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdTdGF0aWNUZXh0JyB9LFxuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogJ1Rlc3QgY29udGVudCBmcm9tIHBhZ2UnIH1cblx0XHRcdH1cblx0XHRdO1xuXHR9XG5cblx0aW50ZXJmYWNlIERlYnVnZ2VyTW9ja09wdGlvbnMge1xuXHRcdGF4Tm9kZXM/OiBBWE5vZGVbXSB8ICgoZnJhbWVJZDogc3RyaW5nKSA9PiBBWE5vZGVbXSk7XG5cdFx0ZnJhbWVUcmVlPzogeyBmcmFtZTogeyBpZDogc3RyaW5nOyB1cmw/OiBzdHJpbmcgfTsgY2hpbGRGcmFtZXM/OiB1bmtub3duW10gfTtcblx0XHRhY2Nlc3NpYmlsaXR5SGFuZz86IGJvb2xlYW47XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cERlYnVnZ2VyTW9jayhvcHRpb25zOiBEZWJ1Z2dlck1vY2tPcHRpb25zID0ge30pOiB2b2lkIHtcblx0XHRjb25zdCB7XG5cdFx0XHRheE5vZGVzID0gY3JlYXRlTW9ja0FYTm9kZXMoKSxcblx0XHRcdGZyYW1lVHJlZSA9IHsgZnJhbWU6IHsgaWQ6ICdtYWluLWZyYW1lJyB9LCBjaGlsZEZyYW1lczogW10gfSxcblx0XHRcdGFjY2Vzc2liaWxpdHlIYW5nXG5cdFx0fSA9IG9wdGlvbnM7XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuc2VuZENvbW1hbmQuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcsIHBhcmFtcz86IHsgZnJhbWVJZD86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdFx0Y2FzZSAnTmV0d29yay5lbmFibGUnOlxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0Y2FzZSAnUGFnZS5lbmFibGUnOlxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0Y2FzZSAnUGFnZS5nZXRGcmFtZVRyZWUnOlxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBmcmFtZVRyZWUgfSk7XG5cdFx0XHRcdGNhc2UgJ0FjY2Vzc2liaWxpdHkuZ2V0RnVsbEFYVHJlZSc6XG5cdFx0XHRcdFx0aWYgKGFjY2Vzc2liaWxpdHlIYW5nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKCkgPT4geyB9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBheE5vZGVzID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgbm9kZXM6IGF4Tm9kZXMocGFyYW1zPy5mcmFtZUlkID8/ICcnKSB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IG5vZGVzOiBheE5vZGVzIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRhc3NlcnQuZmFpbChgVW5leHBlY3RlZCBjb21tYW5kOiAke2NvbW1hbmR9YCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvLyNyZWdpb24gQmFzaWMgTG9hZGluZyBUZXN0c1xuXG5cdHRlc3QoJ3N1Y2Nlc3NmdWwgcGFnZSBsb2FkIHJldHVybnMgb2sgc3RhdHVzIHdpdGggY29udGVudCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHBhZ2UgbG9hZCBldmVudHNcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRpdGxlLCAnVGVzdCBQYWdlIFRpdGxlJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXN1bHQuaW5jbHVkZXMoJ1Rlc3QgY29udGVudCBmcm9tIHBhZ2UnKSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdwYWdlIGxvYWQgZmFpbHVyZSByZXR1cm5zIGVycm9yIHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBwYWdlIGxvYWQgZmFpbHVyZVxuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZhaWwtbG9hZCcsIG1vY2tFdmVudCwgLTYsICdFUlJfQ09OTkVDVElPTl9SRUZVU0VEJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnZXJyb3InKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXNDb2RlLCAtNik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9yLCAnRVJSX0NPTk5FQ1RJT05fUkVGVVNFRCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnRVJSX0FCT1JURUQgaXMgaWdub3JlZCBhbmQgY29udGVudCBleHRyYWN0aW9uIGNvbnRpbnVlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIEVSUl9BQk9SVEVEICgtMykgd2hpY2ggc2hvdWxkIGJlIGlnbm9yZWRcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge307XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1mYWlsLWxvYWQnLCBtb2NrRXZlbnQsIC0zLCAnRVJSX0FCT1JURUQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0Ly8gRVJSX0FCT1JURUQgc2hvdWxkIG5vdCBjYXVzZSBhbiBlcnJvciBzdGF0dXMsIGNvbnRlbnQgc2hvdWxkIGJlIGV4dHJhY3RlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ29rJykge1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXN1bHQuaW5jbHVkZXMoJ1Rlc3QgY29udGVudCBmcm9tIHBhZ2UnKSk7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnRVJSX0JMT0NLRURfQllfQ0xJRU5UIGlzIGlnbm9yZWQgYW5kIGNvbnRlbnQgZXh0cmFjdGlvbiBjb250aW51ZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBFUlJfQkxPQ0tFRF9CWV9DTElFTlQgKC0yNykgd2hpY2ggc2hvdWxkIGJlIGlnbm9yZWRcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge307XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1mYWlsLWxvYWQnLCBtb2NrRXZlbnQsIC0yNywgJ0VSUl9CTE9DS0VEX0JZX0NMSUVOVCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHQvLyBFUlJfQkxPQ0tFRF9CWV9DTElFTlQgc2hvdWxkIG5vdCBjYXVzZSBhbiBlcnJvciBzdGF0dXMsIGNvbnRlbnQgc2hvdWxkIGJlIGV4dHJhY3RlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ29rJykge1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXN1bHQuaW5jbHVkZXMoJ1Rlc3QgY29udGVudCBmcm9tIHBhZ2UnKSk7XG5cdFx0fVxuXHR9KSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlZGlyZWN0IFRlc3RzXG5cblx0dGVzdCgncmVkaXJlY3QgdG8gZGlmZmVyZW50IGF1dGhvcml0eSByZXR1cm5zIHJlZGlyZWN0IHN0YXR1cyB3aGVuIGZvbGxvd1JlZGlyZWN0cyBpcyBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdGNvbnN0IHJlZGlyZWN0VXJsID0gJ2h0dHBzOi8vb3RoZXItZG9tYWluLmNvbS9yZWRpcmVjdGVkJztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLCB7IGZvbGxvd1JlZGlyZWN0czogZmFsc2UgfSk7XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuc2VuZENvbW1hbmQucmVzb2x2ZXMoe30pO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcmVkaXJlY3QgdG8gZGlmZmVyZW50IGF1dGhvcml0eVxuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1yZWRpcmVjdCcsIG1vY2tFdmVudCwgcmVkaXJlY3RVcmwpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ3JlZGlyZWN0Jyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdyZWRpcmVjdCcpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9VUkkuYXV0aG9yaXR5LCAnb3RoZXItZG9tYWluLmNvbScpO1xuXHRcdH1cblx0XHRhc3NlcnQub2soKG1vY2tFdmVudC5wcmV2ZW50RGVmYXVsdCEpLmNhbGxlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZGlyZWN0IHRvIHNhbWUgYXV0aG9yaXR5IGlzIG5vdCB0cmVhdGVkIGFzIHJlZGlyZWN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCByZWRpcmVjdFVybCA9ICdodHRwczovL2V4YW1wbGUuY29tL290aGVyLXBhZ2UnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksIHsgZm9sbG93UmVkaXJlY3RzOiBmYWxzZSB9KTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcmVkaXJlY3QgdG8gc2FtZSBhdXRob3JpdHlcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtcmVkaXJlY3QnLCBtb2NrRXZlbnQsIHJlZGlyZWN0VXJsKTtcblxuXHRcdC8vIFNob3VsZCBub3QgcHJldmVudCBkZWZhdWx0IGZvciBzYW1lLWF1dGhvcml0eSByZWRpcmVjdHNcblx0XHRhc3NlcnQub2soIShtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXG5cdFx0Ly8gQ29udGludWUgd2l0aCBub3JtYWwgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlZGlyZWN0IGlzIGZvbGxvd2VkIHdoZW4gZm9sbG93UmVkaXJlY3RzIG9wdGlvbiBpcyB0cnVlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCByZWRpcmVjdFVybCA9ICdodHRwczovL290aGVyLWRvbWFpbi5jb20vcmVkaXJlY3RlZCc7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSwgeyBmb2xsb3dSZWRpcmVjdHM6IHRydWUgfSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHJlZGlyZWN0XG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLXJlZGlyZWN0JywgbW9ja0V2ZW50LCByZWRpcmVjdFVybCk7XG5cblx0XHQvLyBTaG91bGQgbm90IHByZXZlbnQgZGVmYXVsdCB3aGVuIGZvbGxvd1JlZGlyZWN0cyBpcyB0cnVlXG5cdFx0YXNzZXJ0Lm9rKCEobW9ja0V2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblxuXHRcdC8vIENvbnRpbnVlIHdpdGggbm9ybWFsIGxvYWQgYWZ0ZXIgcmVkaXJlY3Rcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWRpcmVjdCBmcm9tIHd3dyB0byBub24td3d3IHNhbWUgZG9tYWluIGlzIGFsbG93ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vd3d3LmV4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCByZWRpcmVjdFVybCA9ICdodHRwczovL2V4YW1wbGUuY29tL290aGVyLXBhZ2UnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksIHsgZm9sbG93UmVkaXJlY3RzOiBmYWxzZSB9KTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcmVkaXJlY3QgZnJvbSB3d3cgdG8gbm9uLXd3d1xuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1yZWRpcmVjdCcsIG1vY2tFdmVudCwgcmVkaXJlY3RVcmwpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCBwcmV2ZW50IGRlZmF1bHQgZm9yIHd3dyBwcmVmaXggcmVkaXJlY3Rcblx0XHRhc3NlcnQub2soIShtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXG5cdFx0Ly8gQ29udGludWUgd2l0aCBub3JtYWwgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlZGlyZWN0IGZyb20gbm9uLXd3dyB0byB3d3cgc2FtZSBkb21haW4gaXMgYWxsb3dlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgcmVkaXJlY3RVcmwgPSAnaHR0cHM6Ly93d3cuZXhhbXBsZS5jb20vb3RoZXItcGFnZSc7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSwgeyBmb2xsb3dSZWRpcmVjdHM6IGZhbHNlIH0pO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSByZWRpcmVjdCBmcm9tIG5vbi13d3cgdG8gd3d3XG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLXJlZGlyZWN0JywgbW9ja0V2ZW50LCByZWRpcmVjdFVybCk7XG5cblx0XHQvLyBTaG91bGQgbm90IHByZXZlbnQgZGVmYXVsdCBmb3Igd3d3IHByZWZpeCByZWRpcmVjdFxuXHRcdGFzc2VydC5vayghKG1vY2tFdmVudC5wcmV2ZW50RGVmYXVsdCEpLmNhbGxlZCk7XG5cblx0XHQvLyBDb250aW51ZSB3aXRoIG5vcm1hbCBsb2FkXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVkaXJlY3QgdG8gdHJ1c3RlZCBkb21haW4gaXMgYWxsb3dlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgcmVkaXJlY3RVcmwgPSAnaHR0cHM6Ly90cnVzdGVkLWRvbWFpbi5jb20vcmVkaXJlY3RlZCc7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSxcblx0XHRcdHsgZm9sbG93UmVkaXJlY3RzOiBmYWxzZSB9LFxuXHRcdFx0KHVyaSkgPT4gdXJpLmF1dGhvcml0eSA9PT0gJ3RydXN0ZWQtZG9tYWluLmNvbScgfHwgdXJpLmF1dGhvcml0eSA9PT0gJ2Fub3RoZXItdHJ1c3RlZC5jb20nXG5cdFx0KTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcmVkaXJlY3QgdG8gdHJ1c3RlZCBkb21haW5cblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtcmVkaXJlY3QnLCBtb2NrRXZlbnQsIHJlZGlyZWN0VXJsKTtcblxuXHRcdC8vIFNob3VsZCBub3QgcHJldmVudCBkZWZhdWx0IGZvciB0cnVzdGVkIGRvbWFpbiByZWRpcmVjdFxuXHRcdGFzc2VydC5vayghKG1vY2tFdmVudC5wcmV2ZW50RGVmYXVsdCEpLmNhbGxlZCk7XG5cblx0XHQvLyBDb250aW51ZSB3aXRoIG5vcm1hbCBsb2FkXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHR9KSk7XG5cblx0dGVzdCgncG9zdC1sb2FkIG5hdmlnYXRpb24gdG8gZGlmZmVyZW50IGRvbWFpbiBpcyBibG9ja2VkIHNpbGVudGx5IGFuZCBjb250ZW50IGlzIGV4dHJhY3RlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgYWRSZWRpcmVjdFVybCA9ICdodHRwczovL2V1cy5ydWJpY29ucHJvamVjdC5jb20vdXN5bmMuaHRtbD9wPTEyNzc2JztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLCB7IGZvbGxvd1JlZGlyZWN0czogZmFsc2UgfSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHN1Y2Nlc3NmdWwgcGFnZSBsb2FkXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYWQvdHJhY2tlciBzY3JpcHQgcmVkaXJlY3RpbmcgYWZ0ZXIgcGFnZSBsb2FkXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLW5hdmlnYXRlJywgbW9ja0V2ZW50LCBhZFJlZGlyZWN0VXJsKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0Ly8gTmF2aWdhdGlvbiBzaG91bGQgYmUgcHJldmVudGVkXG5cdFx0YXNzZXJ0Lm9rKChtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXHRcdC8vIEJ1dCByZXN1bHQgc2hvdWxkIGJlIG9rIChjb250ZW50IGV4dHJhY3RlZCksIE5PVCByZWRpcmVjdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRhc3NlcnQub2socmVzdWx0LnJlc3VsdC5pbmNsdWRlcygnVGVzdCBjb250ZW50IGZyb20gcGFnZScpKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2luaXRpYWwgc2FtZS1kb21haW4gbmF2aWdhdGlvbiBpcyBhbGxvd2VkIGJ1dCBsYXRlciBjcm9zcy1kb21haW4gbmF2aWdhdGlvbiBpcyBibG9ja2VkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCBzYW1lRG9tYWluVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3RoZXJwYWdlJztcblx0XHRjb25zdCBjcm9zc0RvbWFpblVybCA9ICdodHRwczovL2V1cy5ydWJpY29ucHJvamVjdC5jb20vdXN5bmMuaHRtbD9wPTEyNzc2JztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLCB7IGZvbGxvd1JlZGlyZWN0czogZmFsc2UgfSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIEZpcnN0IG5hdmlnYXRpb246IHNhbWUtYXV0aG9yaXR5LCBzaG91bGQgYmUgYWxsb3dlZFxuXHRcdGNvbnN0IGluaXRpYWxFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1uYXZpZ2F0ZScsIGluaXRpYWxFdmVudCwgc2FtZURvbWFpblVybCk7XG5cdFx0YXNzZXJ0Lm9rKCEoaW5pdGlhbEV2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblxuXHRcdC8vIFNpbXVsYXRlIHN1Y2Nlc3NmdWwgcGFnZSBsb2FkXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Ly8gU2Vjb25kIG5hdmlnYXRpb246IGNyb3NzLWRvbWFpbiBhZnRlciBsb2FkLCBzaG91bGQgYmUgYmxvY2tlZFxuXHRcdGNvbnN0IGNyb3NzRG9tYWluRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtbmF2aWdhdGUnLCBjcm9zc0RvbWFpbkV2ZW50LCBjcm9zc0RvbWFpblVybCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5vaygoY3Jvc3NEb21haW5FdmVudC5wcmV2ZW50RGVmYXVsdCEpLmNhbGxlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCdUZXN0IGNvbnRlbnQgZnJvbSBwYWdlJykpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVkaXJlY3QgdG8gbm9uLXRydXN0ZWQgZG9tYWluIGlzIGJsb2NrZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCByZWRpcmVjdFVybCA9ICdodHRwczovL3VudHJ1c3RlZC1kb21haW4uY29tL3JlZGlyZWN0ZWQnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksXG5cdFx0XHR7IGZvbGxvd1JlZGlyZWN0czogZmFsc2UgfSxcblx0XHRcdCh1cmkpID0+IHVyaS5hdXRob3JpdHkgPT09ICd0cnVzdGVkLWRvbWFpbi5jb20nXG5cdFx0KTtcblxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5zZW5kQ29tbWFuZC5yZXNvbHZlcyh7fSk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSByZWRpcmVjdCB0byBub24tdHJ1c3RlZCBkb21haW5cblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtcmVkaXJlY3QnLCBtb2NrRXZlbnQsIHJlZGlyZWN0VXJsKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0Ly8gU2hvdWxkIHByZXZlbnQgcmVkaXJlY3QgdG8gbm9uLXRydXN0ZWQgZG9tYWluXG5cdFx0YXNzZXJ0Lm9rKChtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAncmVkaXJlY3QnKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ3JlZGlyZWN0Jykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1VSSS5hdXRob3JpdHksICd1bnRydXN0ZWQtZG9tYWluLmNvbScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVkaXJlY3QgdG8gd2lsZGNhcmQgc3ViZG9tYWluIHRydXN0ZWQgZG9tYWluIGlzIGFsbG93ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdGNvbnN0IHJlZGlyZWN0VXJsID0gJ2h0dHBzOi8vc3ViLnRydXN0ZWQtZG9tYWluLmNvbS9yZWRpcmVjdGVkJztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLFxuXHRcdFx0eyBmb2xsb3dSZWRpcmVjdHM6IGZhbHNlIH0sXG5cdFx0XHQodXJpKSA9PiB1cmkuYXV0aG9yaXR5LmVuZHNXaXRoKCcudHJ1c3RlZC1kb21haW4uY29tJykgfHwgdXJpLmF1dGhvcml0eSA9PT0gJ3RydXN0ZWQtZG9tYWluLmNvbSdcblx0XHQpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSByZWRpcmVjdCB0byBzdWJkb21haW4gb2YgdHJ1c3RlZCB3aWxkY2FyZCBkb21haW5cblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtcmVkaXJlY3QnLCBtb2NrRXZlbnQsIHJlZGlyZWN0VXJsKTtcblxuXHRcdC8vIFNob3VsZCBub3QgcHJldmVudCBkZWZhdWx0IGZvciB3aWxkY2FyZCBzdWJkb21haW4gbWF0Y2hcblx0XHRhc3NlcnQub2soIShtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXG5cdFx0Ly8gQ29udGludWUgd2l0aCBub3JtYWwgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0fSkpO1xuXG5cdHRlc3QoJ25hdmlnYXRpb24gdG8gZG9tYWluIGJsb2NrZWQgYnkgaXNEb21haW5BbGxvd2VkIHJldHVybnMgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCBibG9ja2VkVXJsID0gJ2h0dHBzOi8vYmxvY2tlZC1kb21haW4uY29tL3BhdGgnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksIHsgZm9sbG93UmVkaXJlY3RzOiB0cnVlIH0sIHVuZGVmaW5lZCwgKHUpID0+IHUuYXV0aG9yaXR5ICE9PSAnYmxvY2tlZC1kb21haW4uY29tJyk7XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuc2VuZENvbW1hbmQucmVzb2x2ZXMoe30pO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLW5hdmlnYXRlJywgbW9ja0V2ZW50LCBibG9ja2VkVXJsKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0Lm9rKChtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnZXJyb3InKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5lcnJvcj8uaW5jbHVkZXMoJ2Jsb2NrZWQtZG9tYWluLmNvbScpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ25hdmlnYXRpb24gdG8gYWxsb3dlZCBkb21haW4gaXMgbm90IGJsb2NrZWQgYnkgaXNEb21haW5BbGxvd2VkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCBhbGxvd2VkVXJsID0gJ2h0dHBzOi8vYWxsb3dlZC1kb21haW4uY29tL3BhdGgnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksIHsgZm9sbG93UmVkaXJlY3RzOiB0cnVlIH0sIHVuZGVmaW5lZCwgKHUpID0+IHUuYXV0aG9yaXR5ICE9PSAnYmxvY2tlZC1kb21haW4uY29tJyk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1uYXZpZ2F0ZScsIG1vY2tFdmVudCwgYWxsb3dlZFVybCk7XG5cblx0XHQvLyBTaG91bGQgbm90IHByZXZlbnQgbmF2aWdhdGlvbiB0byBhbGxvd2VkIGRvbWFpblxuXHRcdGFzc2VydC5vayghKG1vY2tFdmVudC5wcmV2ZW50RGVmYXVsdCEpLmNhbGxlZCk7XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdH0pKTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gSFRUUCBFcnJvciBUZXN0c1xuXG5cdHRlc3QoJ0hUVFAgZXJyb3Igc3RhdHVzIGNvZGUgcmV0dXJucyBlcnJvciB3aXRoIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL25vdC1mb3VuZCcpO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBuZXR3b3JrIHJlc3BvbnNlIHdpdGggZXJyb3Igc3RhdHVzXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHt9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5yZXNwb25zZVJlY2VpdmVkJywge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHR0eXBlOiAnRG9jdW1lbnQnLFxuXHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnZXJyb3InKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXNDb2RlLCA0MDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvciwgJ05vdCBGb3VuZCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnSFRUUCA1MDAgZXJyb3IgcmV0dXJucyBzZXJ2ZXIgZXJyb3Igc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9zZXJ2ZXItZXJyb3InKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgbmV0d29yayByZXNwb25zZSB3aXRoIDUwMCBzdGF0dXNcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge307XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLmVtaXQoJ21lc3NhZ2UnLCBtb2NrRXZlbnQsICdOZXR3b3JrLnJlc3BvbnNlUmVjZWl2ZWQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdHR5cGU6ICdEb2N1bWVudCcsXG5cdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRzdGF0dXM6IDUwMCxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ0ludGVybmFsIFNlcnZlciBFcnJvcidcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdlcnJvcicpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAnZXJyb3InKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1c0NvZGUsIDUwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9yLCAnSW50ZXJuYWwgU2VydmVyIEVycm9yJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdIVFRQIGVycm9yIHdpdGhvdXQgc3RhdHVzIHRleHQgdXNlcyBmYWxsYmFjayBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9lcnJvcicpO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBuZXR3b3JrIHJlc3BvbnNlIHdpdGhvdXQgc3RhdHVzIHRleHRcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge307XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLmVtaXQoJ21lc3NhZ2UnLCBtb2NrRXZlbnQsICdOZXR3b3JrLnJlc3BvbnNlUmVjZWl2ZWQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdHR5cGU6ICdEb2N1bWVudCcsXG5cdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRzdGF0dXM6IDUwM1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ2Vycm9yJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdlcnJvcicpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzQ29kZSwgNTAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3IsICdIVFRQIGVycm9yIDUwMycpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE5ldHdvcmsgUmVxdWVzdCBUcmFja2luZyBUZXN0c1xuXG5cdHRlc3QoJ3RyYWNrcyBuZXR3b3JrIHJlcXVlc3RzIGFuZCB3YWl0cyBmb3IgY29tcGxldGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHBhZ2Ugc3RhcnRpbmcgdG8gbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgbmV0d29yayByZXF1ZXN0c1xuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuZW1pdCgnbWVzc2FnZScsIG1vY2tFdmVudCwgJ05ldHdvcmsucmVxdWVzdFdpbGxCZVNlbnQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJ1xuXHRcdH0pO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5yZXF1ZXN0V2lsbEJlU2VudCcsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTInXG5cdFx0fSk7XG5cblx0XHQvLyBTaW11bGF0ZSBwYWdlIGZpbmlzaCBsb2FkIChidXQgbmV0d29yayByZXF1ZXN0cyBzdGlsbCBwZW5kaW5nKVxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdC8vIFNpbXVsYXRlIG5ldHdvcmsgcmVxdWVzdHMgY29tcGxldGluZ1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5sb2FkaW5nRmluaXNoZWQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJ1xuXHRcdH0pO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5sb2FkaW5nRmluaXNoZWQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXEyJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdoYW5kbGVzIG5ldHdvcmsgcmVxdWVzdCBmYWlsdXJlcyBncmFjZWZ1bGx5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcGFnZSBsb2FkXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cblx0XHQvLyBTaW11bGF0ZSBhIG5ldHdvcmsgcmVxdWVzdCB0aGF0IGZhaWxzXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHt9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5yZXF1ZXN0V2lsbEJlU2VudCcsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnXG5cdFx0fSk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLmVtaXQoJ21lc3NhZ2UnLCBtb2NrRXZlbnQsICdOZXR3b3JrLmxvYWRpbmdGYWlsZWQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJ1xuXHRcdH0pO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdH0pKTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQWNjZXNzaWJpbGl0eSBUcmVlIEV4dHJhY3Rpb24gVGVzdHNcblxuXHR0ZXN0KCdleHRyYWN0cyBjb250ZW50IGZyb20gYWNjZXNzaWJpbGl0eSB0cmVlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCBheE5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaGVhZGluZzEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnaGVhZGluZycgfSxcblx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6ICdQYWdlIFRpdGxlJyB9LFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiBbeyBuYW1lOiAnbGV2ZWwnLCB2YWx1ZTogeyB0eXBlOiAnaW50ZWdlcicsIHZhbHVlOiAxIH0gfV0sXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3RleHQxJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3RleHQxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1N0YXRpY1RleHQnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnUGFnZSBUaXRsZScgfVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soeyBheE5vZGVzIH0pO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdvaycpIHtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCcjIFBhZ2UgVGl0bGUnKSk7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBET00gZXh0cmFjdGlvbiB3aGVuIGFjY2Vzc2liaWxpdHkgdHJlZSB5aWVsZHMgaW5zdWZmaWNpZW50IGNvbnRlbnQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdC8vIENyZWF0ZSBBWCB0cmVlIHdpdGggdmVyeSBzaG9ydCBjb250ZW50IChsZXNzIHRoYW4gTUlOX0NPTlRFTlRfTEVOR1RIKVxuXHRcdGNvbnN0IHNob3J0QVhOb2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1N0YXRpY1RleHQnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnU2hvcnQnIH1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKHsgYXhOb2Rlczogc2hvcnRBWE5vZGVzIH0pO1xuXG5cdFx0Ly8gTW9jayBET00gZXh0cmFjdGlvbiByZXR1cm5pbmcgbG9uZ2VyIGNvbnRlbnRcblx0XHRjb25zdCBkb21Db250ZW50ID0gJ1RoaXMgaXMgbXVjaCBsb25nZXIgY29udGVudCBleHRyYWN0ZWQgZnJvbSB0aGUgRE9NIHRoYXQgZXhjZWVkcyB0aGUgbWluaW11bSBjb250ZW50IGxlbmd0aCByZXF1aXJlbWVudCBhbmQgc2hvdWxkIGJlIHVzZWQgaW5zdGVhZCBvZiB0aGUgc2hvcnQgYWNjZXNzaWJpbGl0eSB0cmVlIGNvbnRlbnQuJztcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHQucmVzb2x2ZXMoZG9tQ29udGVudCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ29rJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHQsIGRvbUNvbnRlbnQpO1xuXHRcdH1cblx0XHQvLyBWZXJpZnkgZXhlY3V0ZUphdmFTY3JpcHQgd2FzIGNhbGxlZCBmb3IgRE9NIGV4dHJhY3Rpb25cblx0XHRhc3NlcnQub2sod2luZG93LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0LmNhbGxlZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gYWNjZXNzaWJpbGl0eSB0cmVlIGV4dHJhY3Rpb24gaGFuZ3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jayh7IGFjY2Vzc2liaWxpdHlIYW5nOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdlcnJvcicpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAnZXJyb3InKSB7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yLmluY2x1ZGVzKCdGYWlsZWQgdG8gZXh0cmFjdCBtZWFuaW5nZnVsIGNvbnRlbnQnKSk7XG5cdFx0fVxuXHRcdC8vIFZlcmlmeSBleGVjdXRlSmF2YVNjcmlwdCB3YXMgTk9UIGNhbGxlZCBmb3IgRE9NIGV4dHJhY3Rpb25cblx0XHRhc3NlcnQub2soIXdpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdC5jYWxsZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIGJvdGggYWNjZXNzaWJpbGl0eSB0cmVlIGFuZCBET00gZXh0cmFjdGlvbiB5aWVsZCBubyBjb250ZW50JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL2VtcHR5LXBhZ2UnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jayh7IGF4Tm9kZXM6IFtdIH0pO1xuXG5cdFx0Ly8gTW9jayBET00gZXh0cmFjdGlvbiByZXR1cm5pbmcgdW5kZWZpbmVkIChubyBjb250ZW50KVxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdC5yZXNvbHZlcyh1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ2Vycm9yJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdlcnJvcicpIHtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZXJyb3IuaW5jbHVkZXMoJ0ZhaWxlZCB0byBleHRyYWN0IG1lYW5pbmdmdWwgY29udGVudCcpKTtcblx0XHR9XG5cdFx0Ly8gVmVyaWZ5IGJvdGggZXh0cmFjdGlvbiBtZXRob2RzIHdlcmUgYXR0ZW1wdGVkXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdC5jYWxsZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgY29udGVudCBmcm9tIG11bHRpcGxlIGZyYW1lcyBpbmNsdWRpbmcgaWZyYW1lcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlLXdpdGgtaWZyYW1lcycpO1xuXG5cdFx0Ly8gQWNjZXNzaWJpbGl0eSBub2RlcyBmb3IgdGhlIG1haW4gZnJhbWVcblx0XHRjb25zdCBtYWluRnJhbWVOb2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ21haW4tcm9vdCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdSb290V2ViQXJlYScgfSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbWFpbi1oZWFkaW5nJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ21haW4taGVhZGluZycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdoZWFkaW5nJyB9LFxuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogJ01haW4gUGFnZSBDb250ZW50JyB9LFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiBbeyBuYW1lOiAnbGV2ZWwnLCB2YWx1ZTogeyB0eXBlOiAnaW50ZWdlcicsIHZhbHVlOiAxIH0gfV0sXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ21haW4tdGV4dCddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdtYWluLXRleHQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnU3RhdGljVGV4dCcgfSxcblx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6ICdNYWluIFBhZ2UgQ29udGVudCcgfVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHQvLyBBY2Nlc3NpYmlsaXR5IG5vZGVzIGZvciBhbiBpZnJhbWUgKHNpbXVsYXRpbmcgbmVzdGVkIGRvY3VtZW50YXRpb24gY29udGVudClcblx0XHRjb25zdCBpZnJhbWVOb2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2lmcmFtZS1yb290Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1Jvb3RXZWJBcmVhJyB9LFxuXHRcdFx0XHRjaGlsZElkczogWydpZnJhbWUtaGVhZGluZyddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdpZnJhbWUtaGVhZGluZycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdoZWFkaW5nJyB9LFxuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogJ0lmcmFtZSBEb2N1bWVudGF0aW9uIENvbnRlbnQnIH0sXG5cdFx0XHRcdHByb3BlcnRpZXM6IFt7IG5hbWU6ICdsZXZlbCcsIHZhbHVlOiB7IHR5cGU6ICdpbnRlZ2VyJywgdmFsdWU6IDIgfSB9XSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnaWZyYW1lLXRleHQnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaWZyYW1lLXRleHQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnU3RhdGljVGV4dCcgfSxcblx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6ICdJZnJhbWUgRG9jdW1lbnRhdGlvbiBDb250ZW50JyB9XG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdC8vIEFjY2Vzc2liaWxpdHkgbm9kZXMgZm9yIGEgbmVzdGVkIGlmcmFtZVxuXHRcdGNvbnN0IG5lc3RlZElmcmFtZU5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbmVzdGVkLXJvb3QnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnUm9vdFdlYkFyZWEnIH0sXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25lc3RlZC1wYXJhZ3JhcGgnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbmVzdGVkLXBhcmFncmFwaCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdwYXJhZ3JhcGgnIH0sXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25lc3RlZC10ZXh0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25lc3RlZC10ZXh0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1N0YXRpY1RleHQnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnRGVlcGx5IG5lc3RlZCBpZnJhbWUgY29udGVudCB0aGF0IHNob3VsZCBhbHNvIGJlIGV4dHJhY3RlZCcgfVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cblx0XHRjb25zdCBmcmFtZVRyZWUgPSB7XG5cdFx0XHRmcmFtZTogeyBpZDogJ21haW4tZnJhbWUnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3BhZ2Utd2l0aC1pZnJhbWVzJyB9LFxuXHRcdFx0Y2hpbGRGcmFtZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGZyYW1lOiB7IGlkOiAnaWZyYW1lLTEnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2lmcmFtZS1jb250ZW50JyB9LFxuXHRcdFx0XHRcdGNoaWxkRnJhbWVzOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGZyYW1lOiB7IGlkOiAnbmVzdGVkLWlmcmFtZScsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vbmVzdGVkLWNvbnRlbnQnIH0sXG5cdFx0XHRcdFx0XHRcdGNoaWxkRnJhbWVzOiBbXVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cblx0XHRzZXR1cERlYnVnZ2VyTW9jayh7XG5cdFx0XHRmcmFtZVRyZWUsXG5cdFx0XHRheE5vZGVzOiAoZnJhbWVJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoZnJhbWVJZCkge1xuXHRcdFx0XHRcdGNhc2UgJ21haW4tZnJhbWUnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIG1haW5GcmFtZU5vZGVzO1xuXHRcdFx0XHRcdGNhc2UgJ2lmcmFtZS0xJzpcblx0XHRcdFx0XHRcdHJldHVybiBpZnJhbWVOb2Rlcztcblx0XHRcdFx0XHRjYXNlICduZXN0ZWQtaWZyYW1lJzpcblx0XHRcdFx0XHRcdHJldHVybiBuZXN0ZWRJZnJhbWVOb2Rlcztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ29rJykge1xuXHRcdFx0Ly8gVmVyaWZ5IGNvbnRlbnQgZnJvbSBtYWluIGZyYW1lIGlzIGluY2x1ZGVkXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3VsdC5pbmNsdWRlcygnTWFpbiBQYWdlIENvbnRlbnQnKSwgJ1Nob3VsZCBpbmNsdWRlIG1haW4gZnJhbWUgY29udGVudCcpO1xuXHRcdFx0Ly8gVmVyaWZ5IGNvbnRlbnQgZnJvbSBpZnJhbWUgaXMgaW5jbHVkZWRcblx0XHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCdJZnJhbWUgRG9jdW1lbnRhdGlvbiBDb250ZW50JyksICdTaG91bGQgaW5jbHVkZSBpZnJhbWUgY29udGVudCcpO1xuXHRcdFx0Ly8gVmVyaWZ5IGNvbnRlbnQgZnJvbSBuZXN0ZWQgaWZyYW1lIGlzIGluY2x1ZGVkXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3VsdC5pbmNsdWRlcygnRGVlcGx5IG5lc3RlZCBpZnJhbWUgY29udGVudCcpLCAnU2hvdWxkIGluY2x1ZGUgbmVzdGVkIGlmcmFtZSBjb250ZW50Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gVmVyaWZ5IEFjY2Vzc2liaWxpdHkuZ2V0RnVsbEFYVHJlZSB3YXMgY2FsbGVkIGZvciBlYWNoIGZyYW1lXG5cdFx0Y29uc3QgZ2V0RnVsbEFYVHJlZUNhbGxzID0gd2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLnNlbmRDb21tYW5kLmdldENhbGxzKClcblx0XHRcdC5maWx0ZXIoY2FsbCA9PiBjYWxsLmFyZ3NbMF0gPT09ICdBY2Nlc3NpYmlsaXR5LmdldEZ1bGxBWFRyZWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RnVsbEFYVHJlZUNhbGxzLmxlbmd0aCwgMywgJ1Nob3VsZCBjYWxsIGdldEZ1bGxBWFRyZWUgZm9yIGFsbCAzIGZyYW1lcycpO1xuXHR9KSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEhlYWRlciBNb2RpZmljYXRpb24gVGVzdHNcblxuXHR0ZXN0KCdvbkJlZm9yZVNlbmRIZWFkZXJzIGFkZHMgcHJpdmFjeSBoZWFkZXJzIGZvciBhbGwgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpKTtcblxuXHRcdC8vIEdldCB0aGUgY2FsbGJhY2sgcGFzc2VkIHRvIG9uQmVmb3JlU2VuZEhlYWRlcnNcblx0XHRhc3NlcnQub2sod2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVNlbmRIZWFkZXJzLmNhbGxlZCk7XG5cdFx0Y29uc3QgY2FsbGJhY2sgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uQmVmb3JlU2VuZEhlYWRlcnMuZ2V0Q2FsbCgwKS5hcmdzWzBdO1xuXG5cdFx0Ly8gTW9jayBjYWxsYmFjayBmdW5jdGlvblxuXHRcdGxldCBtb2RpZmllZEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKGRldGFpbHM6IHsgcmVxdWVzdEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSkgPT4ge1xuXHRcdFx0bW9kaWZpZWRIZWFkZXJzID0gZGV0YWlscy5yZXF1ZXN0SGVhZGVycztcblx0XHR9O1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSBzdWItcmVzb3VyY2UgcmVxdWVzdCAobm8gcmVzb3VyY2VUeXBlKVxuXHRcdGNhbGxiYWNrKFxuXHRcdFx0e1xuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N0eWxlLmNzcycsXG5cdFx0XHRcdHJlcXVlc3RIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J1Rlc3RIZWFkZXInOiAnVGVzdFZhbHVlJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bW9ja0NhbGxiYWNrXG5cdFx0KTtcblxuXHRcdC8vIFZlcmlmeSBwcml2YWN5IGhlYWRlcnMgd2VyZSBhZGRlZFxuXHRcdGFzc2VydC5vayhtb2RpZmllZEhlYWRlcnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZEhlYWRlcnNbJ0ROVCddLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZEhlYWRlcnNbJ1NlYy1HUEMnXSwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWRIZWFkZXJzWydUZXN0SGVhZGVyJ10sICdUZXN0VmFsdWUnKTtcblx0XHQvLyBBY2NlcHQgaGVhZGVyIHNob3VsZCBOT1QgYmUgc2V0IGZvciBub24tbWFpbkZyYW1lIHJlcXVlc3RzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkSGVhZGVyc1snQWNjZXB0J10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uQmVmb3JlU2VuZEhlYWRlcnMgYWRkcyBBY2NlcHQgaGVhZGVyIHByZWZlcnJpbmcgbWFya2Rvd24gZm9yIG1haW5GcmFtZSByZXF1ZXN0cycsICgpID0+IHtcblx0XHRjcmVhdGVXZWJQYWdlTG9hZGVyKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25CZWZvcmVTZW5kSGVhZGVycy5jYWxsZWQpO1xuXHRcdGNvbnN0IGNhbGxiYWNrID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVNlbmRIZWFkZXJzLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGxldCBtb2RpZmllZEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKGRldGFpbHM6IHsgcmVxdWVzdEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSkgPT4ge1xuXHRcdFx0bW9kaWZpZWRIZWFkZXJzID0gZGV0YWlscy5yZXF1ZXN0SGVhZGVycztcblx0XHR9O1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSBtYWluRnJhbWUgbmF2aWdhdGlvbiByZXF1ZXN0XG5cdFx0Y2FsbGJhY2soXG5cdFx0XHR7XG5cdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ21haW5GcmFtZScsXG5cdFx0XHRcdHJlcXVlc3RIZWFkZXJzOiB7fVxuXHRcdFx0fSxcblx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdCk7XG5cblx0XHRhc3NlcnQub2sobW9kaWZpZWRIZWFkZXJzKTtcblx0XHRhc3NlcnQub2sobW9kaWZpZWRIZWFkZXJzWydBY2NlcHQnXT8uaW5jbHVkZXMoJ3RleHQvbWFya2Rvd24nKSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGlmaWVkSGVhZGVyc1snQWNjZXB0J10/LmluY2x1ZGVzKCd0ZXh0L2h0bWwnKSk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBEb3dubG9hZCBQcmV2ZW50aW9uIFRlc3RzXG5cblx0dGVzdCgnb25IZWFkZXJzUmVjZWl2ZWQgcmVwbGFjZXMgQ29udGVudC1EaXNwb3NpdGlvbiBhdHRhY2htZW50IHdpdGggaW5saW5lIGZvciB0ZXh0IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpKTtcblxuXHRcdC8vIEdldCB0aGUgY2FsbGJhY2sgcGFzc2VkIHRvIG9uSGVhZGVyc1JlY2VpdmVkXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQuY2FsbGVkKTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQuZ2V0Q2FsbCgwKS5hcmdzWzBdO1xuXG5cdFx0Zm9yIChjb25zdCBjb250ZW50VHlwZSBvZiBbJ2FwcGxpY2F0aW9uL3htbCcsICd0ZXh0L2h0bWwnLCAndGV4dC9wbGFpbicsICdhcHBsaWNhdGlvbi9qc29uJywgJ2FwcGxpY2F0aW9uL3hodG1sK3htbCcsICdhcHBsaWNhdGlvbi9yc3MreG1sJywgJ2FwcGxpY2F0aW9uL3ZuZC5jdXN0b20ranNvbiddKSB7XG5cdFx0XHRsZXQgcmVzcG9uc2U6IHsgcmVzcG9uc2VIZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+OyBjYW5jZWw/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBtb2NrQ2FsbGJhY2sgPSAocmVzdWx0OiB7IHJlc3BvbnNlSGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPjsgY2FuY2VsPzogYm9vbGVhbiB9KSA9PiB7XG5cdFx0XHRcdHJlc3BvbnNlID0gcmVzdWx0O1xuXHRcdFx0fTtcblxuXHRcdFx0bGlzdGVuZXIoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2ZpbGUnLFxuXHRcdFx0XHRcdHJlc3BvbnNlSGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0NvbnRlbnQtRGlzcG9zaXRpb24nOiBbJ2F0dGFjaG1lbnQ7IGZpbGVuYW1lPVwiZmlsZS54bWxcIiddLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6IFtjb250ZW50VHlwZV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlLCBgRXhwZWN0ZWQgcmVzcG9uc2UgZm9yICR7Y29udGVudFR5cGV9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlIS5yZXNwb25zZUhlYWRlcnMhWydDb250ZW50LURpc3Bvc2l0aW9uJ10sIFsnaW5saW5lJ10sIGBFeHBlY3RlZCBpbmxpbmUgZm9yICR7Y29udGVudFR5cGV9YCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UhLmNhbmNlbCwgZmFsc2UsIGBTaG91bGQgbm90IGNhbmNlbCBmb3IgJHtjb250ZW50VHlwZX1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ29uSGVhZGVyc1JlY2VpdmVkIGNhbmNlbHMgQ29udGVudC1EaXNwb3NpdGlvbiBhdHRhY2htZW50IGZvciBiaW5hcnkgY29udGVudCcsICgpID0+IHtcblx0XHRjcmVhdGVXZWJQYWdlTG9hZGVyKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJykpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGZvciAoY29uc3QgY29udGVudFR5cGUgb2YgWydhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nLCAnYXBwbGljYXRpb24vemlwJywgJ2FwcGxpY2F0aW9uL3BkZicsICdpbWFnZS9wbmcnLCAndmlkZW8vbXA0J10pIHtcblx0XHRcdGxldCByZXNwb25zZTogeyBjYW5jZWw/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBtb2NrQ2FsbGJhY2sgPSAocmVzdWx0OiB7IGNhbmNlbD86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0XHRyZXNwb25zZSA9IHJlc3VsdDtcblx0XHRcdH07XG5cblx0XHRcdGxpc3RlbmVyKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9maWxlLmJpbicsXG5cdFx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQ29udGVudC1EaXNwb3NpdGlvbic6IFsnYXR0YWNobWVudDsgZmlsZW5hbWU9XCJmaWxlLmJpblwiJ10sXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogW2NvbnRlbnRUeXBlXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0bW9ja0NhbGxiYWNrXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzcG9uc2UsIGBFeHBlY3RlZCByZXNwb25zZSBmb3IgJHtjb250ZW50VHlwZX1gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZSEuY2FuY2VsLCB0cnVlLCBgRXhwZWN0ZWQgY2FuY2VsIGZvciAke2NvbnRlbnRUeXBlfWApO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnb25IZWFkZXJzUmVjZWl2ZWQgY2FuY2VscyBDb250ZW50LURpc3Bvc2l0aW9uIGF0dGFjaG1lbnQgd2hlbiBjb250ZW50IHR5cGUgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRjcmVhdGVXZWJQYWdlTG9hZGVyKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJykpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGxldCByZXNwb25zZTogeyBjYW5jZWw/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKHJlc3VsdDogeyBjYW5jZWw/OiBib29sZWFuIH0pID0+IHtcblx0XHRcdHJlc3BvbnNlID0gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRsaXN0ZW5lcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9maWxlJyxcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtRGlzcG9zaXRpb24nOiBbJ2F0dGFjaG1lbnQ7IGZpbGVuYW1lPVwiZmlsZVwiJ11cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZSEuY2FuY2VsLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnb25IZWFkZXJzUmVjZWl2ZWQgYWxsb3dzIG5vcm1hbCByZXNwb25zZXMgd2l0aG91dCBDb250ZW50LURpc3Bvc2l0aW9uIGF0dGFjaG1lbnQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpKTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkhlYWRlcnNSZWNlaXZlZC5nZXRDYWxsKDApLmFyZ3NbMF07XG5cblx0XHRsZXQgcmVzcG9uc2U6IHsgcmVzcG9uc2VIZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+IH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKHJlc3VsdDogeyByZXNwb25zZUhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gfSkgPT4ge1xuXHRcdFx0cmVzcG9uc2UgPSByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgbm9ybWFsIEhUTUwgcmVzcG9uc2Vcblx0XHRsaXN0ZW5lcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyxcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6IFsndGV4dC9odG1sJ10sXG5cdFx0XHRcdFx0J0NvbnRlbnQtRGlzcG9zaXRpb24nOiBbJ2lubGluZSddXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRtb2NrQ2FsbGJhY2tcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UhLnJlc3BvbnNlSGVhZGVycywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnd2lsbC1kb3dubG9hZCBoYW5kbGVyIGNhbmNlbHMgZG93bmxvYWQgYW5kIHJldHVybnMgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2RsLmdvb2dsZS5jb20vbGludXgvY2hyb21lL3JwbS9zdGFibGUveDg2XzY0L3JlcG9kYXRhL3JlcG9tZC54bWwnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Ly8gR2V0IHRoZSB3aWxsLWRvd25sb2FkIGhhbmRsZXJcblx0XHRhc3NlcnQub2sod2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ub24uY2FsbGVkKTtcblx0XHRjb25zdCB3aWxsRG93bmxvYWRDYWxsID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ub24uZ2V0Q2FsbHMoKVxuXHRcdFx0LmZpbmQoY2FsbCA9PiBjYWxsLmFyZ3NbMF0gPT09ICd3aWxsLWRvd25sb2FkJyk7XG5cdFx0YXNzZXJ0Lm9rKHdpbGxEb3dubG9hZENhbGwpO1xuXHRcdGNvbnN0IHdpbGxEb3dubG9hZEhhbmRsZXIgPSB3aWxsRG93bmxvYWRDYWxsIS5hcmdzWzFdO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSBkb3dubG9hZCBiZWluZyB0cmlnZ2VyZWRcblx0XHRjb25zdCBtb2NrSXRlbSA9IHtcblx0XHRcdGNhbmNlbDogc2lub24uc3R1YigpLFxuXHRcdFx0Z2V0RmlsZW5hbWU6IHNpbm9uLnN0dWIoKS5yZXR1cm5zKCdyZXBvbWQueG1sJylcblx0XHR9O1xuXHRcdHdpbGxEb3dubG9hZEhhbmRsZXIoe30sIG1vY2tJdGVtKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0Ly8gVmVyaWZ5IGRvd25sb2FkIHdhcyBjYW5jZWxsZWRcblx0XHRhc3NlcnQub2sobW9ja0l0ZW0uY2FuY2VsLmNhbGxlZCk7XG5cblx0XHQvLyBWZXJpZnkgZXJyb3IgcmVzdWx0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdlcnJvcicpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAnZXJyb3InKSB7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yLmluY2x1ZGVzKCdEb3dubG9hZCBub3QgYWxsb3dlZCcpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZXJyb3IuaW5jbHVkZXMoJ3JlcG9tZC54bWwnKSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTWFya2Rvd24gQ29udGVudCBOZWdvdGlhdGlvbiBUZXN0c1xuXG5cdHRlc3QoJ29uSGVhZGVyc1JlY2VpdmVkIGRldGVjdHMgbWFya2Rvd24gY29udGVudC10eXBlIGZvciBtYWluRnJhbWUgcmVzcG9uc2VzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZVdlYlBhZ2VMb2FkZXIoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKSk7XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQuZ2V0Q2FsbCgwKS5hcmdzWzBdO1xuXG5cdFx0bGV0IHJlc3BvbnNlOiB7IGNhbmNlbD86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtb2NrQ2FsbGJhY2sgPSAocmVzdWx0OiB7IGNhbmNlbD86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0cmVzcG9uc2UgPSByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgbWFya2Rvd24gcmVzcG9uc2UgZm9yIG1haW5GcmFtZVxuXHRcdGxpc3RlbmVyKFxuXHRcdFx0e1xuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnLFxuXHRcdFx0XHRyZXNvdXJjZVR5cGU6ICdtYWluRnJhbWUnLFxuXHRcdFx0XHRyZXNwb25zZUhlYWRlcnM6IHtcblx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogWyd0ZXh0L21hcmtkb3duOyBjaGFyc2V0PXV0Zi04J11cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZSEuY2FuY2VsLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtkb3duIGNvbnRlbnQtdHlwZSBleHRyYWN0aW9uIHVzZXMgcmF3IGJvZHknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vbGVhcm4ubWljcm9zb2Z0LmNvbS9lbi11cy9kb2NzJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0Ly8gVXNlIEFYIG5vZGVzIHRoYXQgZXhjZWVkIE1JTl9DT05URU5UX0xFTkdUSCBzbyB0aGUgdGVzdCBvbmx5IHBhc3Nlc1xuXHRcdC8vIGlmIHRoZSBtYXJrZG93biBicmFuY2ggc2hvcnQtY2lyY3VpdHMgYmVmb3JlIGFjY2Vzc2liaWxpdHkgZXh0cmFjdGlvbi5cblx0XHRjb25zdCBsb25nQVhOb2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1N0YXRpY1RleHQnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnVGhpcyBpcyBhIGxvbmcgYWNjZXNzaWJpbGl0eSB0cmVlIGNvbnRlbnQgdGhhdCBleGNlZWRzIHRoZSBtaW5pbXVtIGNvbnRlbnQgbGVuZ3RoIHJlcXVpcmVtZW50IG9mIG9uZSBodW5kcmVkIGNoYXJhY3RlcnMgZWFzaWx5LicgfVxuXHRcdFx0fVxuXHRcdF07XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soeyBheE5vZGVzOiBsb25nQVhOb2RlcyB9KTtcblxuXHRcdC8vIEdldCB0aGUgb25IZWFkZXJzUmVjZWl2ZWQgbGlzdGVuZXIgdG8gc2ltdWxhdGUgbWFya2Rvd24gcmVzcG9uc2Vcblx0XHRjb25zdCBoZWFkZXJzTGlzdGVuZXIgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHJlY2VpdmluZyBhIG1hcmtkb3duIGNvbnRlbnQtdHlwZSByZXNwb25zZVxuXHRcdGhlYWRlcnNMaXN0ZW5lcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAnbWFpbkZyYW1lJyxcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6IFsndGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOCddXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQoKSA9PiB7IH1cblx0XHQpO1xuXG5cdFx0Ly8gTWFrZSBleGVjdXRlSmF2YVNjcmlwdCByZXR1cm4gbWFya2Rvd24gY29udGVudFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdC5yZXNvbHZlcygnIyBIZWxsbyBXb3JsZFxcblxcblRoaXMgaXMgbWFya2Rvd24gY29udGVudC4nKTtcblxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCcjIEhlbGxvIFdvcmxkJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCdUaGlzIGlzIG1hcmtkb3duIGNvbnRlbnQuJykpO1xuXHR9KSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIERpc3Bvc2FsIFRlc3RzXG5cblx0dGVzdCgnZGlzcG9zZXMgcmVzb3VyY2VzIGFmdGVyIGxvYWQgY29tcGxldGVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0YXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHQvLyBUaGUgbG9hZGVyIHNob3VsZCBjYWxsIGRlc3Ryb3kgb24gdGhlIHdpbmRvdyB3aGVuIGRpc3Bvc2VkXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy5kZXN0cm95LmNhbGxlZCk7XG5cdH0pKTtcblxuXHQvLyNlbmRyZWdpb25cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFlBQVksV0FBVztBQUN2QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMscUJBQXFCO0FBTzlCLE1BQU0sZ0JBQWdCO0FBQUEsRUFnQnJCLGNBQWM7QUFmZCxTQUFpQixhQUFhLG9CQUFJLElBQThDO0FBQ2hGLFNBQWlCLGlCQUFpQixvQkFBSSxJQUFrQztBQUV4RSxTQUFPLFVBQVUsTUFBTSxLQUFLLEVBQUUsU0FBUztBQUN2QyxTQUFPLFdBQVcsTUFBTSxLQUFLLEVBQUUsUUFBUSxpQkFBaUI7QUFDeEQsU0FBTyxvQkFBb0IsTUFBTSxLQUFLLEVBQUUsU0FBUyxNQUFTO0FBRTFELFNBQU8sVUFBVTtBQUFBLE1BQ2hCLFlBQVk7QUFBQSxRQUNYLHFCQUFxQixNQUFNLEtBQUs7QUFBQSxRQUNoQyxtQkFBbUIsTUFBTSxLQUFLO0FBQUEsTUFDL0I7QUFBQSxNQUNBLElBQUksTUFBTSxLQUFLO0FBQUEsSUFDaEI7QUFHQyxTQUFLLFdBQVcsSUFBSSxhQUFhO0FBQUEsRUFDbEM7QUFBQSxFQUVBLEtBQUssT0FBZSxVQUE4QztBQUNqRSxRQUFJLENBQUMsS0FBSyxXQUFXLElBQUksS0FBSyxHQUFHO0FBQ2hDLFdBQUssV0FBVyxJQUFJLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDOUI7QUFDQSxTQUFLLFdBQVcsSUFBSSxLQUFLLEVBQUcsS0FBSyxRQUFRO0FBQ3pDLFNBQUssZUFBZSxJQUFJLFFBQVE7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLEdBQUcsT0FB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
