import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { CDPError, CDPErrorCode, CDPServerError, CDPMethodNotFoundError, CDPInvalidParamsError } from "./types.js";
class CDPBrowserProxy extends Disposable {
  constructor(browserTarget) {
    super();
    this.browserTarget = browserTarget;
    this.sessionId = `browser-session-${generateUuid()}`;
    // Browser session state
    this._isAttachedToBrowserTarget = false;
    this._autoAttach = false;
    this._discover = false;
    /**
     * All sessions known to this proxy, keyed by sessionId.
     * Includes sessions from explicit attach, proxy auto-attach,
     * and client auto-attach children.
     */
    this._sessions = this._register(new DisposableMap());
    this._targets = this._register(new DisposableMap());
    // Only auto-attach once per target.
    this._autoAttachments = /* @__PURE__ */ new WeakSet();
    // CDP method handlers map
    this._handlers = /* @__PURE__ */ new Map([
      // Browser.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Browser/)
      ["Browser.addPrivacySandboxCoordinatorKeyConfig", () => ({})],
      ["Browser.addPrivacySandboxEnrollmentOverride", () => ({})],
      ["Browser.close", () => ({})],
      ["Browser.getVersion", () => this.browserTarget.getVersion()],
      ["Browser.resetPermissions", () => ({})],
      ["Browser.getWindowForTarget", (p, s) => this.handleBrowserGetWindowForTarget(p, s)],
      ["Browser.setDownloadBehavior", () => ({})],
      ["Browser.setWindowBounds", () => ({})],
      // Target.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Target/)
      ["Target.activateTarget", (p) => this.handleTargetActivateTarget(p)],
      ["Target.attachToTarget", (p) => this.handleTargetAttachToTarget(p)],
      ["Target.closeTarget", (p) => this.handleTargetCloseTarget(p)],
      ["Target.createBrowserContext", () => this.handleTargetCreateBrowserContext()],
      ["Target.createTarget", (p) => this.handleTargetCreateTarget(p)],
      ["Target.detachFromTarget", (p) => this.handleTargetDetachFromTarget(p)],
      ["Target.disposeBrowserContext", (p) => this.handleTargetDisposeBrowserContext(p)],
      ["Target.getBrowserContexts", () => this.handleTargetGetBrowserContexts()],
      ["Target.getTargets", () => this.handleTargetGetTargets()],
      ["Target.setAutoAttach", (p, s) => this.handleTargetSetAutoAttach(p, s)],
      ["Target.setDiscoverTargets", (p) => this.handleTargetSetDiscoverTargets(p)],
      ["Target.attachToBrowserTarget", () => this.handleTargetAttachToBrowserTarget()],
      ["Target.getTargetInfo", (p) => this.handleTargetGetTargetInfo(p)]
    ]);
    // #region Public API
    // Events to external clients
    this._onEvent = this._register(new Emitter());
    this.onEvent = this._onEvent.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
  }
  get targetId() {
    return this.browserTarget.targetInfo.targetId;
  }
  registerTarget(target) {
    const targetInfo = target.targetInfo;
    if (this._targets.has(targetInfo.targetId)) {
      return;
    }
    this._targets.set(targetInfo.targetId, target);
    if (this._discover) {
      this.sendEvent("Target.targetCreated", {
        targetInfo: target.targetInfo
      });
    }
    if (this._autoAttach && !this._autoAttachments.has(target)) {
      this._autoAttachments.add(target);
      void target.attach();
    }
    target.onClose(() => {
      this._targets.deleteAndDispose(targetInfo.targetId);
      if (this._discover) {
        this.sendEvent("Target.targetDestroyed", { targetId: targetInfo.targetId });
      }
    });
    target.onTargetInfoChanged((info) => {
      if (this._discover) {
        this.sendEvent("Target.targetInfoChanged", { targetInfo: info });
      }
    });
    for (const [, session] of target.sessions) {
      this.registerSession(session, false);
    }
    target.onSessionCreated(({ session, waitingForDebugger }) => {
      this.registerSession(session, waitingForDebugger);
    });
  }
  notifySessionCreated(session, waitingForDebugger) {
    if (this._sessions.has(session.sessionId)) {
      return;
    }
    if (!session.parentSessionId) {
      return;
    }
    if (!this._sessions.has(session.parentSessionId)) {
      return;
    }
    const target = this._targets.get(session.targetId);
    if (!target) {
      return;
    }
    target.notifySessionCreated(session, waitingForDebugger);
  }
  registerSession(session, waitingForDebugger) {
    if (this._sessions.has(session.sessionId)) {
      return;
    }
    this._sessions.set(session.sessionId, session);
    const target = this._targets.get(session.targetId);
    if (!target) {
      throw new CDPServerError(`Unable to resolve target for session ${session.sessionId}`);
    }
    this.sendEvent("Target.attachedToTarget", {
      sessionId: session.sessionId,
      targetInfo: target.targetInfo,
      waitingForDebugger
    }, session.parentSessionId);
    session.onEvent((event) => {
      if (event.method.startsWith("Target.")) {
        return;
      }
      this.sendEvent(event.method, event.params, event.sessionId ?? session.sessionId);
    });
    session.onClose(() => {
      this._sessions.deleteAndDispose(session.sessionId);
      this.sendEvent("Target.detachedFromTarget", {
        sessionId: session.sessionId,
        targetId: session.targetId
      }, session.parentSessionId);
    });
  }
  /** Send a browser-level event to the client */
  sendEvent(method, params, sessionId) {
    sessionId ||= this._isAttachedToBrowserTarget ? this.sessionId : void 0;
    this._onMessage.fire({ method, params, sessionId });
    this._onEvent.fire({ method, params, sessionId });
  }
  /**
   * Send a CDP command and await the result.
   * Browser-level handlers (Browser.*, Target.*) are checked first.
   * Other commands are routed to the page session identified by sessionId.
   */
  async sendCommand(method, params = {}, sessionId) {
    try {
      if (!sessionId || sessionId === this.sessionId || method.startsWith("Browser.") || method.startsWith("Target.")) {
        const handler = this._handlers.get(method);
        if (!handler) {
          throw new CDPMethodNotFoundError(method);
        }
        return await handler(params, sessionId);
      }
      const connection = this._sessions.get(sessionId);
      if (!connection) {
        throw new CDPServerError(`Session not found: ${sessionId}`);
      }
      const result = await connection.sendCommand(method, params);
      return result ?? {};
    } catch (error) {
      if (error instanceof CDPError) {
        throw error;
      }
      throw new CDPServerError(error instanceof Error ? error.message : "Unknown error");
    }
  }
  /**
   * Accept a CDP request from a message-based transport (WebSocket, IPC, etc.), route it,
   * and deliver the response or error via {@link onMessage}.
   */
  async sendMessage({ id, method, params, sessionId }) {
    return this.sendCommand(method, params, sessionId).then((result) => {
      this._onMessage.fire({ id, result, sessionId });
    }).catch((error) => {
      this._onMessage.fire({
        id,
        error: {
          code: error instanceof CDPError ? error.code : CDPErrorCode.ServerError,
          message: error.message || "Unknown error"
        },
        sessionId
      });
    });
  }
  // #endregion
  // #region CDP Commands
  handleBrowserGetWindowForTarget({ targetId }, sessionId) {
    const resolvedTargetId = (sessionId && this._sessions.get(sessionId)?.targetId) ?? targetId;
    if (!resolvedTargetId) {
      throw new CDPServerError("Unable to resolve target");
    }
    const target = this._targets.get(resolvedTargetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    return this.browserTarget.getWindowForTarget(target);
  }
  handleTargetGetBrowserContexts() {
    return { browserContextIds: this.browserTarget.getBrowserContexts() };
  }
  async handleTargetCreateBrowserContext() {
    const browserContextId = await this.browserTarget.createBrowserContext();
    return { browserContextId };
  }
  async handleTargetDisposeBrowserContext({ browserContextId }) {
    await this.browserTarget.disposeBrowserContext(browserContextId);
    return {};
  }
  handleTargetAttachToBrowserTarget() {
    this.sendEvent("Target.attachedToTarget", {
      sessionId: this.sessionId,
      targetInfo: this.browserTarget.targetInfo,
      waitingForDebugger: false
    });
    this._isAttachedToBrowserTarget = true;
    return { sessionId: this.sessionId };
  }
  handleTargetActivateTarget({ targetId }) {
    const target = this._targets.get(targetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    return this.browserTarget.activateTarget(target);
  }
  async handleTargetSetAutoAttach(params, sessionId) {
    if (sessionId && sessionId !== this.sessionId) {
      const connection = this._sessions.get(sessionId);
      if (!connection) {
        throw new CDPServerError(`Session not found: ${sessionId}`);
      }
      return connection.sendCommand("Target.setAutoAttach", params);
    }
    if (!params.flatten) {
      throw new CDPInvalidParamsError("This implementation only supports auto-attach with flatten=true");
    }
    this._autoAttach = params.autoAttach ?? false;
    return {};
  }
  async handleTargetSetDiscoverTargets({ discover = false }) {
    if (discover !== this._discover) {
      this._discover = discover;
      if (this._discover) {
        for (const target of this._targets.values()) {
          this.sendEvent("Target.targetCreated", { targetInfo: target.targetInfo });
        }
      }
    }
    return {};
  }
  async handleTargetGetTargets() {
    return { targetInfos: Array.from(this._targets.values()).map((target) => target.targetInfo) };
  }
  async handleTargetGetTargetInfo({ targetId } = {}) {
    if (!targetId) {
      return { targetInfo: this.browserTarget.targetInfo };
    }
    const target = this._targets.get(targetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    return { targetInfo: target.targetInfo };
  }
  async handleTargetAttachToTarget({ targetId, flatten }) {
    if (!flatten) {
      throw new CDPInvalidParamsError("This implementation only supports attachToTarget with flatten=true");
    }
    const target = this._targets.get(targetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    const connection = await target.attach();
    return { sessionId: connection.sessionId };
  }
  async handleTargetDetachFromTarget({ sessionId }) {
    const connection = this._sessions.get(sessionId);
    if (!connection) {
      throw new CDPServerError(`Session not found: ${sessionId}`);
    }
    connection.dispose();
    return {};
  }
  async handleTargetCreateTarget({ url, browserContextId }) {
    const target = await this.browserTarget.createTarget(url || "about:blank", browserContextId);
    this.registerTarget(target);
    if (this._autoAttach && !this._autoAttachments.has(target)) {
      this._autoAttachments.add(target);
      await target.attach();
    }
    return { targetId: target.targetInfo.targetId };
  }
  async handleTargetCloseTarget({ targetId }) {
    try {
      const target = this._targets.get(targetId);
      if (!target) {
        throw new CDPServerError("Unable to resolve target");
      }
      await this.browserTarget.closeTarget(target);
      return { success: true };
    } catch {
      return { success: false };
    }
  }
  // #endregion
}
export {
  CDPBrowserProxy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9jZHAvcHJveHkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJQ0RQVGFyZ2V0LCBDRFBSZXF1ZXN0LCBDRFBSZXNwb25zZSwgQ0RQRXZlbnQsIENEUEVycm9yLCBDRFBFcnJvckNvZGUsIENEUFNlcnZlckVycm9yLCBDRFBNZXRob2ROb3RGb3VuZEVycm9yLCBDRFBJbnZhbGlkUGFyYW1zRXJyb3IsIElDRFBDb25uZWN0aW9uLCBJQ0RQQnJvd3NlclRhcmdldCB9IGZyb20gJy4vdHlwZXMuanMnO1xuXG4vKipcbiAqIENEUCBwcm90b2NvbCBoYW5kbGVyIGZvciBicm93c2VyLWxldmVsIGNvbm5lY3Rpb25zLlxuICogTWFuYWdlcyBCcm93c2VyLiogYW5kIFRhcmdldC4qIGRvbWFpbnMsIHJvdXRlcyBwYWdlLWxldmVsIGNvbW1hbmRzXG4gKiB0byB0aGUgYXBwcm9wcmlhdGUgYXR0YWNoZWQgc2Vzc2lvbiBieSBzZXNzaW9uSWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBDRFBCcm93c2VyUHJveHkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNEUENvbm5lY3Rpb24ge1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSBgYnJvd3Nlci1zZXNzaW9uLSR7Z2VuZXJhdGVVdWlkKCl9YDtcblx0Z2V0IHRhcmdldElkKCkge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJUYXJnZXQudGFyZ2V0SW5mby50YXJnZXRJZDtcblx0fVxuXG5cdC8vIEJyb3dzZXIgc2Vzc2lvbiBzdGF0ZVxuXHRwcml2YXRlIF9pc0F0dGFjaGVkVG9Ccm93c2VyVGFyZ2V0ID0gZmFsc2U7XG5cdHByaXZhdGUgX2F1dG9BdHRhY2ggPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlzY292ZXIgPSBmYWxzZTtcblxuXHQvKipcblx0ICogQWxsIHNlc3Npb25zIGtub3duIHRvIHRoaXMgcHJveHksIGtleWVkIGJ5IHNlc3Npb25JZC5cblx0ICogSW5jbHVkZXMgc2Vzc2lvbnMgZnJvbSBleHBsaWNpdCBhdHRhY2gsIHByb3h5IGF1dG8tYXR0YWNoLFxuXHQgKiBhbmQgY2xpZW50IGF1dG8tYXR0YWNoIGNoaWxkcmVuLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElDRFBDb25uZWN0aW9uPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSUNEUFRhcmdldD4oKSk7XG5cblx0Ly8gT25seSBhdXRvLWF0dGFjaCBvbmNlIHBlciB0YXJnZXQuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9BdHRhY2htZW50cyA9IG5ldyBXZWFrU2V0PElDRFBUYXJnZXQ+KCk7XG5cblx0Ly8gQ0RQIG1ldGhvZCBoYW5kbGVycyBtYXBcblx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlcnMgPSBuZXcgTWFwPHN0cmluZywgKHBhcmFtczogdW5rbm93biwgc2Vzc2lvbklkPzogc3RyaW5nKSA9PiBQcm9taXNlPG9iamVjdD4gfCBvYmplY3Q+KFtcblx0XHQvLyBCcm93c2VyLiogbWV0aG9kcyAoaHR0cHM6Ly9jaHJvbWVkZXZ0b29scy5naXRodWIuaW8vZGV2dG9vbHMtcHJvdG9jb2wvdG90L0Jyb3dzZXIvKVxuXHRcdFsnQnJvd3Nlci5hZGRQcml2YWN5U2FuZGJveENvb3JkaW5hdG9yS2V5Q29uZmlnJywgKCkgPT4gKHt9KV0sXG5cdFx0WydCcm93c2VyLmFkZFByaXZhY3lTYW5kYm94RW5yb2xsbWVudE92ZXJyaWRlJywgKCkgPT4gKHt9KV0sXG5cdFx0WydCcm93c2VyLmNsb3NlJywgKCkgPT4gKHt9KV0sXG5cdFx0WydCcm93c2VyLmdldFZlcnNpb24nLCAoKSA9PiB0aGlzLmJyb3dzZXJUYXJnZXQuZ2V0VmVyc2lvbigpXSxcblx0XHRbJ0Jyb3dzZXIucmVzZXRQZXJtaXNzaW9ucycsICgpID0+ICh7fSldLFxuXHRcdFsnQnJvd3Nlci5nZXRXaW5kb3dGb3JUYXJnZXQnLCAocCwgcykgPT4gdGhpcy5oYW5kbGVCcm93c2VyR2V0V2luZG93Rm9yVGFyZ2V0KHAgYXMgeyB0YXJnZXRJZD86IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nIH0sIHMpXSxcblx0XHRbJ0Jyb3dzZXIuc2V0RG93bmxvYWRCZWhhdmlvcicsICgpID0+ICh7fSldLFxuXHRcdFsnQnJvd3Nlci5zZXRXaW5kb3dCb3VuZHMnLCAoKSA9PiAoe30pXSxcblx0XHQvLyBUYXJnZXQuKiBtZXRob2RzIChodHRwczovL2Nocm9tZWRldnRvb2xzLmdpdGh1Yi5pby9kZXZ0b29scy1wcm90b2NvbC90b3QvVGFyZ2V0Lylcblx0XHRbJ1RhcmdldC5hY3RpdmF0ZVRhcmdldCcsIChwKSA9PiB0aGlzLmhhbmRsZVRhcmdldEFjdGl2YXRlVGFyZ2V0KHAgYXMgeyB0YXJnZXRJZDogc3RyaW5nIH0pXSxcblx0XHRbJ1RhcmdldC5hdHRhY2hUb1RhcmdldCcsIChwKSA9PiB0aGlzLmhhbmRsZVRhcmdldEF0dGFjaFRvVGFyZ2V0KHAgYXMgeyB0YXJnZXRJZDogc3RyaW5nOyBmbGF0dGVuPzogYm9vbGVhbiB9KV0sXG5cdFx0WydUYXJnZXQuY2xvc2VUYXJnZXQnLCAocCkgPT4gdGhpcy5oYW5kbGVUYXJnZXRDbG9zZVRhcmdldChwIGFzIHsgdGFyZ2V0SWQ6IHN0cmluZyB9KV0sXG5cdFx0WydUYXJnZXQuY3JlYXRlQnJvd3NlckNvbnRleHQnLCAoKSA9PiB0aGlzLmhhbmRsZVRhcmdldENyZWF0ZUJyb3dzZXJDb250ZXh0KCldLFxuXHRcdFsnVGFyZ2V0LmNyZWF0ZVRhcmdldCcsIChwKSA9PiB0aGlzLmhhbmRsZVRhcmdldENyZWF0ZVRhcmdldChwIGFzIHsgdXJsPzogc3RyaW5nOyBicm93c2VyQ29udGV4dElkPzogc3RyaW5nIH0pXSxcblx0XHRbJ1RhcmdldC5kZXRhY2hGcm9tVGFyZ2V0JywgKHApID0+IHRoaXMuaGFuZGxlVGFyZ2V0RGV0YWNoRnJvbVRhcmdldChwIGFzIHsgc2Vzc2lvbklkOiBzdHJpbmcgfSldLFxuXHRcdFsnVGFyZ2V0LmRpc3Bvc2VCcm93c2VyQ29udGV4dCcsIChwKSA9PiB0aGlzLmhhbmRsZVRhcmdldERpc3Bvc2VCcm93c2VyQ29udGV4dChwIGFzIHsgYnJvd3NlckNvbnRleHRJZDogc3RyaW5nIH0pXSxcblx0XHRbJ1RhcmdldC5nZXRCcm93c2VyQ29udGV4dHMnLCAoKSA9PiB0aGlzLmhhbmRsZVRhcmdldEdldEJyb3dzZXJDb250ZXh0cygpXSxcblx0XHRbJ1RhcmdldC5nZXRUYXJnZXRzJywgKCkgPT4gdGhpcy5oYW5kbGVUYXJnZXRHZXRUYXJnZXRzKCldLFxuXHRcdFsnVGFyZ2V0LnNldEF1dG9BdHRhY2gnLCAocCwgcykgPT4gdGhpcy5oYW5kbGVUYXJnZXRTZXRBdXRvQXR0YWNoKHAgYXMgeyBhdXRvQXR0YWNoPzogYm9vbGVhbjsgZmxhdHRlbj86IGJvb2xlYW4gfSwgcyldLFxuXHRcdFsnVGFyZ2V0LnNldERpc2NvdmVyVGFyZ2V0cycsIChwKSA9PiB0aGlzLmhhbmRsZVRhcmdldFNldERpc2NvdmVyVGFyZ2V0cyhwIGFzIHsgZGlzY292ZXI/OiBib29sZWFuIH0pXSxcblx0XHRbJ1RhcmdldC5hdHRhY2hUb0Jyb3dzZXJUYXJnZXQnLCAoKSA9PiB0aGlzLmhhbmRsZVRhcmdldEF0dGFjaFRvQnJvd3NlclRhcmdldCgpXSxcblx0XHRbJ1RhcmdldC5nZXRUYXJnZXRJbmZvJywgKHApID0+IHRoaXMuaGFuZGxlVGFyZ2V0R2V0VGFyZ2V0SW5mbyhwIGFzIHsgdGFyZ2V0SWQ/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCldLFxuXHRdKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJyb3dzZXJUYXJnZXQ6IElDRFBCcm93c2VyVGFyZ2V0LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVnaXN0ZXJUYXJnZXQodGFyZ2V0OiBJQ0RQVGFyZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0SW5mbyA9IHRhcmdldC50YXJnZXRJbmZvO1xuXHRcdGlmICh0aGlzLl90YXJnZXRzLmhhcyh0YXJnZXRJbmZvLnRhcmdldElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90YXJnZXRzLnNldCh0YXJnZXRJbmZvLnRhcmdldElkLCB0YXJnZXQpO1xuXG5cdFx0aWYgKHRoaXMuX2Rpc2NvdmVyKSB7XG5cdFx0XHR0aGlzLnNlbmRFdmVudCgnVGFyZ2V0LnRhcmdldENyZWF0ZWQnLCB7XG5cdFx0XHRcdHRhcmdldEluZm86IHRhcmdldC50YXJnZXRJbmZvLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hdXRvQXR0YWNoICYmICF0aGlzLl9hdXRvQXR0YWNobWVudHMuaGFzKHRhcmdldCkpIHtcblx0XHRcdHRoaXMuX2F1dG9BdHRhY2htZW50cy5hZGQodGFyZ2V0KTtcblx0XHRcdHZvaWQgdGFyZ2V0LmF0dGFjaCgpO1xuXHRcdH1cblxuXHRcdHRhcmdldC5vbkNsb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX3RhcmdldHMuZGVsZXRlQW5kRGlzcG9zZSh0YXJnZXRJbmZvLnRhcmdldElkKTtcblx0XHRcdGlmICh0aGlzLl9kaXNjb3Zlcikge1xuXHRcdFx0XHR0aGlzLnNlbmRFdmVudCgnVGFyZ2V0LnRhcmdldERlc3Ryb3llZCcsIHsgdGFyZ2V0SWQ6IHRhcmdldEluZm8udGFyZ2V0SWQgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0YXJnZXQub25UYXJnZXRJbmZvQ2hhbmdlZChpbmZvID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaXNjb3Zlcikge1xuXHRcdFx0XHR0aGlzLnNlbmRFdmVudCgnVGFyZ2V0LnRhcmdldEluZm9DaGFuZ2VkJywgeyB0YXJnZXRJbmZvOiBpbmZvIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBbLCBzZXNzaW9uXSBvZiB0YXJnZXQuc2Vzc2lvbnMpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJTZXNzaW9uKHNlc3Npb24sIGZhbHNlKTtcblx0XHR9XG5cdFx0dGFyZ2V0Lm9uU2Vzc2lvbkNyZWF0ZWQoKHsgc2Vzc2lvbiwgd2FpdGluZ0ZvckRlYnVnZ2VyIH0pID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJTZXNzaW9uKHNlc3Npb24sIHdhaXRpbmdGb3JEZWJ1Z2dlcik7XG5cdFx0fSk7XG5cdH1cblxuXHRub3RpZnlTZXNzaW9uQ3JlYXRlZChzZXNzaW9uOiBJQ0RQQ29ubmVjdGlvbiwgd2FpdGluZ0ZvckRlYnVnZ2VyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25zLmhhcyhzZXNzaW9uLnNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybjsgLy8gV2UgYWxyZWFkeSBrbm93IGFib3V0IGl0LlxuXHRcdH1cblx0XHRpZiAoIXNlc3Npb24ucGFyZW50U2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm47IC8vIENyZWF0ZWQgZ2xvYmFsbHkgLS0gd2UgZG9uJ3QgY2FyZSBhYm91dCBpdC5cblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9zZXNzaW9ucy5oYXMoc2Vzc2lvbi5wYXJlbnRTZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm47IC8vIE5vdCBmcm9tIG9uZSBvZiBvdXIgc2Vzc2lvbnMgLS0gaWdub3JlIGl0LlxuXHRcdH1cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl90YXJnZXRzLmdldChzZXNzaW9uLnRhcmdldElkKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuOyAvLyBUYXJnZXQgaXNuJ3Qga25vd24gLS0gaWdub3JlIGl0LlxuXHRcdH1cblx0XHR0YXJnZXQubm90aWZ5U2Vzc2lvbkNyZWF0ZWQoc2Vzc2lvbiwgd2FpdGluZ0ZvckRlYnVnZ2VyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTZXNzaW9uKHNlc3Npb246IElDRFBDb25uZWN0aW9uLCB3YWl0aW5nRm9yRGVidWdnZXI6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbnMuaGFzKHNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fdGFyZ2V0cy5nZXQoc2Vzc2lvbi50YXJnZXRJZCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRocm93IG5ldyBDRFBTZXJ2ZXJFcnJvcihgVW5hYmxlIHRvIHJlc29sdmUgdGFyZ2V0IGZvciBzZXNzaW9uICR7c2Vzc2lvbi5zZXNzaW9uSWR9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZW5kRXZlbnQoJ1RhcmdldC5hdHRhY2hlZFRvVGFyZ2V0Jywge1xuXHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdHRhcmdldEluZm86IHRhcmdldC50YXJnZXRJbmZvLFxuXHRcdFx0d2FpdGluZ0ZvckRlYnVnZ2VyXG5cdFx0fSwgc2Vzc2lvbi5wYXJlbnRTZXNzaW9uSWQpO1xuXG5cdFx0Ly8gRm9yd2FyZCBub24tVGFyZ2V0IGV2ZW50cyBmcm9tIHRoZSBzZXNzaW9uIHRvIHRoZSBleHRlcm5hbCBjbGllbnQuXG5cdFx0Ly8gVGFyZ2V0IGRvbWFpbiBldmVudHMgYXJlIHN1cHByZXNzZWQgXHUyMDE0IHRoZSBwcm94eSBlbWl0cyBpdHMgb3duXG5cdFx0Ly8gbGlmZWN5Y2xlIGV2ZW50cyAoYXR0YWNoZWRUb1RhcmdldCwgZGV0YWNoZWRGcm9tVGFyZ2V0LCBldGMuKVxuXHRcdC8vIHZpYSByZWdpc3RlclNlc3Npb24gLyBvbkNsb3NlIC8gc2VuZEV2ZW50LlxuXHRcdHNlc3Npb24ub25FdmVudChldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQubWV0aG9kLnN0YXJ0c1dpdGgoJ1RhcmdldC4nKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlbmRFdmVudChldmVudC5tZXRob2QsIGV2ZW50LnBhcmFtcywgZXZlbnQuc2Vzc2lvbklkID8/IHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR9KTtcblxuXHRcdHNlc3Npb24ub25DbG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb24uc2Vzc2lvbklkKTtcblxuXHRcdFx0dGhpcy5zZW5kRXZlbnQoJ1RhcmdldC5kZXRhY2hlZEZyb21UYXJnZXQnLCB7XG5cdFx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0XHRcdHRhcmdldElkOiBzZXNzaW9uLnRhcmdldElkXG5cdFx0XHR9LCBzZXNzaW9uLnBhcmVudFNlc3Npb25JZCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKiogU2VuZCBhIGJyb3dzZXItbGV2ZWwgZXZlbnQgdG8gdGhlIGNsaWVudCAqL1xuXHRwcml2YXRlIHNlbmRFdmVudChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duLCBzZXNzaW9uSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzZXNzaW9uSWQgfHw9ICh0aGlzLl9pc0F0dGFjaGVkVG9Ccm93c2VyVGFyZ2V0ID8gdGhpcy5zZXNzaW9uSWQgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKHsgbWV0aG9kLCBwYXJhbXMsIHNlc3Npb25JZCB9KTtcblx0XHR0aGlzLl9vbkV2ZW50LmZpcmUoeyBtZXRob2QsIHBhcmFtcywgc2Vzc2lvbklkIH0pO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBQdWJsaWMgQVBJXG5cblx0Ly8gRXZlbnRzIHRvIGV4dGVybmFsIGNsaWVudHNcblx0cHJpdmF0ZSByZWFkb25seSBfb25FdmVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENEUEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25FdmVudDogRXZlbnQ8Q0RQRXZlbnQ+ID0gdGhpcy5fb25FdmVudC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25DbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkNsb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uQ2xvc2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENEUFJlc3BvbnNlIHwgQ0RQRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PENEUFJlc3BvbnNlIHwgQ0RQRXZlbnQ+ID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBTZW5kIGEgQ0RQIGNvbW1hbmQgYW5kIGF3YWl0IHRoZSByZXN1bHQuXG5cdCAqIEJyb3dzZXItbGV2ZWwgaGFuZGxlcnMgKEJyb3dzZXIuKiwgVGFyZ2V0LiopIGFyZSBjaGVja2VkIGZpcnN0LlxuXHQgKiBPdGhlciBjb21tYW5kcyBhcmUgcm91dGVkIHRvIHRoZSBwYWdlIHNlc3Npb24gaWRlbnRpZmllZCBieSBzZXNzaW9uSWQuXG5cdCAqL1xuXHRhc3luYyBzZW5kQ29tbWFuZChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duID0ge30sIHNlc3Npb25JZD86IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBCcm93c2VyLWxldmVsIGNvbW1hbmQgaGFuZGxpbmdcblx0XHRcdGlmIChcblx0XHRcdFx0IXNlc3Npb25JZCB8fFxuXHRcdFx0XHRzZXNzaW9uSWQgPT09IHRoaXMuc2Vzc2lvbklkIHx8XG5cdFx0XHRcdG1ldGhvZC5zdGFydHNXaXRoKCdCcm93c2VyLicpIHx8XG5cdFx0XHRcdG1ldGhvZC5zdGFydHNXaXRoKCdUYXJnZXQuJylcblx0XHRcdCkge1xuXHRcdFx0XHRjb25zdCBoYW5kbGVyID0gdGhpcy5faGFuZGxlcnMuZ2V0KG1ldGhvZCk7XG5cdFx0XHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDRFBNZXRob2ROb3RGb3VuZEVycm9yKG1ldGhvZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGF3YWl0IGhhbmRsZXIocGFyYW1zLCBzZXNzaW9uSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IENEUFNlcnZlckVycm9yKGBTZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uSWR9YCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24uc2VuZENvbW1hbmQobWV0aG9kLCBwYXJhbXMpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdCA/PyB7fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ0RQRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBY2NlcHQgYSBDRFAgcmVxdWVzdCBmcm9tIGEgbWVzc2FnZS1iYXNlZCB0cmFuc3BvcnQgKFdlYlNvY2tldCwgSVBDLCBldGMuKSwgcm91dGUgaXQsXG5cdCAqIGFuZCBkZWxpdmVyIHRoZSByZXNwb25zZSBvciBlcnJvciB2aWEge0BsaW5rIG9uTWVzc2FnZX0uXG5cdCAqL1xuXHRhc3luYyBzZW5kTWVzc2FnZSh7IGlkLCBtZXRob2QsIHBhcmFtcywgc2Vzc2lvbklkIH06IENEUFJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kQ29tbWFuZChtZXRob2QsIHBhcmFtcywgc2Vzc2lvbklkKVxuXHRcdFx0LnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUoeyBpZCwgcmVzdWx0LCBzZXNzaW9uSWQgfSk7XG5cdFx0XHR9KVxuXHRcdFx0LmNhdGNoKChlcnJvcjogRXJyb3IpID0+IHtcblx0XHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUoe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0XHRjb2RlOiBlcnJvciBpbnN0YW5jZW9mIENEUEVycm9yID8gZXJyb3IuY29kZSA6IENEUEVycm9yQ29kZS5TZXJ2ZXJFcnJvcixcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzZXNzaW9uSWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIENEUCBDb21tYW5kc1xuXG5cdHByaXZhdGUgaGFuZGxlQnJvd3NlckdldFdpbmRvd0ZvclRhcmdldCh7IHRhcmdldElkIH06IHsgdGFyZ2V0SWQ/OiBzdHJpbmcgfSwgc2Vzc2lvbklkPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRUYXJnZXRJZCA9IChzZXNzaW9uSWQgJiYgdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk/LnRhcmdldElkKSA/PyB0YXJnZXRJZDtcblx0XHRpZiAoIXJlc29sdmVkVGFyZ2V0SWQpIHtcblx0XHRcdHRocm93IG5ldyBDRFBTZXJ2ZXJFcnJvcignVW5hYmxlIHRvIHJlc29sdmUgdGFyZ2V0Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fdGFyZ2V0cy5nZXQocmVzb2x2ZWRUYXJnZXRJZCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRocm93IG5ldyBDRFBTZXJ2ZXJFcnJvcignVW5hYmxlIHRvIHJlc29sdmUgdGFyZ2V0Jyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclRhcmdldC5nZXRXaW5kb3dGb3JUYXJnZXQodGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlVGFyZ2V0R2V0QnJvd3NlckNvbnRleHRzKCkge1xuXHRcdHJldHVybiB7IGJyb3dzZXJDb250ZXh0SWRzOiB0aGlzLmJyb3dzZXJUYXJnZXQuZ2V0QnJvd3NlckNvbnRleHRzKCkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0Q3JlYXRlQnJvd3NlckNvbnRleHQoKSB7XG5cdFx0Y29uc3QgYnJvd3NlckNvbnRleHRJZCA9IGF3YWl0IHRoaXMuYnJvd3NlclRhcmdldC5jcmVhdGVCcm93c2VyQ29udGV4dCgpO1xuXHRcdHJldHVybiB7IGJyb3dzZXJDb250ZXh0SWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0RGlzcG9zZUJyb3dzZXJDb250ZXh0KHsgYnJvd3NlckNvbnRleHRJZCB9OiB7IGJyb3dzZXJDb250ZXh0SWQ6IHN0cmluZyB9KSB7XG5cdFx0YXdhaXQgdGhpcy5icm93c2VyVGFyZ2V0LmRpc3Bvc2VCcm93c2VyQ29udGV4dChicm93c2VyQ29udGV4dElkKTtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVRhcmdldEF0dGFjaFRvQnJvd3NlclRhcmdldCgpIHtcblx0XHR0aGlzLnNlbmRFdmVudCgnVGFyZ2V0LmF0dGFjaGVkVG9UYXJnZXQnLCB7XG5cdFx0XHRzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkLFxuXHRcdFx0dGFyZ2V0SW5mbzogdGhpcy5icm93c2VyVGFyZ2V0LnRhcmdldEluZm8sXG5cdFx0XHR3YWl0aW5nRm9yRGVidWdnZXI6IGZhbHNlXG5cdFx0fSk7XG5cdFx0dGhpcy5faXNBdHRhY2hlZFRvQnJvd3NlclRhcmdldCA9IHRydWU7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVUYXJnZXRBY3RpdmF0ZVRhcmdldCh7IHRhcmdldElkIH06IHsgdGFyZ2V0SWQ6IHN0cmluZyB9KSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fdGFyZ2V0cy5nZXQodGFyZ2V0SWQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoJ1VuYWJsZSB0byByZXNvbHZlIHRhcmdldCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVGFyZ2V0LmFjdGl2YXRlVGFyZ2V0KHRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVRhcmdldFNldEF1dG9BdHRhY2gocGFyYW1zOiB7IGF1dG9BdHRhY2g/OiBib29sZWFuOyBmbGF0dGVuPzogYm9vbGVhbiB9LCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcblx0XHRpZiAoc2Vzc2lvbklkICYmIHNlc3Npb25JZCAhPT0gdGhpcy5zZXNzaW9uSWQpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoYFNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25JZH1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjb25uZWN0aW9uLnNlbmRDb21tYW5kKCdUYXJnZXQuc2V0QXV0b0F0dGFjaCcsIHBhcmFtcyk7XG5cdFx0fVxuXG5cdFx0aWYgKCFwYXJhbXMuZmxhdHRlbikge1xuXHRcdFx0dGhyb3cgbmV3IENEUEludmFsaWRQYXJhbXNFcnJvcignVGhpcyBpbXBsZW1lbnRhdGlvbiBvbmx5IHN1cHBvcnRzIGF1dG8tYXR0YWNoIHdpdGggZmxhdHRlbj10cnVlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJveHktbGV2ZWwgYXV0by1hdHRhY2g6IGF0dGFjaCB0byBuZXcgdGFyZ2V0cyBhcyB0aGV5IGFyZSByZWdpc3RlcmVkLlxuXHRcdHRoaXMuX2F1dG9BdHRhY2ggPSBwYXJhbXMuYXV0b0F0dGFjaCA/PyBmYWxzZTtcblxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0U2V0RGlzY292ZXJUYXJnZXRzKHsgZGlzY292ZXIgPSBmYWxzZSB9OiB7IGRpc2NvdmVyPzogYm9vbGVhbiB9KSB7XG5cdFx0aWYgKGRpc2NvdmVyICE9PSB0aGlzLl9kaXNjb3Zlcikge1xuXHRcdFx0dGhpcy5fZGlzY292ZXIgPSBkaXNjb3ZlcjtcblxuXHRcdFx0aWYgKHRoaXMuX2Rpc2NvdmVyKSB7XG5cdFx0XHRcdC8vIEFubm91bmNlIGFsbCBleGlzdGluZyB0YXJnZXRzXG5cdFx0XHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIHRoaXMuX3RhcmdldHMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHR0aGlzLnNlbmRFdmVudCgnVGFyZ2V0LnRhcmdldENyZWF0ZWQnLCB7IHRhcmdldEluZm86IHRhcmdldC50YXJnZXRJbmZvIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUYXJnZXRHZXRUYXJnZXRzKCkge1xuXHRcdHJldHVybiB7IHRhcmdldEluZm9zOiBBcnJheS5mcm9tKHRoaXMuX3RhcmdldHMudmFsdWVzKCkpLm1hcCh0YXJnZXQgPT4gdGFyZ2V0LnRhcmdldEluZm8pIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVRhcmdldEdldFRhcmdldEluZm8oeyB0YXJnZXRJZCB9OiB7IHRhcmdldElkPzogc3RyaW5nIH0gPSB7fSkge1xuXHRcdGlmICghdGFyZ2V0SWQpIHtcblx0XHRcdC8vIE5vIHRhcmdldElkIHNwZWNpZmllZCAtLSByZXR1cm4gaW5mbyBhYm91dCB0aGUgYnJvd3NlciB0YXJnZXQgaXRzZWxmXG5cdFx0XHRyZXR1cm4geyB0YXJnZXRJbmZvOiB0aGlzLmJyb3dzZXJUYXJnZXQudGFyZ2V0SW5mbyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3RhcmdldHMuZ2V0KHRhcmdldElkKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IENEUFNlcnZlckVycm9yKCdVbmFibGUgdG8gcmVzb2x2ZSB0YXJnZXQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdGFyZ2V0SW5mbzogdGFyZ2V0LnRhcmdldEluZm8gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0QXR0YWNoVG9UYXJnZXQoeyB0YXJnZXRJZCwgZmxhdHRlbiB9OiB7IHRhcmdldElkOiBzdHJpbmc7IGZsYXR0ZW4/OiBib29sZWFuIH0pIHtcblx0XHRpZiAoIWZsYXR0ZW4pIHtcblx0XHRcdHRocm93IG5ldyBDRFBJbnZhbGlkUGFyYW1zRXJyb3IoJ1RoaXMgaW1wbGVtZW50YXRpb24gb25seSBzdXBwb3J0cyBhdHRhY2hUb1RhcmdldCB3aXRoIGZsYXR0ZW49dHJ1ZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3RhcmdldHMuZ2V0KHRhcmdldElkKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IENEUFNlcnZlckVycm9yKCdVbmFibGUgdG8gcmVzb2x2ZSB0YXJnZXQnKTtcblx0XHR9XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRhcmdldC5hdHRhY2goKTtcblx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6IGNvbm5lY3Rpb24uc2Vzc2lvbklkIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVRhcmdldERldGFjaEZyb21UYXJnZXQoeyBzZXNzaW9uSWQgfTogeyBzZXNzaW9uSWQ6IHN0cmluZyB9KSB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IENEUFNlcnZlckVycm9yKGBTZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uSWR9YCk7XG5cdFx0fVxuXG5cdFx0Y29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUYXJnZXRDcmVhdGVUYXJnZXQoeyB1cmwsIGJyb3dzZXJDb250ZXh0SWQgfTogeyB1cmw/OiBzdHJpbmc7IGJyb3dzZXJDb250ZXh0SWQ/OiBzdHJpbmcgfSkge1xuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuYnJvd3NlclRhcmdldC5jcmVhdGVUYXJnZXQodXJsIHx8ICdhYm91dDpibGFuaycsIGJyb3dzZXJDb250ZXh0SWQpO1xuXHRcdHRoaXMucmVnaXN0ZXJUYXJnZXQodGFyZ2V0KTtcblxuXHRcdC8vIFBsYXl3cmlnaHQgZXhwZWN0cyB0aGUgYXR0YWNobWVudCB0byBoYXBwZW4gYmVmb3JlIGNyZWF0ZVRhcmdldCByZXR1cm5zLlxuXHRcdGlmICh0aGlzLl9hdXRvQXR0YWNoICYmICF0aGlzLl9hdXRvQXR0YWNobWVudHMuaGFzKHRhcmdldCkpIHtcblx0XHRcdHRoaXMuX2F1dG9BdHRhY2htZW50cy5hZGQodGFyZ2V0KTtcblx0XHRcdGF3YWl0IHRhcmdldC5hdHRhY2goKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB0YXJnZXRJZDogdGFyZ2V0LnRhcmdldEluZm8udGFyZ2V0SWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0Q2xvc2VUYXJnZXQoeyB0YXJnZXRJZCB9OiB7IHRhcmdldElkOiBzdHJpbmcgfSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl90YXJnZXRzLmdldCh0YXJnZXRJZCk7XG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoJ1VuYWJsZSB0byByZXNvbHZlIHRhcmdldCcpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5icm93c2VyVGFyZ2V0LmNsb3NlVGFyZ2V0KHRhcmdldCk7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuXHRcdH1cblx0fVxuXG5cdC8vICNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsWUFBWSxxQkFBcUI7QUFDMUMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUF3RCxVQUFVLGNBQWMsZ0JBQWdCLHdCQUF3Qiw2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
