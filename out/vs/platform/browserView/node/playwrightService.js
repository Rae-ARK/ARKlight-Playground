import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { DeferredPromise, disposableTimeout, raceTimeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { PlaywrightTab, DialogInterruptedError } from "./playwrightTab.js";
import { generateUuid } from "../../../base/common/uuid.js";
const DEFERRED_RESULT_CLEANUP_MS = 5 * 6e4;
const SESSION_INACTIVITY_MS = 30 * 6e4;
const OPEN_PAGE_NAVIGATION_TIMEOUT_MS = 3e4;
function isCDPRequest(message) {
  const candidate = message;
  return typeof candidate.id === "number" && typeof candidate.method === "string" && (candidate.sessionId === void 0 || typeof candidate.sessionId === "string");
}
class PlaywrightService extends Disposable {
  constructor(windowId, browserViewGroupRemoteService, logService, agentNetworkFilterService, telemetryService) {
    super();
    this.windowId = windowId;
    this.browserViewGroupRemoteService = browserViewGroupRemoteService;
    this.logService = logService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.telemetryService = telemetryService;
    this._sessions = this._register(new DisposableMap());
    /** In-flight session initializations keyed by session ID. */
    this._pendingInits = /* @__PURE__ */ new Map();
    /** Inactivity timers keyed by session ID. */
    this._inactivityTimers = this._register(new DisposableMap());
    /** Global set of tracked page IDs (shared across all sessions). */
    this._trackedPages = /* @__PURE__ */ new Set();
    this._onDidChangeTrackedPages = this._register(new Emitter());
    this.onDidChangeTrackedPages = this._onDidChangeTrackedPages.event;
  }
  /**
   * Get or create a fully-initialized {@link PlaywrightSession} for the
   * given session ID. Creates the CDP group and Playwright browser
   * connection if the session does not already exist.
   */
  async _getOrCreateSession(sessionId) {
    const existing = this._sessions.get(sessionId);
    if (existing) {
      this._touchSession(sessionId);
      return existing;
    }
    const pending = this._pendingInits.get(sessionId);
    if (pending) {
      return pending;
    }
    const initPromise = this._initSession(sessionId);
    this._pendingInits.set(sessionId, initPromise);
    try {
      return await initPromise;
    } finally {
      this._pendingInits.delete(sessionId);
    }
  }
  /**
   * Create and fully initialize a new session: browser view group,
   * Playwright CDP connection, and page replay.
   */
  async _initSession(sessionId) {
    this.logService.debug(`[PlaywrightService] Initializing session ${sessionId}`);
    const group = await this.browserViewGroupRemoteService.createGroup({ mainWindowId: this.windowId, sessionId });
    const actionScope = { activeCalls: 0 };
    let browser;
    try {
      const playwright = await import("playwright-core");
      const sub = group.onCDPMessage((msg) => transport.onmessage?.(msg));
      const transport = {
        close() {
          sub.dispose();
          this.onclose?.();
        },
        send: (rawMessage) => {
          if (!isCDPRequest(rawMessage)) {
            throw new Error(`[PlaywrightService] Unexpected CDP transport payload for session ${sessionId} (type: ${typeof rawMessage})`);
          }
          const message = rawMessage;
          if (actionScope.activeCalls === 0 && message.method.startsWith("Emulation.")) {
            setTimeout(() => {
              transport.onmessage?.({ id: message.id, result: {}, sessionId: message.sessionId });
            }, 1);
            return;
          }
          void group.sendCDPMessage(message);
        }
      };
      browser = await playwright.chromium.connectOverCDP(transport);
    } catch (e) {
      group.dispose();
      throw e;
    }
    this.logService.debug(`[PlaywrightService] Connected to browser for session ${sessionId}`);
    if (this._store.isDisposed) {
      browser.close().catch(() => {
      });
      group.dispose();
      throw new Error("PlaywrightService was disposed during initialization");
    }
    const session = new PlaywrightSession(
      sessionId,
      browser,
      group,
      actionScope,
      this.logService,
      this.agentNetworkFilterService,
      this.telemetryService,
      (viewId) => this.startTrackingPage(viewId)
    );
    session.registerDisposable(group.onDidAddView((e) => {
      if (!this._trackedPages.has(e.viewId)) {
        this._trackedPages.add(e.viewId);
        this._fireTrackedPages();
      }
      for (const [id, other] of this._sessions) {
        if (id !== sessionId) {
          void other.group.addView(e.viewId).catch(() => {
          });
        }
      }
    }));
    session.registerDisposable(group.onDidRemoveView((e) => {
      if (this._trackedPages.delete(e.viewId)) {
        this._fireTrackedPages();
      }
    }));
    browser.on("disconnected", () => {
      this.logService.debug(`[PlaywrightService] Browser disconnected for session ${sessionId}`);
      this._sessions.deleteAndDispose(sessionId);
      this._inactivityTimers.deleteAndDispose(sessionId);
    });
    this._sessions.set(sessionId, session);
    for (const viewId of [...this._trackedPages]) {
      try {
        await session.group.addView(viewId);
      } catch {
        this.logService.debug(`[PlaywrightService] Stale tracked page ${viewId} removed during replay`);
        this._trackedPages.delete(viewId);
        this._fireTrackedPages();
      }
    }
    this._touchSession(sessionId);
    return session;
  }
  // --- Page tracking (global) ---
  async startTrackingPage(viewId) {
    if (!this._trackedPages.has(viewId)) {
      this._trackedPages.add(viewId);
      this._fireTrackedPages();
    }
    for (const session of this._sessions.values()) {
      session.group.addView(viewId);
    }
  }
  async stopTrackingPage(viewId) {
    if (this._trackedPages.delete(viewId)) {
      this._fireTrackedPages();
    }
    for (const session of this._sessions.values()) {
      session.group.removeView(viewId);
    }
  }
  async isPageTracked(viewId) {
    return this._trackedPages.has(viewId);
  }
  async getTrackedPages() {
    return [...this._trackedPages];
  }
  // --- Playwright operations (delegated to per-session instances) ---
  async openPage(sessionId, url) {
    const session = await this._getOrCreateSession(sessionId);
    return session.openPage(url);
  }
  async getSummary(sessionId, pageId) {
    const session = await this._getOrCreateSession(sessionId);
    return session.getSummary(pageId);
  }
  async invokeFunctionRaw(sessionId, pageId, fnDef, ...args) {
    const session = await this._getOrCreateSession(sessionId);
    return session.invokeFunctionRaw(pageId, fnDef, ...args);
  }
  async invokeFunction(sessionId, pageId, fnDef, args = [], timeoutMs) {
    const session = await this._getOrCreateSession(sessionId);
    return session.invokeFunction(pageId, fnDef, args, timeoutMs);
  }
  async waitForDeferredResult(sessionId, deferredResultId, timeoutMs) {
    const session = await this._getOrCreateSession(sessionId);
    return session.waitForDeferredResult(deferredResultId, timeoutMs);
  }
  async replyToFileChooser(sessionId, pageId, files) {
    const session = await this._getOrCreateSession(sessionId);
    return session.replyToFileChooser(pageId, files);
  }
  async replyToDialog(sessionId, pageId, accept, promptText) {
    const session = await this._getOrCreateSession(sessionId);
    return session.replyToDialog(pageId, accept, promptText);
  }
  // --- Session lifecycle ---
  async disposeSession(sessionId) {
    if (this._sessions.has(sessionId)) {
      this.logService.debug(`[PlaywrightService] Disposing session ${sessionId}`);
      this._sessions.deleteAndDispose(sessionId);
      this._inactivityTimers.deleteAndDispose(sessionId);
    }
  }
  // --- Private helpers ---
  _fireTrackedPages() {
    this._onDidChangeTrackedPages.fire([...this._trackedPages]);
  }
  /**
   * Reset the inactivity timer for a session. After
   * {@link SESSION_INACTIVITY_MS} of no activity the session is
   * automatically disposed.
   */
  _touchSession(sessionId) {
    this._inactivityTimers.deleteAndDispose(sessionId);
    const timer = disposableTimeout(
      () => {
        this.logService.debug(`[PlaywrightService] Session ${sessionId} inactive for ${SESSION_INACTIVITY_MS / 6e4}m, disposing`);
        this._sessions.deleteAndDispose(sessionId);
        this._inactivityTimers.deleteAndDispose(sessionId);
      },
      SESSION_INACTIVITY_MS
    );
    this._inactivityTimers.set(sessionId, timer);
  }
}
class PlaywrightSession extends Disposable {
  constructor(sessionId, _browser, group, actionScope, logService, agentNetworkFilterService, telemetryService, onDidCreatePage) {
    super();
    this.sessionId = sessionId;
    this._browser = _browser;
    this.group = group;
    this.actionScope = actionScope;
    this.logService = logService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.telemetryService = telemetryService;
    this.onDidCreatePage = onDidCreatePage;
    // --- Page matching ---
    this._viewIdToPage = /* @__PURE__ */ new Map();
    this._pageToViewId = /* @__PURE__ */ new WeakMap();
    this._tabs = /* @__PURE__ */ new WeakMap();
    /** View IDs received from the group but not yet matched with a page. */
    this._viewIdQueue = [];
    /** Pages received from Playwright but not yet matched with a view ID. */
    this._pageQueue = [];
    this._watchedContexts = /* @__PURE__ */ new WeakSet();
    this._openContext = void 0;
    /** In-flight deferred results keyed by their generated ID. */
    this._deferredResults = this._register(new DisposableMap());
    this._register(this.group);
    this._register(this.group.onDidAddView((e) => this._onViewAdded(e.viewId)));
    this._register(this.group.onDidRemoveView((e) => this._onViewRemoved(e.viewId)));
    this._scanForNewContexts();
  }
  /** Register a disposable to be cleaned up when this session is disposed. */
  registerDisposable(d) {
    this._register(d);
  }
  // --- Page operations ---
  async openPage(url) {
    if (!this._openContext) {
      this._openContext = await this._browser.newContext();
      this._onContextAdded(this._openContext);
    }
    const page = await this._openContext.newPage();
    const viewId = await this._onPageAdded(page);
    await this.onDidCreatePage(viewId);
    if (url && url !== "about:blank" && page.url() !== url) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: OPEN_PAGE_NAVIGATION_TIMEOUT_MS });
      } catch (error) {
        if (!isNavigationTimeoutError(error)) {
          throw error;
        }
        throw new Error(`Navigation to ${url} timed out after ${OPEN_PAGE_NAVIGATION_TIMEOUT_MS} ms. The page (ID: ${viewId}) is open and can be reused.`);
      }
    }
    const summary = await this._getSummary(viewId);
    return { pageId: viewId, summary };
  }
  async getSummary(pageId) {
    return this._getSummary(pageId, true);
  }
  async invokeFunctionRaw(pageId, fnDef, ...args) {
    const fn = await this._compileFunction(fnDef);
    return this._runAgainstPage(pageId, (page) => fn(page, args));
  }
  async invokeFunction(pageId, fnDef, args = [], timeoutMs) {
    this.logService.info(`[PlaywrightSession] Invoking function on view ${pageId}`);
    const logCtx = {
      startedAt: Date.now(),
      codeLength: fnDef.length,
      codeLineCount: fnDef.split("\n").length,
      pageMethodsCalled: /* @__PURE__ */ new Map(),
      wasDeferred: false,
      resumeCount: 0,
      logged: false
    };
    let fn;
    try {
      fn = await this._compileFunction(fnDef);
    } catch (err) {
      this._logExecution(logCtx, false);
      const summary2 = await this._getSummary(pageId);
      return { error: err instanceof Error ? err.message : String(err), summary: summary2 };
    }
    const wrappedCallback = async (page) => fn(createPageApiProxy(page, logCtx.pageMethodsCalled), args);
    if (timeoutMs !== void 0) {
      return this._runWithDeferral(pageId, wrappedCallback, timeoutMs, void 0, logCtx);
    }
    let result, error;
    try {
      result = await this._runAgainstPage(pageId, wrappedCallback);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    this._logExecution(logCtx, !error);
    const summary = await this._getSummary(pageId);
    return { result, error, summary };
  }
  async waitForDeferredResult(deferredResultId, timeoutMs) {
    const entry = this._deferredResults.get(deferredResultId);
    if (!entry) {
      throw new Error(`No deferred result found with ID "${deferredResultId}". It may have been cleaned up or already consumed.`);
    }
    const { pageId, promise, logCtx } = entry;
    if (logCtx) {
      logCtx.resumeCount++;
    }
    this._deferredResults.deleteAndDispose(deferredResultId);
    return this._runWithDeferral(pageId, () => promise, timeoutMs, deferredResultId, logCtx);
  }
  async replyToFileChooser(pageId, files) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to reply to file chooser");
    }
    await tab.replyToFileChooser(files);
    const summary = await tab.getSummary();
    return { summary };
  }
  async replyToDialog(pageId, accept, promptText) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to reply to dialog");
    }
    await tab.replyToDialog(accept, promptText);
    const summary = await tab.getSummary();
    return { summary };
  }
  // --- Private: page operations ---
  async _getSummary(pageId, full = false) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to get page summary");
    }
    return tab.getSummary(full);
  }
  async _runAgainstPage(pageId, callback) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to execute function against page");
    }
    return tab.safeRunAgainstPage(async () => callback(page));
  }
  async _runWithDeferral(pageId, callback, timeoutMs, existingDeferredId, logCtx) {
    const deferred = new DeferredPromise();
    if (existingDeferredId === void 0 && logCtx) {
      deferred.p.then(() => this._logExecution(logCtx, true), () => this._logExecution(logCtx, false));
    }
    const wrappedPromise = this._runAgainstPage(pageId, async (page) => {
      const promise = callback(page);
      promise.catch(() => {
      });
      deferred.settleWith(promise);
      return promise;
    });
    let result, error;
    let interrupted = false;
    try {
      result = await raceTimeout(wrappedPromise, timeoutMs, () => {
        interrupted = true;
      });
    } catch (err) {
      if (err instanceof DialogInterruptedError) {
        interrupted = true;
      }
      error = err instanceof Error ? err.message : String(err);
    }
    let deferredResultId;
    if (interrupted) {
      if (logCtx) {
        logCtx.wasDeferred = true;
      }
      deferredResultId = existingDeferredId ?? generateUuid();
      const cleanup = disposableTimeout(() => this._deferredResults.deleteAndDispose(deferredResultId), DEFERRED_RESULT_CLEANUP_MS);
      this._deferredResults.set(deferredResultId, { pageId, promise: deferred.p, logCtx, dispose: () => cleanup.dispose() });
      this.logService.info(`[PlaywrightSession] Execution interrupted, deferred as ${deferredResultId}`);
    } else if (logCtx) {
      this._logExecution(logCtx, !error);
    }
    const summary = await this._getSummary(pageId);
    return { result, error, summary, deferredResultId };
  }
  /**
   * Emit completion telemetry for a single {@link invokeFunction} call, once the
   * page work settles. Idempotent: only the first call for a given context emits,
   * so the synchronous and settlement-promise paths can both call it safely.
   */
  _logExecution(ctx, success) {
    if (ctx.logged) {
      return;
    }
    ctx.logged = true;
    const entries = [...ctx.pageMethodsCalled.entries()];
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    this.telemetryService.publicLog2(
      "integratedBrowser.tools.runPlaywrightCode.completed",
      {
        pageMethodsCalled: JSON.stringify(Object.fromEntries(entries)),
        pageMethodsCalledDcount: entries.length,
        pageMethodsCalledCount: total,
        success: success ? 1 : 0,
        wasDeferred: ctx.wasDeferred ? 1 : 0,
        resumeCount: ctx.resumeCount,
        durationMs: Math.round(Date.now() - ctx.startedAt),
        codeLength: ctx.codeLength,
        codeLineCount: ctx.codeLineCount
      }
    );
  }
  async _compileFunction(fnDef) {
    const vm = await import("vm");
    return vm.compileFunction(`return (${fnDef})(page, ...args)`, ["page", "args"], { parsingContext: vm.createContext() });
  }
  // --- Private: page matching (view ↔ page pairing) ---
  async _getPage(viewId) {
    const resolved = this._viewIdToPage.get(viewId);
    if (resolved) {
      return resolved;
    }
    const queued = this._viewIdQueue.find((item) => item.viewId === viewId);
    if (queued) {
      return queued.page.p;
    }
    throw new Error(`Page "${viewId}" not found`);
  }
  _onViewAdded(viewId, timeoutMs = 1e4) {
    const resolved = this._viewIdToPage.get(viewId);
    if (resolved) {
      return Promise.resolve(resolved);
    }
    const queued = this._viewIdQueue.find((item) => item.viewId === viewId);
    if (queued) {
      return queued.page.p;
    }
    const deferred = new DeferredPromise();
    const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for page`)), timeoutMs);
    deferred.p.finally(() => {
      clearTimeout(timeout);
      this._viewIdQueue = this._viewIdQueue.filter((item) => item.viewId !== viewId);
      if (this._viewIdQueue.length === 0) {
        this._stopScanning();
      }
    });
    this._viewIdQueue.push({ viewId, page: deferred });
    this._tryMatch();
    this._ensureScanning();
    return deferred.p;
  }
  _onViewRemoved(viewId) {
    this._viewIdQueue = this._viewIdQueue.filter((item) => item.viewId !== viewId);
    const page = this._viewIdToPage.get(viewId);
    if (page) {
      this._pageToViewId.delete(page);
    }
    this._viewIdToPage.delete(viewId);
  }
  _onPageAdded(page, timeoutMs = 1e4) {
    const resolved = this._pageToViewId.get(page);
    if (resolved) {
      return Promise.resolve(resolved);
    }
    const queued = this._pageQueue.find((item) => item.page === page);
    if (queued) {
      return queued.viewId.p;
    }
    this._onContextAdded(page.context());
    page.once("close", () => this._onPageRemoved(page));
    page.setDefaultTimeout(1e4);
    this._tabs.set(page, new PlaywrightTab(page, this.actionScope, this.agentNetworkFilterService));
    const deferred = new DeferredPromise();
    const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for browser view`)), timeoutMs);
    deferred.p.finally(() => {
      clearTimeout(timeout);
      this._pageQueue = this._pageQueue.filter((item) => item.page !== page);
    });
    this._pageQueue.push({ page, viewId: deferred });
    this._tryMatch();
    return deferred.p;
  }
  _onPageRemoved(page) {
    this._pageQueue = this._pageQueue.filter((item) => item.page !== page);
    const viewId = this._pageToViewId.get(page);
    if (viewId) {
      this._viewIdToPage.delete(viewId);
    }
    this._pageToViewId.delete(page);
  }
  _onContextAdded(context) {
    if (this._watchedContexts.has(context)) {
      return;
    }
    this._watchedContexts.add(context);
    context.on("page", (page) => this._onPageAdded(page));
    context.on("close", () => this._watchedContexts.delete(context));
    for (const page of context.pages()) {
      this._onPageAdded(page);
    }
  }
  // --- Private: matching ---
  _tryMatch() {
    while (this._viewIdQueue.length > 0 && this._pageQueue.length > 0) {
      const viewIdItem = this._viewIdQueue.shift();
      const pageItem = this._pageQueue.shift();
      this._viewIdToPage.set(viewIdItem.viewId, pageItem.page);
      this._pageToViewId.set(pageItem.page, viewIdItem.viewId);
      viewIdItem.page.complete(pageItem.page);
      pageItem.viewId.complete(viewIdItem.viewId);
      this.logService.debug(`[PlaywrightSession] Matched view ${viewIdItem.viewId} \u2192 page`);
    }
    if (this._viewIdQueue.length === 0) {
      this._stopScanning();
    }
  }
  // --- Private: context scanning ---
  _scanForNewContexts() {
    for (const context of this._browser.contexts()) {
      this._onContextAdded(context);
    }
  }
  _ensureScanning() {
    if (this._scanTimer === void 0) {
      this._scanTimer = setInterval(() => this._scanForNewContexts(), 100);
    }
  }
  _stopScanning() {
    if (this._scanTimer !== void 0) {
      clearInterval(this._scanTimer);
      this._scanTimer = void 0;
    }
  }
  dispose() {
    this._stopScanning();
    this._browser?.close().catch(() => {
    });
    for (const { page } of this._viewIdQueue) {
      page.error(new Error("PlaywrightSession disposed"));
    }
    for (const { viewId } of this._pageQueue) {
      viewId.error(new Error("PlaywrightSession disposed"));
    }
    this._viewIdQueue = [];
    this._pageQueue = [];
    super.dispose();
  }
}
function isNavigationTimeoutError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "TimeoutError" || /Timeout \d+ms exceeded/.test(error.message) || /navigation timeout/i.test(error.message);
}
const PAGE_PROXY_IGNORED_PROPS = /* @__PURE__ */ new Set([
  "then",
  "catch",
  "finally",
  "toJSON",
  "toString",
  "valueOf",
  "constructor"
]);
const PAGE_PROXY_MAX_DEPTH = 3;
function createPageApiProxy(target, methodCalls, prefix = "", depth = 0) {
  if (depth >= PAGE_PROXY_MAX_DEPTH) {
    return target;
  }
  const cache = /* @__PURE__ */ new Map();
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (typeof prop !== "string" || prop.startsWith("_") || PAGE_PROXY_IGNORED_PROPS.has(prop)) {
        return value;
      }
      const cached = cache.get(prop);
      if (cached !== void 0) {
        return cached;
      }
      if (typeof value === "function") {
        const name = prefix + prop;
        const wrapper = function(...args) {
          methodCalls.set(name, (methodCalls.get(name) ?? 0) + 1);
          return Reflect.apply(value, t, args);
        };
        cache.set(prop, wrapper);
        return wrapper;
      }
      if (value !== null && typeof value === "object") {
        const nested = createPageApiProxy(value, methodCalls, `${prefix}${prop}.`, depth + 1);
        cache.set(prop, nested);
        return nested;
      }
      return value;
    }
  });
}
export {
  PlaywrightService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L25vZGUvcGxheXdyaWdodFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUludm9rZUZ1bmN0aW9uUmVzdWx0LCBJUGxheXdyaWdodFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcGxheXdyaWdodFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3R3JvdXBSZW1vdGVTZXJ2aWNlIH0gZnJvbSAnLi4vbm9kZS9icm93c2VyVmlld0dyb3VwUmVtb3RlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdHcm91cCB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyVmlld0dyb3VwLmpzJztcbmltcG9ydCB7IFBsYXl3cmlnaHRUYWIsIERpYWxvZ0ludGVycnVwdGVkRXJyb3IgfSBmcm9tICcuL3BsYXl3cmlnaHRUYWIuanMnO1xuaW1wb3J0IHsgQ0RQUmVxdWVzdCwgQ0RQUmVzcG9uc2UgfSBmcm9tICcuLi9jb21tb24vY2RwL3R5cGVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB0eXBlIHsgQnJvd3NlciwgQnJvd3NlckNvbnRleHQsIENvbm5lY3RPdmVyQ0RQVHJhbnNwb3J0LCBQYWdlIH0gZnJvbSAncGxheXdyaWdodC1jb3JlJztcblxuLyoqXG4gKiBUcmFja3Mgd2hldGhlciBhIGNhbGxlci1pbml0aWF0ZWQgUGxheXdyaWdodCBhY3Rpb24gaXMgY3VycmVudGx5IGluIGZsaWdodC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUGxheXdyaWdodEFjdGlvblNjb3BlIHtcblx0YWN0aXZlQ2FsbHM6IG51bWJlcjtcbn1cblxuY29uc3QgREVGRVJSRURfUkVTVUxUX0NMRUFOVVBfTVMgPSA1ICogNjBfMDAwOyAvLyA1IG1pbnV0ZXNcbmNvbnN0IFNFU1NJT05fSU5BQ1RJVklUWV9NUyA9IDMwICogNjBfMDAwOyAvLyAzMCBtaW51dGVzXG5jb25zdCBPUEVOX1BBR0VfTkFWSUdBVElPTl9USU1FT1VUX01TID0gMzBfMDAwO1xuXG4vKipcbiAqIE5hcnJvdyBhIHJhdyBQbGF5d3JpZ2h0IHRyYW5zcG9ydCBwYXlsb2FkIHRvIGEge0BsaW5rIENEUFJlcXVlc3R9LlxuICpcbiAqIFBsYXl3cmlnaHQgdHlwZXMgdGhlIGBzZW5kYCBwYXlsb2FkIGFzIGBvYmplY3RgIGJ1dCBwYXNzZXMgc3RydWN0dXJlZCBDRFBcbiAqIG1lc3NhZ2VzIChub3QgSlNPTiBzdHJpbmdzKSBmb3IgYSBjYWxsZXItc3VwcGxpZWQgdHJhbnNwb3J0LCBzbyB0aGlzIGd1YXJkXG4gKiBpcyBleHBlY3RlZCB0byBhbHdheXMgaG9sZC4gSXQgZXhpc3RzIHRvIGZhaWwgbG91ZGx5ICh0aGUgY2FsbGVyIHRocm93cylcbiAqIHNob3VsZCBhIGZ1dHVyZSBQbGF5d3JpZ2h0IHZlcnNpb24gY2hhbmdlIHRoZSB3aXJlIGZvcm1hdCwgcmF0aGVyIHRoYW5cbiAqIHNpbGVudGx5IGZvcndhcmRpbmcgbWFsZm9ybWVkIG1lc3NhZ2VzLlxuICovXG5mdW5jdGlvbiBpc0NEUFJlcXVlc3QobWVzc2FnZTogb2JqZWN0KTogbWVzc2FnZSBpcyBDRFBSZXF1ZXN0IHtcblx0Y29uc3QgY2FuZGlkYXRlID0gbWVzc2FnZSBhcyBQYXJ0aWFsPENEUFJlcXVlc3Q+O1xuXHRyZXR1cm4gdHlwZW9mIGNhbmRpZGF0ZS5pZCA9PT0gJ251bWJlcidcblx0XHQmJiB0eXBlb2YgY2FuZGlkYXRlLm1ldGhvZCA9PT0gJ3N0cmluZydcblx0XHQmJiAoY2FuZGlkYXRlLnNlc3Npb25JZCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBjYW5kaWRhdGUuc2Vzc2lvbklkID09PSAnc3RyaW5nJyk7XG59XG5cblxuXG4vKipcbiAqIFNoYXJlZC1wcm9jZXNzIGltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJUGxheXdyaWdodFNlcnZpY2V9LlxuICpcbiAqIE1hbmFnZXMge0BsaW5rIFBsYXl3cmlnaHRTZXNzaW9ufSBpbnN0YW5jZXMga2V5ZWQgYnkgc2Vzc2lvbiBJRC5cbiAqIEVhY2ggc2Vzc2lvbiBoYXMgaXRzIG93biBQbGF5d3JpZ2h0IGJyb3dzZXIgY29ubmVjdGlvbiBhbmQgYnJvd3NlciB2aWV3XG4gKiBncm91cCwgY3JlYXRlZCBlYWdlcmx5IGJ5IHRoZSBzZXJ2aWNlIHdoZW4gdGhlIHNlc3Npb24gaXMgZmlyc3QgcmVxdWVzdGVkLlxuICpcbiAqIFBhZ2UgdHJhY2tpbmcgaXMgY3VycmVudGx5IGdsb2JhbDogdHJhY2tlZCBwYWdlcyBhcmUgc2hhcmVkIGFjcm9zcyBhbGxcbiAqIHNlc3Npb25zIHNvIGV2ZXJ5IHNlc3Npb24gY2FuIGludGVyYWN0IHdpdGggZXZlcnkgdHJhY2tlZCBwYWdlLlxuICovXG5leHBvcnQgY2xhc3MgUGxheXdyaWdodFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVBsYXl3cmlnaHRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIFBsYXl3cmlnaHRTZXNzaW9uPigpKTtcblxuXHQvKiogSW4tZmxpZ2h0IHNlc3Npb24gaW5pdGlhbGl6YXRpb25zIGtleWVkIGJ5IHNlc3Npb24gSUQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdJbml0cyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPFBsYXl3cmlnaHRTZXNzaW9uPj4oKTtcblxuXHQvKiogSW5hY3Rpdml0eSB0aW1lcnMga2V5ZWQgYnkgc2Vzc2lvbiBJRC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW5hY3Rpdml0eVRpbWVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXG5cdC8qKiBHbG9iYWwgc2V0IG9mIHRyYWNrZWQgcGFnZSBJRHMgKHNoYXJlZCBhY3Jvc3MgYWxsIHNlc3Npb25zKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdHJhY2tlZFBhZ2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUcmFja2VkUGFnZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBzdHJpbmdbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHJhY2tlZFBhZ2VzOiBFdmVudDxyZWFkb25seSBzdHJpbmdbXT4gPSB0aGlzLl9vbkRpZENoYW5nZVRyYWNrZWRQYWdlcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd0lkOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld0dyb3VwUmVtb3RlU2VydmljZTogSUJyb3dzZXJWaWV3R3JvdXBSZW1vdGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlOiBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBvciBjcmVhdGUgYSBmdWxseS1pbml0aWFsaXplZCB7QGxpbmsgUGxheXdyaWdodFNlc3Npb259IGZvciB0aGVcblx0ICogZ2l2ZW4gc2Vzc2lvbiBJRC4gQ3JlYXRlcyB0aGUgQ0RQIGdyb3VwIGFuZCBQbGF5d3JpZ2h0IGJyb3dzZXJcblx0ICogY29ubmVjdGlvbiBpZiB0aGUgc2Vzc2lvbiBkb2VzIG5vdCBhbHJlYWR5IGV4aXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3JDcmVhdGVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxQbGF5d3JpZ2h0U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHR0aGlzLl90b3VjaFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHQvLyBEZS1kdXBsaWNhdGUgY29uY3VycmVudCBpbml0aWFsaXphdGlvbiBmb3IgdGhlIHNhbWUgc2Vzc2lvbi5cblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0luaXRzLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gcGVuZGluZztcblx0XHR9XG5cblx0XHRjb25zdCBpbml0UHJvbWlzZSA9IHRoaXMuX2luaXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5fcGVuZGluZ0luaXRzLnNldChzZXNzaW9uSWQsIGluaXRQcm9taXNlKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGluaXRQcm9taXNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nSW5pdHMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhbmQgZnVsbHkgaW5pdGlhbGl6ZSBhIG5ldyBzZXNzaW9uOiBicm93c2VyIHZpZXcgZ3JvdXAsXG5cdCAqIFBsYXl3cmlnaHQgQ0RQIGNvbm5lY3Rpb24sIGFuZCBwYWdlIHJlcGxheS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2luaXRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxQbGF5d3JpZ2h0U2Vzc2lvbj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW1BsYXl3cmlnaHRTZXJ2aWNlXSBJbml0aWFsaXppbmcgc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gYXdhaXQgdGhpcy5icm93c2VyVmlld0dyb3VwUmVtb3RlU2VydmljZS5jcmVhdGVHcm91cCh7IG1haW5XaW5kb3dJZDogdGhpcy53aW5kb3dJZCwgc2Vzc2lvbklkIH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9uU2NvcGU6IElQbGF5d3JpZ2h0QWN0aW9uU2NvcGUgPSB7IGFjdGl2ZUNhbGxzOiAwIH07XG5cblx0XHRsZXQgYnJvd3NlcjogQnJvd3Nlcjtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGxheXdyaWdodCA9IGF3YWl0IGltcG9ydCgncGxheXdyaWdodC1jb3JlJyk7XG5cdFx0XHRjb25zdCBzdWIgPSBncm91cC5vbkNEUE1lc3NhZ2UobXNnID0+IHRyYW5zcG9ydC5vbm1lc3NhZ2U/Lihtc2cpKTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydDogQ29ubmVjdE92ZXJDRFBUcmFuc3BvcnQgPSB7XG5cdFx0XHRcdGNsb3NlKCkge1xuXHRcdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5vbmNsb3NlPy4oKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2VuZDogKHJhd01lc3NhZ2UpID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzQ0RQUmVxdWVzdChyYXdNZXNzYWdlKSkge1xuXHRcdFx0XHRcdFx0Ly8gRmFpbCBsb3VkbHk6IHJldHVybmluZyBzaWxlbnRseSB3b3VsZCBsZWF2ZSBQbGF5d3JpZ2h0XG5cdFx0XHRcdFx0XHQvLyB3YWl0aW5nIGZvciBhIHJlc3BvbnNlIGFuZCBzdXJmYWNlIGxhdGVyIGFzIGFuIG9wYXF1ZSBoYW5nLlxuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbUGxheXdyaWdodFNlcnZpY2VdIFVuZXhwZWN0ZWQgQ0RQIHRyYW5zcG9ydCBwYXlsb2FkIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSAodHlwZTogJHt0eXBlb2YgcmF3TWVzc2FnZX0pYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSByYXdNZXNzYWdlO1xuXHRcdFx0XHRcdC8vIEJsb2NrIFBsYXl3cmlnaHQncyBhdXRvbWF0aWMgLyBkZWZhdWx0IGVtdWxhdGlvbiB0cmFmZmljLiBXZVxuXHRcdFx0XHRcdC8vIG9ubHkgZm9yd2FyZCBgRW11bGF0aW9uLipgIHRvIHRoZSB2aWV3IHdoaWxlIGEgY2FsbGVyLWluaXRpYXRlZFxuXHRcdFx0XHRcdC8vIGFjdGlvbiBpcyBydW5uaW5nIChzZWUgSVBsYXl3cmlnaHRBY3Rpb25TY29wZSkgc28gdGhlIHdvcmtiZW5jaFxuXHRcdFx0XHRcdC8vIHN0YXlzIGluIGNvbnRyb2wgb2YgZGV2aWNlIGVtdWxhdGlvbi4gT3RoZXIgdHJhZmZpYyBcdTIwMTQgZS5nLiB0aGVcblx0XHRcdFx0XHQvLyBzZXR1cCBQbGF5d3JpZ2h0IGlzc3VlcyBvbiBpdHMgb3duIHdoZW4gY29ubmVjdGluZyBvciBjcmVhdGluZ1xuXHRcdFx0XHRcdC8vIHBhZ2VzIFx1MjAxNCBpcyBhY2tub3dsZWRnZWQgd2l0aCBhIHN5bnRoZXRpYyBzdWNjZXNzIHJlc3BvbnNlIGFuZFxuXHRcdFx0XHRcdC8vIG5ldmVyIGhpdHMgdGhlIHZpZXcuXG5cdFx0XHRcdFx0aWYgKGFjdGlvblNjb3BlLmFjdGl2ZUNhbGxzID09PSAwICYmIG1lc3NhZ2UubWV0aG9kLnN0YXJ0c1dpdGgoJ0VtdWxhdGlvbi4nKSkge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRyYW5zcG9ydC5vbm1lc3NhZ2U/Lih7IGlkOiBtZXNzYWdlLmlkLCByZXN1bHQ6IHt9LCBzZXNzaW9uSWQ6IG1lc3NhZ2Uuc2Vzc2lvbklkIH0gc2F0aXNmaWVzIENEUFJlc3BvbnNlKTtcblx0XHRcdFx0XHRcdH0sIDEpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR2b2lkIGdyb3VwLnNlbmRDRFBNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0YnJvd3NlciA9IGF3YWl0IHBsYXl3cmlnaHQuY2hyb21pdW0uY29ubmVjdE92ZXJDRFAodHJhbnNwb3J0KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRncm91cC5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW1BsYXl3cmlnaHRTZXJ2aWNlXSBDb25uZWN0ZWQgdG8gYnJvd3NlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblxuXHRcdC8vIElmIHRoZSBzZXJ2aWNlIHdhcyBkaXNwb3NlZCB3aGlsZSB3ZSB3ZXJlIGNvbm5lY3RpbmcsIGNsZWFuIHVwLlxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRicm93c2VyLmNsb3NlKCkuY2F0Y2goKCkgPT4geyAvKiBpZ25vcmUgKi8gfSk7XG5cdFx0XHRncm91cC5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1BsYXl3cmlnaHRTZXJ2aWNlIHdhcyBkaXNwb3NlZCBkdXJpbmcgaW5pdGlhbGl6YXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFBsYXl3cmlnaHRTZXNzaW9uKFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0YnJvd3Nlcixcblx0XHRcdGdyb3VwLFxuXHRcdFx0YWN0aW9uU2NvcGUsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0XHR0aGlzLmFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHR2aWV3SWQgPT4gdGhpcy5zdGFydFRyYWNraW5nUGFnZSh2aWV3SWQpLFxuXHRcdCk7XG5cblx0XHQvLyBLZWVwIHRoZSBnbG9iYWwgdHJhY2tlZCBzZXQgaW4gc3luYyB3aXRoIGdyb3VwIGV2ZW50cy4gV2hlbiBhXG5cdFx0Ly8gdmlldyBpcyBhZGRlZCB2aWEgZXh0ZXJuYWwgbWVhbnMgKGUuZy4gQ0RQIGNyZWF0ZVRhcmdldCksIHRoZVxuXHRcdC8vIGdyb3VwIGZpcmVzIG9uRGlkQWRkVmlldyBcdTIwMTQgdXBkYXRlIF90cmFja2VkUGFnZXMgYWNjb3JkaW5nbHkuXG5cdFx0Ly8gVGhlIFNldCBtYWtlcyBkb3VibGUtYWRkcyAoZnJvbSBzdGFydFRyYWNraW5nUGFnZSkgaGFybWxlc3MuXG5cdFx0Ly8gQWxzbyByZXBsaWNhdGUgdGhlIHZpZXcgaW50byBvdGhlciBzZXNzaW9ucyBzbyB0aGF0IENEUC1jcmVhdGVkXG5cdFx0Ly8gdGFyZ2V0cyBiZWNvbWUgYWNjZXNzaWJsZSBldmVyeXdoZXJlLCBub3QganVzdCB0aGUgb3JpZ2luYXRpbmcgc2Vzc2lvbi5cblx0XHRzZXNzaW9uLnJlZ2lzdGVyRGlzcG9zYWJsZShncm91cC5vbkRpZEFkZFZpZXcoZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3RyYWNrZWRQYWdlcy5oYXMoZS52aWV3SWQpKSB7XG5cdFx0XHRcdHRoaXMuX3RyYWNrZWRQYWdlcy5hZGQoZS52aWV3SWQpO1xuXHRcdFx0XHR0aGlzLl9maXJlVHJhY2tlZFBhZ2VzKCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtpZCwgb3RoZXJdIG9mIHRoaXMuX3Nlc3Npb25zKSB7XG5cdFx0XHRcdGlmIChpZCAhPT0gc2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0dm9pZCBvdGhlci5ncm91cC5hZGRWaWV3KGUudmlld0lkKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHNlc3Npb24ucmVnaXN0ZXJEaXNwb3NhYmxlKGdyb3VwLm9uRGlkUmVtb3ZlVmlldyhlID0+IHtcblx0XHRcdGlmICh0aGlzLl90cmFja2VkUGFnZXMuZGVsZXRlKGUudmlld0lkKSkge1xuXHRcdFx0XHR0aGlzLl9maXJlVHJhY2tlZFBhZ2VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT24gYnJvd3NlciBkaXNjb25uZWN0LCBkaXNwb3NlIHRoZSBzZXNzaW9uIHNvIGl0IHdpbGwgYmVcblx0XHQvLyByZWNyZWF0ZWQgZnJlc2ggb24gdGhlIG5leHQgdG9vbCBjYWxsLlxuXHRcdGJyb3dzZXIub24oJ2Rpc2Nvbm5lY3RlZCcsICgpID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW1BsYXl3cmlnaHRTZXJ2aWNlXSBCcm93c2VyIGRpc2Nvbm5lY3RlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX2luYWN0aXZpdHlUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgc2Vzc2lvbik7XG5cblx0XHQvLyBSZXBsYXkgZ2xvYmFsbHkgdHJhY2tlZCBwYWdlcyBpbnRvIHRoZSBuZXcgc2Vzc2lvbidzIGdyb3VwLlxuXHRcdC8vIFBhZ2VzIG1heSBoYXZlIGJlZW4gcmVtb3ZlZCBzaW5jZSB0aGV5IHdlcmUgdHJhY2tlZCBcdTIwMTQgY2F0Y2ggYW5kXG5cdFx0Ly8gZXZpY3Qgc3RhbGUgZW50cmllcyBzbyB0aGV5IGRvbid0IGFjY3VtdWxhdGUuXG5cdFx0Zm9yIChjb25zdCB2aWV3SWQgb2YgWy4uLnRoaXMuX3RyYWNrZWRQYWdlc10pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb24uZ3JvdXAuYWRkVmlldyh2aWV3SWQpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW1BsYXl3cmlnaHRTZXJ2aWNlXSBTdGFsZSB0cmFja2VkIHBhZ2UgJHt2aWV3SWR9IHJlbW92ZWQgZHVyaW5nIHJlcGxheWApO1xuXHRcdFx0XHR0aGlzLl90cmFja2VkUGFnZXMuZGVsZXRlKHZpZXdJZCk7XG5cdFx0XHRcdHRoaXMuX2ZpcmVUcmFja2VkUGFnZXMoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl90b3VjaFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdC8vIC0tLSBQYWdlIHRyYWNraW5nIChnbG9iYWwpIC0tLVxuXG5cdGFzeW5jIHN0YXJ0VHJhY2tpbmdQYWdlKHZpZXdJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gVXBkYXRlIHRoZSBjYW5vbmljYWwgc2V0IGRpcmVjdGx5IHNvIHRyYWNraW5nIHdvcmtzIGV2ZW4gd2hlblxuXHRcdC8vIG5vIHNlc3Npb25zIGV4aXN0IHlldC4gVGhlIFNldCBtYWtlcyB0aGUgZG91YmxlLWFkZCBmcm9tXG5cdFx0Ly8gdGhlIGdyb3VwJ3Mgb25EaWRBZGRWaWV3IGxpc3RlbmVyIGhhcm1sZXNzLlxuXHRcdGlmICghdGhpcy5fdHJhY2tlZFBhZ2VzLmhhcyh2aWV3SWQpKSB7XG5cdFx0XHR0aGlzLl90cmFja2VkUGFnZXMuYWRkKHZpZXdJZCk7XG5cdFx0XHR0aGlzLl9maXJlVHJhY2tlZFBhZ2VzKCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0c2Vzc2lvbi5ncm91cC5hZGRWaWV3KHZpZXdJZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RvcFRyYWNraW5nUGFnZSh2aWV3SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl90cmFja2VkUGFnZXMuZGVsZXRlKHZpZXdJZCkpIHtcblx0XHRcdHRoaXMuX2ZpcmVUcmFja2VkUGFnZXMoKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRzZXNzaW9uLmdyb3VwLnJlbW92ZVZpZXcodmlld0lkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBpc1BhZ2VUcmFja2VkKHZpZXdJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrZWRQYWdlcy5oYXModmlld0lkKTtcblx0fVxuXG5cdGFzeW5jIGdldFRyYWNrZWRQYWdlcygpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl90cmFja2VkUGFnZXNdO1xuXHR9XG5cblx0Ly8gLS0tIFBsYXl3cmlnaHQgb3BlcmF0aW9ucyAoZGVsZWdhdGVkIHRvIHBlci1zZXNzaW9uIGluc3RhbmNlcykgLS0tXG5cblx0YXN5bmMgb3BlblBhZ2Uoc2Vzc2lvbklkOiBzdHJpbmcsIHVybDogc3RyaW5nKTogUHJvbWlzZTx7IHBhZ2VJZDogc3RyaW5nOyBzdW1tYXJ5OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbi5vcGVuUGFnZSh1cmwpO1xuXHR9XG5cblx0YXN5bmMgZ2V0U3VtbWFyeShzZXNzaW9uSWQ6IHN0cmluZywgcGFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbi5nZXRTdW1tYXJ5KHBhZ2VJZCk7XG5cdH1cblxuXHRhc3luYyBpbnZva2VGdW5jdGlvblJhdzxUPihzZXNzaW9uSWQ6IHN0cmluZywgcGFnZUlkOiBzdHJpbmcsIGZuRGVmOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbi5pbnZva2VGdW5jdGlvblJhdyhwYWdlSWQsIGZuRGVmLCAuLi5hcmdzKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZUZ1bmN0aW9uKHNlc3Npb25JZDogc3RyaW5nLCBwYWdlSWQ6IHN0cmluZywgZm5EZWY6IHN0cmluZywgYXJnczogdW5rbm93bltdID0gW10sIHRpbWVvdXRNcz86IG51bWJlcik6IFByb21pc2U8SUludm9rZUZ1bmN0aW9uUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdHJldHVybiBzZXNzaW9uLmludm9rZUZ1bmN0aW9uKHBhZ2VJZCwgZm5EZWYsIGFyZ3MsIHRpbWVvdXRNcyk7XG5cdH1cblxuXHRhc3luYyB3YWl0Rm9yRGVmZXJyZWRSZXN1bHQoc2Vzc2lvbklkOiBzdHJpbmcsIGRlZmVycmVkUmVzdWx0SWQ6IHN0cmluZywgdGltZW91dE1zOiBudW1iZXIpOiBQcm9taXNlPElJbnZva2VGdW5jdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbi53YWl0Rm9yRGVmZXJyZWRSZXN1bHQoZGVmZXJyZWRSZXN1bHRJZCwgdGltZW91dE1zKTtcblx0fVxuXG5cdGFzeW5jIHJlcGx5VG9GaWxlQ2hvb3NlcihzZXNzaW9uSWQ6IHN0cmluZywgcGFnZUlkOiBzdHJpbmcsIGZpbGVzOiBzdHJpbmdbXSk6IFByb21pc2U8eyBzdW1tYXJ5OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbi5yZXBseVRvRmlsZUNob29zZXIocGFnZUlkLCBmaWxlcyk7XG5cdH1cblxuXHRhc3luYyByZXBseVRvRGlhbG9nKHNlc3Npb25JZDogc3RyaW5nLCBwYWdlSWQ6IHN0cmluZywgYWNjZXB0OiBib29sZWFuLCBwcm9tcHRUZXh0Pzogc3RyaW5nKTogUHJvbWlzZTx7IHN1bW1hcnk6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdHJldHVybiBzZXNzaW9uLnJlcGx5VG9EaWFsb2cocGFnZUlkLCBhY2NlcHQsIHByb21wdFRleHQpO1xuXHR9XG5cblx0Ly8gLS0tIFNlc3Npb24gbGlmZWN5Y2xlIC0tLVxuXG5cdGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2VydmljZV0gRGlzcG9zaW5nIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9pbmFjdGl2aXR5VGltZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUHJpdmF0ZSBoZWxwZXJzIC0tLVxuXG5cdHByaXZhdGUgX2ZpcmVUcmFja2VkUGFnZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUcmFja2VkUGFnZXMuZmlyZShbLi4udGhpcy5fdHJhY2tlZFBhZ2VzXSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzZXQgdGhlIGluYWN0aXZpdHkgdGltZXIgZm9yIGEgc2Vzc2lvbi4gQWZ0ZXJcblx0ICoge0BsaW5rIFNFU1NJT05fSU5BQ1RJVklUWV9NU30gb2Ygbm8gYWN0aXZpdHkgdGhlIHNlc3Npb24gaXNcblx0ICogYXV0b21hdGljYWxseSBkaXNwb3NlZC5cblx0ICovXG5cdHByaXZhdGUgX3RvdWNoU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2luYWN0aXZpdHlUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHRpbWVyID0gZGlzcG9zYWJsZVRpbWVvdXQoXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW1BsYXl3cmlnaHRTZXJ2aWNlXSBTZXNzaW9uICR7c2Vzc2lvbklkfSBpbmFjdGl2ZSBmb3IgJHtTRVNTSU9OX0lOQUNUSVZJVFlfTVMgLyA2MF8wMDB9bSwgZGlzcG9zaW5nYCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdFx0dGhpcy5faW5hY3Rpdml0eVRpbWVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0XHR9LFxuXHRcdFx0U0VTU0lPTl9JTkFDVElWSVRZX01TLFxuXHRcdCk7XG5cdFx0dGhpcy5faW5hY3Rpdml0eVRpbWVycy5zZXQoc2Vzc2lvbklkLCB0aW1lcik7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHNpbmdsZSBzZXNzaW9uJ3MgUGxheXdyaWdodCBicm93c2VyIGNvbm5lY3Rpb24sIHBhZ2UgdHJhY2tpbmcsIGFuZFxuICogcGFnZS1tYXRjaGluZyBsb2dpYy5cbiAqXG4gKiBSZWNlaXZlcyBhbiBhbHJlYWR5LWNvbm5lY3RlZCB7QGxpbmsgQnJvd3Nlcn0gYW5kIHtAbGluayBJQnJvd3NlclZpZXdHcm91cH1cbiAqIGZyb20gdGhlIHBhcmVudCB7QGxpbmsgUGxheXdyaWdodFNlcnZpY2V9LiBDb3JyZWxhdGVzIGJyb3dzZXIgdmlldyBJRHMgd2l0aFxuICogUGxheXdyaWdodCB7QGxpbmsgUGFnZX0gaW5zdGFuY2VzIHZpYSBGSUZPIG1hdGNoaW5nIG9mIGdyb3VwIElQQyBldmVudHMgYW5kXG4gKiBQbGF5d3JpZ2h0IENEUCBldmVudHMuXG4gKi9cbmNsYXNzIFBsYXl3cmlnaHRTZXNzaW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Ly8gLS0tIFBhZ2UgbWF0Y2hpbmcgLS0tXG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlld0lkVG9QYWdlID0gbmV3IE1hcDxzdHJpbmcsIFBhZ2U+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhZ2VUb1ZpZXdJZCA9IG5ldyBXZWFrTWFwPFBhZ2UsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFicyA9IG5ldyBXZWFrTWFwPFBhZ2UsIFBsYXl3cmlnaHRUYWI+KCk7XG5cblx0LyoqIFZpZXcgSURzIHJlY2VpdmVkIGZyb20gdGhlIGdyb3VwIGJ1dCBub3QgeWV0IG1hdGNoZWQgd2l0aCBhIHBhZ2UuICovXG5cdHByaXZhdGUgX3ZpZXdJZFF1ZXVlOiBBcnJheTx7IHZpZXdJZDogc3RyaW5nOyBwYWdlOiBEZWZlcnJlZFByb21pc2U8UGFnZT4gfT4gPSBbXTtcblxuXHQvKiogUGFnZXMgcmVjZWl2ZWQgZnJvbSBQbGF5d3JpZ2h0IGJ1dCBub3QgeWV0IG1hdGNoZWQgd2l0aCBhIHZpZXcgSUQuICovXG5cdHByaXZhdGUgX3BhZ2VRdWV1ZTogQXJyYXk8eyBwYWdlOiBQYWdlOyB2aWV3SWQ6IERlZmVycmVkUHJvbWlzZTxzdHJpbmc+IH0+ID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2F0Y2hlZENvbnRleHRzID0gbmV3IFdlYWtTZXQ8QnJvd3NlckNvbnRleHQ+KCk7XG5cdHByaXZhdGUgX3NjYW5UaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0SW50ZXJ2YWw+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vcGVuQ29udGV4dDogQnJvd3NlckNvbnRleHQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0LyoqIEluLWZsaWdodCBkZWZlcnJlZCByZXN1bHRzIGtleWVkIGJ5IHRoZWlyIGdlbmVyYXRlZCBJRC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVmZXJyZWRSZXN1bHRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCB7XG5cdFx0cGFnZUlkOiBzdHJpbmc7XG5cdFx0cHJvbWlzZTogUHJvbWlzZTx1bmtub3duPjtcblx0XHRsb2dDdHg/OiBJRXhlY3V0aW9uTG9nQ29udGV4dDtcblx0fSAmIElEaXNwb3NhYmxlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIF9icm93c2VyOiBCcm93c2VyLFxuXHRcdHJlYWRvbmx5IGdyb3VwOiBJQnJvd3NlclZpZXdHcm91cCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblNjb3BlOiBJUGxheXdyaWdodEFjdGlvblNjb3BlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlOiBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDcmVhdGVQYWdlOiAodmlld0lkOiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdyb3VwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdyb3VwLm9uRGlkQWRkVmlldyhlID0+IHRoaXMuX29uVmlld0FkZGVkKGUudmlld0lkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZ3JvdXAub25EaWRSZW1vdmVWaWV3KGUgPT4gdGhpcy5fb25WaWV3UmVtb3ZlZChlLnZpZXdJZCkpKTtcblxuXHRcdHRoaXMuX3NjYW5Gb3JOZXdDb250ZXh0cygpO1xuXHR9XG5cblx0LyoqIFJlZ2lzdGVyIGEgZGlzcG9zYWJsZSB0byBiZSBjbGVhbmVkIHVwIHdoZW4gdGhpcyBzZXNzaW9uIGlzIGRpc3Bvc2VkLiAqL1xuXHRyZWdpc3RlckRpc3Bvc2FibGUoZDogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkKTtcblx0fVxuXG5cdC8vIC0tLSBQYWdlIG9wZXJhdGlvbnMgLS0tXG5cblx0YXN5bmMgb3BlblBhZ2UodXJsOiBzdHJpbmcpOiBQcm9taXNlPHsgcGFnZUlkOiBzdHJpbmc7IHN1bW1hcnk6IHN0cmluZyB9PiB7XG5cdFx0aWYgKCF0aGlzLl9vcGVuQ29udGV4dCkge1xuXHRcdFx0dGhpcy5fb3BlbkNvbnRleHQgPSBhd2FpdCB0aGlzLl9icm93c2VyLm5ld0NvbnRleHQoKTtcblx0XHRcdHRoaXMuX29uQ29udGV4dEFkZGVkKHRoaXMuX29wZW5Db250ZXh0KTtcblx0XHR9XG5cblx0XHRjb25zdCBwYWdlID0gYXdhaXQgdGhpcy5fb3BlbkNvbnRleHQubmV3UGFnZSgpO1xuXHRcdGNvbnN0IHZpZXdJZCA9IGF3YWl0IHRoaXMuX29uUGFnZUFkZGVkKHBhZ2UpO1xuXHRcdGF3YWl0IHRoaXMub25EaWRDcmVhdGVQYWdlKHZpZXdJZCk7XG5cblx0XHRpZiAodXJsICYmIHVybCAhPT0gJ2Fib3V0OmJsYW5rJyAmJiBwYWdlLnVybCgpICE9PSB1cmwpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHBhZ2UuZ290byh1cmwsIHsgd2FpdFVudGlsOiAnZG9tY29udGVudGxvYWRlZCcsIHRpbWVvdXQ6IE9QRU5fUEFHRV9OQVZJR0FUSU9OX1RJTUVPVVRfTVMgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoIWlzTmF2aWdhdGlvblRpbWVvdXRFcnJvcihlcnJvcikpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTmF2aWdhdGlvbiB0byAke3VybH0gdGltZWQgb3V0IGFmdGVyICR7T1BFTl9QQUdFX05BVklHQVRJT05fVElNRU9VVF9NU30gbXMuIFRoZSBwYWdlIChJRDogJHt2aWV3SWR9KSBpcyBvcGVuIGFuZCBjYW4gYmUgcmV1c2VkLmApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLl9nZXRTdW1tYXJ5KHZpZXdJZCk7XG5cdFx0cmV0dXJuIHsgcGFnZUlkOiB2aWV3SWQsIHN1bW1hcnkgfTtcblx0fVxuXG5cdGFzeW5jIGdldFN1bW1hcnkocGFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRTdW1tYXJ5KHBhZ2VJZCwgdHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBpbnZva2VGdW5jdGlvblJhdzxUPihwYWdlSWQ6IHN0cmluZywgZm5EZWY6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgZm4gPSBhd2FpdCB0aGlzLl9jb21waWxlRnVuY3Rpb24oZm5EZWYpO1xuXHRcdHJldHVybiB0aGlzLl9ydW5BZ2FpbnN0UGFnZShwYWdlSWQsIChwYWdlKSA9PiBmbihwYWdlLCBhcmdzKSBhcyBUKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZUZ1bmN0aW9uKHBhZ2VJZDogc3RyaW5nLCBmbkRlZjogc3RyaW5nLCBhcmdzOiB1bmtub3duW10gPSBbXSwgdGltZW91dE1zPzogbnVtYmVyKTogUHJvbWlzZTxJSW52b2tlRnVuY3Rpb25SZXN1bHQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW1BsYXl3cmlnaHRTZXNzaW9uXSBJbnZva2luZyBmdW5jdGlvbiBvbiB2aWV3ICR7cGFnZUlkfWApO1xuXG5cdFx0Y29uc3QgbG9nQ3R4OiBJRXhlY3V0aW9uTG9nQ29udGV4dCA9IHtcblx0XHRcdHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSxcblx0XHRcdGNvZGVMZW5ndGg6IGZuRGVmLmxlbmd0aCxcblx0XHRcdGNvZGVMaW5lQ291bnQ6IGZuRGVmLnNwbGl0KCdcXG4nKS5sZW5ndGgsXG5cdFx0XHRwYWdlTWV0aG9kc0NhbGxlZDogbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKSxcblx0XHRcdHdhc0RlZmVycmVkOiBmYWxzZSxcblx0XHRcdHJlc3VtZUNvdW50OiAwLFxuXHRcdFx0bG9nZ2VkOiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0bGV0IGZuO1xuXHRcdHRyeSB7XG5cdFx0XHRmbiA9IGF3YWl0IHRoaXMuX2NvbXBpbGVGdW5jdGlvbihmbkRlZik7XG5cdFx0fSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG5cdFx0XHQvLyBTdXJmYWNlIGNvbXBpbGUvc3ludGF4IGVycm9ycyBhcyB7IGVycm9yLCBzdW1tYXJ5IH0sIGxpa2Ugb3RoZXIgZXhlY3V0aW9uIGZhaWx1cmVzLlxuXHRcdFx0dGhpcy5fbG9nRXhlY3V0aW9uKGxvZ0N0eCwgZmFsc2UpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRoaXMuX2dldFN1bW1hcnkocGFnZUlkKTtcblx0XHRcdHJldHVybiB7IGVycm9yOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciksIHN1bW1hcnkgfTtcblx0XHR9XG5cdFx0Y29uc3Qgd3JhcHBlZENhbGxiYWNrID0gYXN5bmMgKHBhZ2U6IFBhZ2UpID0+IGZuKGNyZWF0ZVBhZ2VBcGlQcm94eShwYWdlLCBsb2dDdHgucGFnZU1ldGhvZHNDYWxsZWQpLCBhcmdzKTtcblxuXHRcdGlmICh0aW1lb3V0TXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3J1bldpdGhEZWZlcnJhbChwYWdlSWQsIHdyYXBwZWRDYWxsYmFjaywgdGltZW91dE1zLCB1bmRlZmluZWQsIGxvZ0N0eCk7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdCwgZXJyb3I7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX3J1bkFnYWluc3RQYWdlKHBhZ2VJZCwgd3JhcHBlZENhbGxiYWNrKTtcblx0XHR9IGNhdGNoIChlcnI6IHVua25vd24pIHtcblx0XHRcdGVycm9yID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ0V4ZWN1dGlvbihsb2dDdHgsICFlcnJvcik7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRoaXMuX2dldFN1bW1hcnkocGFnZUlkKTtcblx0XHRyZXR1cm4geyByZXN1bHQsIGVycm9yLCBzdW1tYXJ5IH07XG5cdH1cblxuXHRhc3luYyB3YWl0Rm9yRGVmZXJyZWRSZXN1bHQoZGVmZXJyZWRSZXN1bHRJZDogc3RyaW5nLCB0aW1lb3V0TXM6IG51bWJlcik6IFByb21pc2U8SUludm9rZUZ1bmN0aW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9kZWZlcnJlZFJlc3VsdHMuZ2V0KGRlZmVycmVkUmVzdWx0SWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gZGVmZXJyZWQgcmVzdWx0IGZvdW5kIHdpdGggSUQgXCIke2RlZmVycmVkUmVzdWx0SWR9XCIuIEl0IG1heSBoYXZlIGJlZW4gY2xlYW5lZCB1cCBvciBhbHJlYWR5IGNvbnN1bWVkLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcGFnZUlkLCBwcm9taXNlLCBsb2dDdHggfSA9IGVudHJ5O1xuXHRcdGlmIChsb2dDdHgpIHtcblx0XHRcdGxvZ0N0eC5yZXN1bWVDb3VudCsrO1xuXHRcdH1cblx0XHR0aGlzLl9kZWZlcnJlZFJlc3VsdHMuZGVsZXRlQW5kRGlzcG9zZShkZWZlcnJlZFJlc3VsdElkKTtcblx0XHRyZXR1cm4gdGhpcy5fcnVuV2l0aERlZmVycmFsKHBhZ2VJZCwgKCkgPT4gcHJvbWlzZSwgdGltZW91dE1zLCBkZWZlcnJlZFJlc3VsdElkLCBsb2dDdHgpO1xuXHR9XG5cblx0YXN5bmMgcmVwbHlUb0ZpbGVDaG9vc2VyKHBhZ2VJZDogc3RyaW5nLCBmaWxlczogc3RyaW5nW10pOiBQcm9taXNlPHsgc3VtbWFyeTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCBwYWdlID0gYXdhaXQgdGhpcy5fZ2V0UGFnZShwYWdlSWQpO1xuXHRcdGNvbnN0IHRhYiA9IHRoaXMuX3RhYnMuZ2V0KHBhZ2UpO1xuXHRcdGlmICghdGFiKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byByZXBseSB0byBmaWxlIGNob29zZXInKTtcblx0XHR9XG5cdFx0YXdhaXQgdGFiLnJlcGx5VG9GaWxlQ2hvb3NlcihmaWxlcyk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRhYi5nZXRTdW1tYXJ5KCk7XG5cdFx0cmV0dXJuIHsgc3VtbWFyeSB9O1xuXHR9XG5cblx0YXN5bmMgcmVwbHlUb0RpYWxvZyhwYWdlSWQ6IHN0cmluZywgYWNjZXB0OiBib29sZWFuLCBwcm9tcHRUZXh0Pzogc3RyaW5nKTogUHJvbWlzZTx7IHN1bW1hcnk6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3QgcGFnZSA9IGF3YWl0IHRoaXMuX2dldFBhZ2UocGFnZUlkKTtcblx0XHRjb25zdCB0YWIgPSB0aGlzLl90YWJzLmdldChwYWdlKTtcblx0XHRpZiAoIXRhYikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gcmVwbHkgdG8gZGlhbG9nJyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRhYi5yZXBseVRvRGlhbG9nKGFjY2VwdCwgcHJvbXB0VGV4dCk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRhYi5nZXRTdW1tYXJ5KCk7XG5cdFx0cmV0dXJuIHsgc3VtbWFyeSB9O1xuXHR9XG5cblx0Ly8gLS0tIFByaXZhdGU6IHBhZ2Ugb3BlcmF0aW9ucyAtLS1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRTdW1tYXJ5KHBhZ2VJZDogc3RyaW5nLCBmdWxsID0gZmFsc2UpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHBhZ2UgPSBhd2FpdCB0aGlzLl9nZXRQYWdlKHBhZ2VJZCk7XG5cdFx0Y29uc3QgdGFiID0gdGhpcy5fdGFicy5nZXQocGFnZSk7XG5cdFx0aWYgKCF0YWIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBwYWdlIHN1bW1hcnknKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRhYi5nZXRTdW1tYXJ5KGZ1bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuQWdhaW5zdFBhZ2U8VD4ocGFnZUlkOiBzdHJpbmcsIGNhbGxiYWNrOiAocGFnZTogUGFnZSkgPT4gVCB8IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBwYWdlID0gYXdhaXQgdGhpcy5fZ2V0UGFnZShwYWdlSWQpO1xuXHRcdGNvbnN0IHRhYiA9IHRoaXMuX3RhYnMuZ2V0KHBhZ2UpO1xuXHRcdGlmICghdGFiKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBleGVjdXRlIGZ1bmN0aW9uIGFnYWluc3QgcGFnZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFiLnNhZmVSdW5BZ2FpbnN0UGFnZShhc3luYyAoKSA9PiBjYWxsYmFjayhwYWdlKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5XaXRoRGVmZXJyYWwocGFnZUlkOiBzdHJpbmcsIGNhbGxiYWNrOiAocGFnZTogUGFnZSkgPT4gUHJvbWlzZTx1bmtub3duPiwgdGltZW91dE1zOiBudW1iZXIsIGV4aXN0aW5nRGVmZXJyZWRJZD86IHN0cmluZywgbG9nQ3R4PzogSUV4ZWN1dGlvbkxvZ0NvbnRleHQpOiBQcm9taXNlPElJbnZva2VGdW5jdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuXG5cdFx0Ly8gQXR0YWNoIHNldHRsZW1lbnQgbG9nZ2luZyBvbmNlLCBvbiB0aGUgaW5pdGlhdGluZyBjYWxsOiBgZGVmZXJyZWQucGAgc2V0dGxlc1xuXHRcdC8vIHdoZW4gdGhlIHBhZ2Ugd29yayBmaW5pc2hlcyBubyBtYXR0ZXIgaG93IG1hbnkgdGltZXMgdGhlIHJlc3VsdCBpcyBkZWZlcnJlZCxcblx0XHQvLyByZXN1bWVkLCBvciBhYmFuZG9uZWQsIHNvIGEgZGVmZXJyZWQgcnVuIGlzIHN0aWxsIGxvZ2dlZCBvbmNlIGl0IHNldHRsZXMuXG5cdFx0Ly8gYF9sb2dFeGVjdXRpb25gIGlzIGlkZW1wb3RlbnQsIHNvIHRoaXMgaXMgYSBuby1vcCBpZiB0aGUgc3luY2hyb25vdXMgcGF0aFxuXHRcdC8vIGJlbG93IGFscmVhZHkgbG9nZ2VkIGEgbm9uLWRlZmVycmVkIGNvbXBsZXRpb24uXG5cdFx0aWYgKGV4aXN0aW5nRGVmZXJyZWRJZCA9PT0gdW5kZWZpbmVkICYmIGxvZ0N0eCkge1xuXHRcdFx0ZGVmZXJyZWQucC50aGVuKCgpID0+IHRoaXMuX2xvZ0V4ZWN1dGlvbihsb2dDdHgsIHRydWUpLCAoKSA9PiB0aGlzLl9sb2dFeGVjdXRpb24obG9nQ3R4LCBmYWxzZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdyYXBwZWRQcm9taXNlID0gdGhpcy5fcnVuQWdhaW5zdFBhZ2UocGFnZUlkLCBhc3luYyAocGFnZSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGNhbGxiYWNrKHBhZ2UpO1xuXHRcdFx0cHJvbWlzZS5jYXRjaCgoKSA9PiB7IC8qIHByZXZlbnQgdW5oYW5kbGVkIHJlamVjdGlvbiBpZiBkZWZlcnJlZCAqLyB9KTtcblx0XHRcdGRlZmVycmVkLnNldHRsZVdpdGgocHJvbWlzZSk7XG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdGxldCByZXN1bHQsIGVycm9yO1xuXHRcdGxldCBpbnRlcnJ1cHRlZCA9IGZhbHNlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KHdyYXBwZWRQcm9taXNlLCB0aW1lb3V0TXMsICgpID0+IHsgaW50ZXJydXB0ZWQgPSB0cnVlOyB9KTtcblx0XHR9IGNhdGNoIChlcnI6IHVua25vd24pIHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBEaWFsb2dJbnRlcnJ1cHRlZEVycm9yKSB7XG5cdFx0XHRcdGludGVycnVwdGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGVycm9yID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdH1cblxuXHRcdGxldCBkZWZlcnJlZFJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGludGVycnVwdGVkKSB7XG5cdFx0XHRpZiAobG9nQ3R4KSB7XG5cdFx0XHRcdGxvZ0N0eC53YXNEZWZlcnJlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRkZWZlcnJlZFJlc3VsdElkID0gZXhpc3RpbmdEZWZlcnJlZElkID8/IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0Y29uc3QgY2xlYW51cCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuX2RlZmVycmVkUmVzdWx0cy5kZWxldGVBbmREaXNwb3NlKGRlZmVycmVkUmVzdWx0SWQhKSwgREVGRVJSRURfUkVTVUxUX0NMRUFOVVBfTVMpO1xuXHRcdFx0dGhpcy5fZGVmZXJyZWRSZXN1bHRzLnNldChkZWZlcnJlZFJlc3VsdElkLCB7IHBhZ2VJZCwgcHJvbWlzZTogZGVmZXJyZWQucCwgbG9nQ3R4LCBkaXNwb3NlOiAoKSA9PiBjbGVhbnVwLmRpc3Bvc2UoKSB9KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbUGxheXdyaWdodFNlc3Npb25dIEV4ZWN1dGlvbiBpbnRlcnJ1cHRlZCwgZGVmZXJyZWQgYXMgJHtkZWZlcnJlZFJlc3VsdElkfWApO1xuXHRcdH0gZWxzZSBpZiAobG9nQ3R4KSB7XG5cdFx0XHQvLyBDb21wbGV0ZWQgb3IgZmFpbGVkIHdpdGhpbiB0aGUgdGltZW91dDogbG9nIHRoZSBvdXRjb21lIG5vdyByYXRoZXIgdGhhblxuXHRcdFx0Ly8gcmVseWluZyBvbiB0aGUgc2V0dGxlbWVudCBwcm9taXNlLCB3aGljaCBuZXZlciBzZXR0bGVzIGlmIHRoZSBwYWdlIHdvcmtcblx0XHRcdC8vIHRocmV3IGJlZm9yZSBgc2V0dGxlV2l0aGAgcmFuIChlLmcuIHRoZSBwYWdlIGNvdWxkIG5vdCBiZSByZXNvbHZlZCkuXG5cdFx0XHR0aGlzLl9sb2dFeGVjdXRpb24obG9nQ3R4LCAhZXJyb3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLl9nZXRTdW1tYXJ5KHBhZ2VJZCk7XG5cdFx0cmV0dXJuIHsgcmVzdWx0LCBlcnJvciwgc3VtbWFyeSwgZGVmZXJyZWRSZXN1bHRJZCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXQgY29tcGxldGlvbiB0ZWxlbWV0cnkgZm9yIGEgc2luZ2xlIHtAbGluayBpbnZva2VGdW5jdGlvbn0gY2FsbCwgb25jZSB0aGVcblx0ICogcGFnZSB3b3JrIHNldHRsZXMuIElkZW1wb3RlbnQ6IG9ubHkgdGhlIGZpcnN0IGNhbGwgZm9yIGEgZ2l2ZW4gY29udGV4dCBlbWl0cyxcblx0ICogc28gdGhlIHN5bmNocm9ub3VzIGFuZCBzZXR0bGVtZW50LXByb21pc2UgcGF0aHMgY2FuIGJvdGggY2FsbCBpdCBzYWZlbHkuXG5cdCAqL1xuXHRwcml2YXRlIF9sb2dFeGVjdXRpb24oY3R4OiBJRXhlY3V0aW9uTG9nQ29udGV4dCwgc3VjY2VzczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChjdHgubG9nZ2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGN0eC5sb2dnZWQgPSB0cnVlO1xuXHRcdGNvbnN0IGVudHJpZXMgPSBbLi4uY3R4LnBhZ2VNZXRob2RzQ2FsbGVkLmVudHJpZXMoKV07XG5cdFx0Y29uc3QgdG90YWwgPSBlbnRyaWVzLnJlZHVjZSgoc3VtLCBbLCBjb3VudF0pID0+IHN1bSArIGNvdW50LCAwKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSdW5QbGF5d3JpZ2h0Q29kZUV2ZW50LCBSdW5QbGF5d3JpZ2h0Q29kZUNsYXNzaWZpY2F0aW9uPihcblx0XHRcdCdpbnRlZ3JhdGVkQnJvd3Nlci50b29scy5ydW5QbGF5d3JpZ2h0Q29kZS5jb21wbGV0ZWQnLFxuXHRcdFx0e1xuXHRcdFx0XHRwYWdlTWV0aG9kc0NhbGxlZDogSlNPTi5zdHJpbmdpZnkoT2JqZWN0LmZyb21FbnRyaWVzKGVudHJpZXMpKSxcblx0XHRcdFx0cGFnZU1ldGhvZHNDYWxsZWREY291bnQ6IGVudHJpZXMubGVuZ3RoLFxuXHRcdFx0XHRwYWdlTWV0aG9kc0NhbGxlZENvdW50OiB0b3RhbCxcblx0XHRcdFx0c3VjY2Vzczogc3VjY2VzcyA/IDEgOiAwLFxuXHRcdFx0XHR3YXNEZWZlcnJlZDogY3R4Lndhc0RlZmVycmVkID8gMSA6IDAsXG5cdFx0XHRcdHJlc3VtZUNvdW50OiBjdHgucmVzdW1lQ291bnQsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IE1hdGgucm91bmQoRGF0ZS5ub3coKSAtIGN0eC5zdGFydGVkQXQpLFxuXHRcdFx0XHRjb2RlTGVuZ3RoOiBjdHguY29kZUxlbmd0aCxcblx0XHRcdFx0Y29kZUxpbmVDb3VudDogY3R4LmNvZGVMaW5lQ291bnQsXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXBpbGVGdW5jdGlvbihmbkRlZjogc3RyaW5nKTogUHJvbWlzZTwocGFnZTogUGFnZSwgYXJnczogdW5rbm93bltdKSA9PiB1bmtub3duPiB7XG5cdFx0Y29uc3Qgdm0gPSBhd2FpdCBpbXBvcnQoJ3ZtJyk7XG5cdFx0cmV0dXJuIHZtLmNvbXBpbGVGdW5jdGlvbihgcmV0dXJuICgke2ZuRGVmfSkocGFnZSwgLi4uYXJncylgLCBbJ3BhZ2UnLCAnYXJncyddLCB7IHBhcnNpbmdDb250ZXh0OiB2bS5jcmVhdGVDb250ZXh0KCkgfSkgYXMgKHBhZ2U6IFBhZ2UsIGFyZ3M6IHVua25vd25bXSkgPT4gdW5rbm93bjtcblx0fVxuXG5cdC8vIC0tLSBQcml2YXRlOiBwYWdlIG1hdGNoaW5nICh2aWV3IFx1MjE5NCBwYWdlIHBhaXJpbmcpIC0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFBhZ2Uodmlld0lkOiBzdHJpbmcpOiBQcm9taXNlPFBhZ2U+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3ZpZXdJZFRvUGFnZS5nZXQodmlld0lkKTtcblx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHR9XG5cdFx0Y29uc3QgcXVldWVkID0gdGhpcy5fdmlld0lkUXVldWUuZmluZChpdGVtID0+IGl0ZW0udmlld0lkID09PSB2aWV3SWQpO1xuXHRcdGlmIChxdWV1ZWQpIHtcblx0XHRcdHJldHVybiBxdWV1ZWQucGFnZS5wO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYFBhZ2UgXCIke3ZpZXdJZH1cIiBub3QgZm91bmRgKTtcblx0fVxuXG5cdHByaXZhdGUgX29uVmlld0FkZGVkKHZpZXdJZDogc3RyaW5nLCB0aW1lb3V0TXMgPSAxMDAwMCk6IFByb21pc2U8UGFnZT4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5fdmlld0lkVG9QYWdlLmdldCh2aWV3SWQpO1xuXHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNvbHZlZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHF1ZXVlZCA9IHRoaXMuX3ZpZXdJZFF1ZXVlLmZpbmQoaXRlbSA9PiBpdGVtLnZpZXdJZCA9PT0gdmlld0lkKTtcblx0XHRpZiAocXVldWVkKSB7XG5cdFx0XHRyZXR1cm4gcXVldWVkLnBhZ2UucDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8UGFnZT4oKTtcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBkZWZlcnJlZC5lcnJvcihuZXcgRXJyb3IoYFRpbWVkIG91dCB3YWl0aW5nIGZvciBwYWdlYCkpLCB0aW1lb3V0TXMpO1xuXG5cdFx0ZGVmZXJyZWQucC5maW5hbGx5KCgpID0+IHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdHRoaXMuX3ZpZXdJZFF1ZXVlID0gdGhpcy5fdmlld0lkUXVldWUuZmlsdGVyKGl0ZW0gPT4gaXRlbS52aWV3SWQgIT09IHZpZXdJZCk7XG5cdFx0XHRpZiAodGhpcy5fdmlld0lkUXVldWUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3BTY2FubmluZygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fdmlld0lkUXVldWUucHVzaCh7IHZpZXdJZCwgcGFnZTogZGVmZXJyZWQgfSk7XG5cdFx0dGhpcy5fdHJ5TWF0Y2goKTtcblx0XHR0aGlzLl9lbnN1cmVTY2FubmluZygpO1xuXG5cdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdH1cblxuXHRwcml2YXRlIF9vblZpZXdSZW1vdmVkKHZpZXdJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld0lkUXVldWUgPSB0aGlzLl92aWV3SWRRdWV1ZS5maWx0ZXIoaXRlbSA9PiBpdGVtLnZpZXdJZCAhPT0gdmlld0lkKTtcblx0XHRjb25zdCBwYWdlID0gdGhpcy5fdmlld0lkVG9QYWdlLmdldCh2aWV3SWQpO1xuXHRcdGlmIChwYWdlKSB7XG5cdFx0XHR0aGlzLl9wYWdlVG9WaWV3SWQuZGVsZXRlKHBhZ2UpO1xuXHRcdH1cblx0XHR0aGlzLl92aWV3SWRUb1BhZ2UuZGVsZXRlKHZpZXdJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblBhZ2VBZGRlZChwYWdlOiBQYWdlLCB0aW1lb3V0TXMgPSAxMDAwMCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLl9wYWdlVG9WaWV3SWQuZ2V0KHBhZ2UpO1xuXHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNvbHZlZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHF1ZXVlZCA9IHRoaXMuX3BhZ2VRdWV1ZS5maW5kKGl0ZW0gPT4gaXRlbS5wYWdlID09PSBwYWdlKTtcblx0XHRpZiAocXVldWVkKSB7XG5cdFx0XHRyZXR1cm4gcXVldWVkLnZpZXdJZC5wO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uQ29udGV4dEFkZGVkKHBhZ2UuY29udGV4dCgpKTtcblx0XHRwYWdlLm9uY2UoJ2Nsb3NlJywgKCkgPT4gdGhpcy5fb25QYWdlUmVtb3ZlZChwYWdlKSk7XG5cdFx0cGFnZS5zZXREZWZhdWx0VGltZW91dCgxMDAwMCk7XG5cdFx0dGhpcy5fdGFicy5zZXQocGFnZSwgbmV3IFBsYXl3cmlnaHRUYWIocGFnZSwgdGhpcy5hY3Rpb25TY29wZSwgdGhpcy5hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IGRlZmVycmVkLmVycm9yKG5ldyBFcnJvcihgVGltZWQgb3V0IHdhaXRpbmcgZm9yIGJyb3dzZXIgdmlld2ApKSwgdGltZW91dE1zKTtcblx0XHRkZWZlcnJlZC5wLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fcGFnZVF1ZXVlID0gdGhpcy5fcGFnZVF1ZXVlLmZpbHRlcihpdGVtID0+IGl0ZW0ucGFnZSAhPT0gcGFnZSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9wYWdlUXVldWUucHVzaCh7IHBhZ2UsIHZpZXdJZDogZGVmZXJyZWQgfSk7XG5cdFx0dGhpcy5fdHJ5TWF0Y2goKTtcblxuXHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25QYWdlUmVtb3ZlZChwYWdlOiBQYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFnZVF1ZXVlID0gdGhpcy5fcGFnZVF1ZXVlLmZpbHRlcihpdGVtID0+IGl0ZW0ucGFnZSAhPT0gcGFnZSk7XG5cdFx0Y29uc3Qgdmlld0lkID0gdGhpcy5fcGFnZVRvVmlld0lkLmdldChwYWdlKTtcblx0XHRpZiAodmlld0lkKSB7XG5cdFx0XHR0aGlzLl92aWV3SWRUb1BhZ2UuZGVsZXRlKHZpZXdJZCk7XG5cdFx0fVxuXHRcdHRoaXMuX3BhZ2VUb1ZpZXdJZC5kZWxldGUocGFnZSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkNvbnRleHRBZGRlZChjb250ZXh0OiBCcm93c2VyQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93YXRjaGVkQ29udGV4dHMuaGFzKGNvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3dhdGNoZWRDb250ZXh0cy5hZGQoY29udGV4dCk7XG5cdFx0Y29udGV4dC5vbigncGFnZScsIChwYWdlOiBQYWdlKSA9PiB0aGlzLl9vblBhZ2VBZGRlZChwYWdlKSk7XG5cdFx0Y29udGV4dC5vbignY2xvc2UnLCAoKSA9PiB0aGlzLl93YXRjaGVkQ29udGV4dHMuZGVsZXRlKGNvbnRleHQpKTtcblx0XHRmb3IgKGNvbnN0IHBhZ2Ugb2YgY29udGV4dC5wYWdlcygpKSB7XG5cdFx0XHR0aGlzLl9vblBhZ2VBZGRlZChwYWdlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUHJpdmF0ZTogbWF0Y2hpbmcgLS0tXG5cblx0cHJpdmF0ZSBfdHJ5TWF0Y2goKTogdm9pZCB7XG5cdFx0d2hpbGUgKHRoaXMuX3ZpZXdJZFF1ZXVlLmxlbmd0aCA+IDAgJiYgdGhpcy5fcGFnZVF1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHZpZXdJZEl0ZW0gPSB0aGlzLl92aWV3SWRRdWV1ZS5zaGlmdCgpITtcblx0XHRcdGNvbnN0IHBhZ2VJdGVtID0gdGhpcy5fcGFnZVF1ZXVlLnNoaWZ0KCkhO1xuXG5cdFx0XHR0aGlzLl92aWV3SWRUb1BhZ2Uuc2V0KHZpZXdJZEl0ZW0udmlld0lkLCBwYWdlSXRlbS5wYWdlKTtcblx0XHRcdHRoaXMuX3BhZ2VUb1ZpZXdJZC5zZXQocGFnZUl0ZW0ucGFnZSwgdmlld0lkSXRlbS52aWV3SWQpO1xuXG5cdFx0XHR2aWV3SWRJdGVtLnBhZ2UuY29tcGxldGUocGFnZUl0ZW0ucGFnZSk7XG5cdFx0XHRwYWdlSXRlbS52aWV3SWQuY29tcGxldGUodmlld0lkSXRlbS52aWV3SWQpO1xuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2Vzc2lvbl0gTWF0Y2hlZCB2aWV3ICR7dmlld0lkSXRlbS52aWV3SWR9IFx1MjE5MiBwYWdlYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3ZpZXdJZFF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcFNjYW5uaW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFByaXZhdGU6IGNvbnRleHQgc2Nhbm5pbmcgLS0tXG5cblx0cHJpdmF0ZSBfc2NhbkZvck5ld0NvbnRleHRzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY29udGV4dCBvZiB0aGlzLl9icm93c2VyLmNvbnRleHRzKCkpIHtcblx0XHRcdHRoaXMuX29uQ29udGV4dEFkZGVkKGNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVNjYW5uaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zY2FuVGltZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc2NhblRpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy5fc2NhbkZvck5ld0NvbnRleHRzKCksIDEwMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFNjYW5uaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zY2FuVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLl9zY2FuVGltZXIpO1xuXHRcdFx0dGhpcy5fc2NhblRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcFNjYW5uaW5nKCk7XG5cdFx0dGhpcy5fYnJvd3Nlcj8uY2xvc2UoKS5jYXRjaCgoKSA9PiB7IC8qIGlnbm9yZSAqLyB9KTtcblx0XHRmb3IgKGNvbnN0IHsgcGFnZSB9IG9mIHRoaXMuX3ZpZXdJZFF1ZXVlKSB7XG5cdFx0XHRwYWdlLmVycm9yKG5ldyBFcnJvcignUGxheXdyaWdodFNlc3Npb24gZGlzcG9zZWQnKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgeyB2aWV3SWQgfSBvZiB0aGlzLl9wYWdlUXVldWUpIHtcblx0XHRcdHZpZXdJZC5lcnJvcihuZXcgRXJyb3IoJ1BsYXl3cmlnaHRTZXNzaW9uIGRpc3Bvc2VkJykpO1xuXHRcdH1cblx0XHR0aGlzLl92aWV3SWRRdWV1ZSA9IFtdO1xuXHRcdHRoaXMuX3BhZ2VRdWV1ZSA9IFtdO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc05hdmlnYXRpb25UaW1lb3V0RXJyb3IoZXJyb3I6IHVua25vd24pOiBib29sZWFuIHtcblx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gZXJyb3IubmFtZSA9PT0gJ1RpbWVvdXRFcnJvcidcblx0XHR8fCAvVGltZW91dCBcXGQrbXMgZXhjZWVkZWQvLnRlc3QoZXJyb3IubWVzc2FnZSlcblx0XHR8fCAvbmF2aWdhdGlvbiB0aW1lb3V0L2kudGVzdChlcnJvci5tZXNzYWdlKTtcbn1cblxuLyoqXG4gKiBQZXItaW52b2NhdGlvbiBzdGF0ZSB0aHJlYWRlZCB0aHJvdWdoIHtAbGluayBQbGF5d3JpZ2h0U2Vzc2lvbi5pbnZva2VGdW5jdGlvbn1cbiAqIGFuZCBpdHMgZGVmZXJyYWwgbWFjaGluZXJ5IHNvIGNvbXBsZXRpb24gdGVsZW1ldHJ5IGNhbiBiZSBlbWl0dGVkIGV4YWN0bHkgb25jZVxuICogd2hlbiB0aGUgdW5kZXJseWluZyBwYWdlIHdvcmsgc2V0dGxlcyAtIGV2ZW4gZm9yIGRlZmVycmVkIHJ1bnMgdGhlIGNhbGxlclxuICogbmV2ZXIgcmVzdW1lcy5cbiAqL1xuaW50ZXJmYWNlIElFeGVjdXRpb25Mb2dDb250ZXh0IHtcblx0LyoqIHtAbGluayBEYXRlLm5vd30gdGltZXN0YW1wIGNhcHR1cmVkIHdoZW4gdGhlIGludm9jYXRpb24gYmVnYW4uICovXG5cdHJlYWRvbmx5IHN0YXJ0ZWRBdDogbnVtYmVyO1xuXHQvKiogQ2hhcmFjdGVyIGxlbmd0aCBvZiB0aGUgZXhlY3V0ZWQgZnVuY3Rpb24gc291cmNlLiAqL1xuXHRyZWFkb25seSBjb2RlTGVuZ3RoOiBudW1iZXI7XG5cdC8qKiBMaW5lIGNvdW50IG9mIHRoZSBleGVjdXRlZCBmdW5jdGlvbiBzb3VyY2UuICovXG5cdHJlYWRvbmx5IGNvZGVMaW5lQ291bnQ6IG51bWJlcjtcblx0LyoqIFBlci1tZXRob2QgY2FsbCBjb3VudHMgYWNjdW11bGF0ZWQgYnkge0BsaW5rIGNyZWF0ZVBhZ2VBcGlQcm94eX0uICovXG5cdHJlYWRvbmx5IHBhZ2VNZXRob2RzQ2FsbGVkOiBNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHQvKiogU2V0IG9uY2UgdGhlIGV4ZWN1dGlvbiBpcyBpbnRlcnJ1cHRlZCBhbmQgZGVmZXJyZWQgYXQgbGVhc3Qgb25jZS4gKi9cblx0d2FzRGVmZXJyZWQ6IGJvb2xlYW47XG5cdC8qKiBOdW1iZXIgb2YgdGltZXMgdGhlIGNhbGxlciByZXN1bWVkIHRoaXMgZXhlY3V0aW9uIHZpYSB7QGxpbmsgUGxheXdyaWdodFNlc3Npb24ud2FpdEZvckRlZmVycmVkUmVzdWx0fS4gKi9cblx0cmVzdW1lQ291bnQ6IG51bWJlcjtcblx0LyoqIEd1YXJkcyBhZ2FpbnN0IGRvdWJsZS1sb2dnaW5nOyBzZXQgYnkge0BsaW5rIFBsYXl3cmlnaHRTZXNzaW9uLl9sb2dFeGVjdXRpb259LiAqL1xuXHRsb2dnZWQ6IGJvb2xlYW47XG59XG5cbnR5cGUgUnVuUGxheXdyaWdodENvZGVFdmVudCA9IHtcblx0cGFnZU1ldGhvZHNDYWxsZWQ6IHN0cmluZztcblx0cGFnZU1ldGhvZHNDYWxsZWREY291bnQ6IG51bWJlcjtcblx0cGFnZU1ldGhvZHNDYWxsZWRDb3VudDogbnVtYmVyO1xuXHRzdWNjZXNzOiBudW1iZXI7XG5cdHdhc0RlZmVycmVkOiBudW1iZXI7XG5cdHJlc3VtZUNvdW50OiBudW1iZXI7XG5cdGR1cmF0aW9uTXM6IG51bWJlcjtcblx0Y29kZUxlbmd0aDogbnVtYmVyO1xuXHRjb2RlTGluZUNvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIFJ1blBsYXl3cmlnaHRDb2RlQ2xhc3NpZmljYXRpb24gPSB7XG5cdHBhZ2VNZXRob2RzQ2FsbGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSlNPTiBvYmplY3QgbWFwcGluZyBkb3R0ZWQgYHBhZ2UuKmAgbWV0aG9kIG5hbWVzIHRvIHRoZWlyIGNhbGwgY291bnRzIChlLmcuIGB7XCJjbGlja1wiOjIsXCJrZXlib2FyZC5wcmVzc1wiOjV9YCksIGluIGZpcnN0LW9ic2VydmVkIG9yZGVyLicgfTtcblx0cGFnZU1ldGhvZHNDYWxsZWREY291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZGlzdGluY3QgYHBhZ2UuKmAgbWV0aG9kcyBpbnZva2VkLicgfTtcblx0cGFnZU1ldGhvZHNDYWxsZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RvdGFsIGBwYWdlLipgIG1ldGhvZCBjYWxscyBpbmNsdWRpbmcgZHVwbGljYXRlcyAoc3VtIG9mIGFsbCBwZXItbWV0aG9kIGNvdW50cykuJyB9O1xuXHRzdWNjZXNzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnMSBpZiB0aGUgY29kZSBjb21wbGV0ZWQgd2l0aG91dCBlcnJvciwgMCBvdGhlcndpc2UuJyB9O1xuXHR3YXNEZWZlcnJlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJzEgaWYgdGhlIGV4ZWN1dGlvbiB3YXMgaW50ZXJydXB0ZWQgYW5kIGRlZmVycmVkIGF0IGxlYXN0IG9uY2UsIDAgb3RoZXJ3aXNlLicgfTtcblx0cmVzdW1lQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgdGltZXMgdGhlIGNhbGxlciByZXN1bWVkIHRoaXMgZXhlY3V0aW9uIGJ5IHBvbGxpbmcgZm9yIGl0cyBkZWZlcnJlZCByZXN1bHQuIDAgbWVhbnMgdGhlIHJ1biBlaXRoZXIgY29tcGxldGVkIHdpdGhpbiB0aGUgZmlyc3QgdGltZW91dCBvciB3YXMgZGVmZXJyZWQgYW5kIG5ldmVyIHJlc3VtZWQgKHNldHRsZWQgaW4gdGhlIGJhY2tncm91bmQpLicgfTtcblx0ZHVyYXRpb25NczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1dhbGwtY2xvY2sgdGltZSBpbiBtaWxsaXNlY29uZHMgZnJvbSBpbnZvY2F0aW9uIHN0YXJ0IHVudGlsIHRoZSBwYWdlIHdvcmsgc2V0dGxlZC4nIH07XG5cdGNvZGVMZW5ndGg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdDaGFyYWN0ZXIgbGVuZ3RoIG9mIHRoZSBleGVjdXRlZCBmdW5jdGlvbiBzb3VyY2UuJyB9O1xuXHRjb2RlTGluZUNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTGluZSBjb3VudCBvZiB0aGUgZXhlY3V0ZWQgZnVuY3Rpb24gc291cmNlLicgfTtcblx0b3duZXI6ICdqcnVhbGVzJztcblx0Y29tbWVudDogJ1RyYWNrcyBob3cgdGhlIHJ1bl9wbGF5d3JpZ2h0X2NvZGUgY2hhdCB0b29sIGlzIGV4ZXJjaXNlZC4nO1xufTtcblxuLyoqXG4gKiBQcm9wZXJ0eSBuYW1lcyB0aGF0IGFyZSBza2lwcGVkIGJ5IHtAbGluayBjcmVhdGVQYWdlQXBpUHJveHl9IHNvIHRoYXQgSlNcbiAqIHJ1bnRpbWUvaWRpb21hdGljIGFjY2Vzc2VzIGRvbid0IHNob3cgdXAgYXMgZmFrZSBBUEkgdXNhZ2UuIEluY2x1ZGVzXG4gKiBgdGhlbmAvYGNhdGNoYC9gZmluYWxseWAgKHNvIGF3YWl0aW5nIHRoZSBwcm94eSBuZXZlciByZWNvcmRzIG5vaXNlKSxcbiAqIGNvbnZlcnNpb24gaG9va3MsIGFuZCBgY29uc3RydWN0b3JgLlxuICovXG5jb25zdCBQQUdFX1BST1hZX0lHTk9SRURfUFJPUFMgPSBuZXcgU2V0PHN0cmluZz4oW1xuXHQndGhlbicsXG5cdCdjYXRjaCcsXG5cdCdmaW5hbGx5Jyxcblx0J3RvSlNPTicsXG5cdCd0b1N0cmluZycsXG5cdCd2YWx1ZU9mJyxcblx0J2NvbnN0cnVjdG9yJyxcbl0pO1xuXG4vKipcbiAqIE1heGltdW0gbmVzdGluZyBkZXB0aCBmb3IgdGhlIHJlY3Vyc2l2ZSBwYWdlIHByb3h5LiBUaGUgUGxheXdyaWdodCBgcGFnZWBcbiAqIHN1cmZhY2Ugb25seSBuZXN0cyBvbmUgbGV2ZWwgZGVlcCBpbiBwcmFjdGljZSAoZS5nLiBgcGFnZS5rZXlib2FyZC5wcmVzc2ApLFxuICogc28gMyBpcyBnZW5lcm91c2x5IGFib3ZlIGFueSByZWFsIHdvcmtsb2FkIHdoaWxlIHByZXZlbnRpbmcgcGF0aG9sb2dpY2FsXG4gKiBjYXNlcyBvbiBjeWNsaWMgc3RydWN0dXJlcy5cbiAqL1xuY29uc3QgUEFHRV9QUk9YWV9NQVhfREVQVEggPSAzO1xuXG4vKipcbiAqIFdyYXAgYSBQbGF5d3JpZ2h0IGBwYWdlYCBzbyBldmVyeSBjYWxsIHRocm91Z2ggdGhlIHByb3h5IGluY3JlbWVudHMgYSBjb3VudGVyXG4gKiBpbiB7QGxpbmsgbWV0aG9kQ2FsbHN9LCBrZXllZCBieSB0aGUgZG90dGVkIHBhdGggZnJvbSBgcGFnZWAgKGUuZy4gYGNsaWNrYCxcbiAqIGBrZXlib2FyZC5wcmVzc2ApLiBPYmplY3QgcHJvcGVydGllcyBhcmUgcHJveGllZCByZWN1cnNpdmVseSAoY2FwcGVkIGF0XG4gKiB7QGxpbmsgUEFHRV9QUk9YWV9NQVhfREVQVEh9KSBzbyBjYWxscyBvbiBuYW1lc3BhY2VzIGxpa2UgYGtleWJvYXJkYCBhbmRcbiAqIGBtb3VzZWAgYXJlIHZpc2libGU7IHN5bWJvbCBrZXlzLCBgX2AtcHJlZml4ZWQgaW50ZXJuYWxzLCBhbmRcbiAqIHtAbGluayBQQUdFX1BST1hZX0lHTk9SRURfUFJPUFN9IGFyZSBza2lwcGVkIHRvIGF2b2lkIG5vaXNlLlxuICpcbiAqIFdyYXBwZXJzIGFuZCBuZXN0ZWQgcHJveGllcyBhcmUgY2FjaGVkIHBlciBwcm9wZXJ0eSBzbyByZXBlYXRlZCByZWFkcyByZXR1cm5cbiAqIHRoZSBzYW1lIHZhbHVlLCBwcmVzZXJ2aW5nIFBsYXl3cmlnaHQncyBvYmplY3QgaWRlbnRpdHkgKGUuZy5cbiAqIGBwYWdlLmtleWJvYXJkID09PSBwYWdlLmtleWJvYXJkYCkuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVBhZ2VBcGlQcm94eTxUIGV4dGVuZHMgb2JqZWN0Pih0YXJnZXQ6IFQsIG1ldGhvZENhbGxzOiBNYXA8c3RyaW5nLCBudW1iZXI+LCBwcmVmaXg6IHN0cmluZyA9ICcnLCBkZXB0aDogbnVtYmVyID0gMCk6IFQge1xuXHRpZiAoZGVwdGggPj0gUEFHRV9QUk9YWV9NQVhfREVQVEgpIHtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cdGNvbnN0IGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cdHJldHVybiBuZXcgUHJveHkodGFyZ2V0LCB7XG5cdFx0Z2V0KHQsIHByb3AsIHJlY2VpdmVyKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IFJlZmxlY3QuZ2V0KHQsIHByb3AsIHJlY2VpdmVyKTtcblx0XHRcdGlmICh0eXBlb2YgcHJvcCAhPT0gJ3N0cmluZycgfHwgcHJvcC5zdGFydHNXaXRoKCdfJykgfHwgUEFHRV9QUk9YWV9JR05PUkVEX1BST1BTLmhhcyhwcm9wKSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQocHJvcCk7XG5cdFx0XHRpZiAoY2FjaGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNhY2hlZDtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IHByZWZpeCArIHByb3A7XG5cdFx0XHRcdGNvbnN0IHdyYXBwZXIgPSBmdW5jdGlvbiAodGhpczogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdFx0bWV0aG9kQ2FsbHMuc2V0KG5hbWUsIChtZXRob2RDYWxscy5nZXQobmFtZSkgPz8gMCkgKyAxKTtcblx0XHRcdFx0XHRyZXR1cm4gUmVmbGVjdC5hcHBseSh2YWx1ZSBhcyBGdW5jdGlvbiwgdCwgYXJncyk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNhY2hlLnNldChwcm9wLCB3cmFwcGVyKTtcblx0XHRcdFx0cmV0dXJuIHdyYXBwZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRjb25zdCBuZXN0ZWQgPSBjcmVhdGVQYWdlQXBpUHJveHkodmFsdWUgYXMgb2JqZWN0LCBtZXRob2RDYWxscywgYCR7cHJlZml4fSR7cHJvcH0uYCwgZGVwdGggKyAxKTtcblx0XHRcdFx0Y2FjaGUuc2V0KHByb3AsIG5lc3RlZCk7XG5cdFx0XHRcdHJldHVybiBuZXN0ZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFlBQVkscUJBQWtDO0FBQ3ZELFNBQVMsaUJBQWlCLG1CQUFtQixtQkFBbUI7QUFDaEUsU0FBUyxlQUFzQjtBQU8vQixTQUFTLGVBQWUsOEJBQThCO0FBRXRELFNBQVMsb0JBQW9CO0FBWTdCLE1BQU0sNkJBQTZCLElBQUk7QUFDdkMsTUFBTSx3QkFBd0IsS0FBSztBQUNuQyxNQUFNLGtDQUFrQztBQVd4QyxTQUFTLGFBQWEsU0FBd0M7QUFDN0QsUUFBTSxZQUFZO0FBQ2xCLFNBQU8sT0FBTyxVQUFVLE9BQU8sWUFDM0IsT0FBTyxVQUFVLFdBQVcsYUFDM0IsVUFBVSxjQUFjLFVBQWEsT0FBTyxVQUFVLGNBQWM7QUFDMUU7QUFjTyxNQUFNLDBCQUEwQixXQUF5QztBQUFBLEVBaUIvRSxZQUNrQixVQUNBLCtCQUNBLFlBQ0EsMkJBQ0Esa0JBQ2hCO0FBQ0QsVUFBTTtBQU5XO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFuQmxCLFNBQWlCLFlBQVksS0FBSyxVQUFVLElBQUksY0FBeUMsQ0FBQztBQUcxRjtBQUFBLFNBQWlCLGdCQUFnQixvQkFBSSxJQUF3QztBQUc3RTtBQUFBLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxjQUFtQyxDQUFDO0FBRzVGO0FBQUEsU0FBaUIsZ0JBQWdCLG9CQUFJLElBQVk7QUFFakQsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLFFBQTJCLENBQUM7QUFDM0YsU0FBUywwQkFBb0QsS0FBSyx5QkFBeUI7QUFBQSxFQVUzRjtBQUFBO0FBQUE7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
