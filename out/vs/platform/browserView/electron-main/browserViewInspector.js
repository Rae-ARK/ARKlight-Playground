import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { BrowserElementSelectionMode } from "../common/browserView.js";
import { BrowserViewFrameInspector } from "./browserViewFrameInspector.js";
import { localize } from "../../../nls.js";
const localizedStrings = {
  addComment: localize("browserView.addComment", "Add Comment"),
  addCommentPlaceholder: localize("browserView.addCommentPlaceholder", "Add a comment"),
  commentOnSelectedElement: localize("browserView.commentOnSelectedElement", "Comment on selected element"),
  elementComment: localize("browserView.elementComment", "Element comment {0}"),
  elementCommentWithBody: localize("browserView.elementCommentWithBody", "Element comment {0}: {1}"),
  emptyElementComment: localize("browserView.emptyElementComment", "Empty element comment {0}"),
  removeComment: localize("browserView.removeComment", "Remove Comment"),
  removeElementComment: localize("browserView.removeElementComment", "Remove element comment")
};
var BrowserViewInspectElementId = /* @__PURE__ */ ((BrowserViewInspectElementId2) => {
  BrowserViewInspectElementId2["Active"] = "active";
  BrowserViewInspectElementId2["ContextMenuTarget"] = "context-menu-target";
  return BrowserViewInspectElementId2;
})(BrowserViewInspectElementId || {});
class BrowserViewInspector extends Disposable {
  constructor(browser) {
    super();
    this.browser = browser;
    this._onDidSelectElement = this._register(new Emitter());
    this.onDidSelectElement = this._onDidSelectElement.event;
    this._onDidRemoveElementComment = this._register(new Emitter());
    this.onDidRemoveElementComment = this._onDidRemoveElementComment.event;
    this._onDidChangeElementSelectionState = this._register(new Emitter());
    this.onDidChangeElementSelectionState = this._onDidChangeElementSelectionState.event;
    this._elementSelectionActive = false;
    this._activeSelection = this._register(new MutableDisposable());
    this._inspectionOperation = Promise.resolve();
    this._theme = {};
    // Area selection — drag-to-select a rectangle on the top frame.
    // `onDidPickArea` fires exactly once per session, terminating it.
    // The rectangle is undefined when the picker is cancelled (ESC, zero-area drag,
    // external toggle off, navigation, or supersession by element selection).
    // Consumers should listen to this single event instead of trying to reconcile
    // rect vs. activation events across the IPC boundary — those two events travel
    // through separate channels and can be delivered out of order.
    this._onDidPickArea = this._register(new Emitter());
    this.onDidPickArea = this._onDidPickArea.event;
    this._onDidChangeAreaSelectionActive = this._register(new Emitter());
    this.onDidChangeAreaSelectionActive = this._onDidChangeAreaSelectionActive.event;
    this._areaSelectionActive = false;
    this._activeAreaSelection = this._register(new MutableDisposable());
    this._registry = this._register(new FrameInspectorRegistry());
    const webContents = this.browser.webContents;
    this._register(this._registry.onDidAdopt((inspector) => this._onInspectorAdopted(inspector)));
    const onNavigated = () => {
      this._activeSelection.clear();
      this._activeAreaSelection.clear();
    };
    webContents.on("did-navigate", onNavigated);
    this._register({ dispose: () => webContents.removeListener("did-navigate", onNavigated) });
    const onIpcMessage = (_event, channel, ...args) => {
      const senderFrame = _event.senderFrame;
      if (channel === "vscode:browserView:preloadReady") {
        if (!senderFrame) {
          return;
        }
        const frameToken = args[0];
        if (!frameToken) {
          return;
        }
        senderFrame.postMessage("vscode:browserView:setTheme", this._theme);
        senderFrame.postMessage("vscode:browserView:setLocalizedStrings", localizedStrings);
        this._registry.notifyFrameReady(senderFrame, frameToken);
        if (senderFrame === webContents.mainFrame && this._activeAreaSelection.value) {
          try {
            senderFrame.postMessage("vscode:browserView:startAreaPicker", void 0);
          } catch {
          }
        }
      } else if (channel === "vscode:browserView:areaPicked") {
        if (senderFrame !== webContents.mainFrame) {
          return;
        }
        const rect = args[0];
        const validRect = rect && rect.width > 0 && rect.height > 0 ? rect : void 0;
        this._finishAreaPick(validRect);
      } else if (channel === "vscode:browserView:areaPickStopped") {
        if (senderFrame !== webContents.mainFrame) {
          return;
        }
        this._finishAreaPick(void 0);
      }
    };
    webContents.on("ipc-message", onIpcMessage);
    this._register({ dispose: () => webContents.removeListener("ipc-message", onIpcMessage) });
    this._register(this.browser.debugger.onTargetDiscovered(async ({ targetId, type }) => {
      if (type === "iframe") {
        try {
          const session = await this.browser.debugger.attachToTarget(targetId);
          this._watchSession(session);
        } catch {
          return;
        }
      }
    }));
    this.browser.debugger.attach().then((conn) => this._watchSession(conn)).catch(() => {
    });
  }
  get isElementSelectionActive() {
    return this._elementSelectionActive;
  }
  get elementSelectionState() {
    return {
      active: this._elementSelectionActive,
      options: this._activeSelection.value?.options ?? {}
    };
  }
  get isAreaSelectionActive() {
    return this._areaSelectionActive;
  }
  /**
   * Watch a CDP session for execution contexts. When a default context appears,
   * probes for the preload token and correlates with the pending WebFrameMain.
   *
   * Called for every session: the main page session (sees same-origin frames)
   * and each cross-origin target session (sees only its own frame).
   */
  _watchSession(session) {
    this._register(session.onEvent(async (event) => {
      if (event.method === "Runtime.executionContextCreated") {
        const context = event.params.context;
        if (!context?.auxData?.isDefault || !context.auxData.frameId) {
          return;
        }
        const frameId = context.auxData.frameId;
        const uniqueContextId = context.uniqueId;
        try {
          const { result } = await session.sendCommand("Runtime.evaluate", {
            expression: "window.__vscode_helpers?.getFrameToken?.()",
            returnByValue: true,
            uniqueContextId
          });
          const token = result.value;
          if (!token) {
            return;
          }
          this._registry.notifyContextDiscovered(session, uniqueContextId, frameId, token);
        } catch {
        }
      } else if (event.method === "Page.frameDetached") {
        const frameId = event.params?.frameId;
        if (frameId) {
          this._registry.disposeByFrameId(frameId);
        }
      } else if (event.method === "Runtime.executionContextsCleared") {
        this._registry.disposeBySession(session);
      }
    }));
    Event.once(session.onClose)(() => {
      this._registry.disposeBySession(session);
    });
    session.sendCommand("Runtime.enable").catch(() => {
    });
    session.sendCommand("Page.enable").catch(() => {
    });
  }
  /**
   * Called by the registry when a frame inspector is fully adopted.
   * Wires its events to this orchestrator.
   */
  _onInspectorAdopted(inspector) {
    inspector.onDidInspectElement(async (nodeData) => {
      if (!this._activeSelection.value?.options?.continuous) {
        this._activeSelection.clear();
      }
      try {
        const offset = await this._getFrameOffsetInPage(inspector.frame);
        nodeData = this._offsetElementData(nodeData, offset);
      } catch {
      }
      this._onDidSelectElement.fire(nodeData);
    });
    inspector.onDidRemoveElementComment((elementId) => this._onDidRemoveElementComment.fire(elementId));
    inspector.onDidStopPicking(() => {
      this._activeSelection.clear();
    });
    if (this._activeSelection.value) {
      void this._queueInspectionOperation(async () => {
        const activeSelection = this._activeSelection.value;
        if (activeSelection) {
          await inspector.startInspection(activeSelection.options);
        }
      }).catch(() => {
      });
    }
    inspector.setTheme(this._theme);
  }
  setTheme(theme) {
    this._theme = theme;
    for (const inspector of this._registry.inspectors) {
      inspector.setTheme(theme);
    }
  }
  /**
   * Toggle element selection mode across all frames.
   */
  async toggleElementSelection(enabled, options = {}) {
    const newEnabled = enabled ?? !this._elementSelectionActive;
    if (!newEnabled) {
      this._activeSelection.clear();
      return;
    }
    this._activeAreaSelection.clear();
    const activeSelection = this._activeSelection.value;
    const updatedOptions = activeSelection ? { ...activeSelection.options, ...options } : { mode: BrowserElementSelectionMode.Select, ...options };
    if (activeSelection) {
      activeSelection.options = updatedOptions;
      try {
        if (await this._startInspection(activeSelection, updatedOptions)) {
          this._elementSelectionActive = true;
          this._onDidChangeElementSelectionState.fire({ active: true, options: updatedOptions });
        }
      } catch {
        if (this._activeSelection.value === activeSelection && activeSelection.options === updatedOptions) {
          this._activeSelection.clear();
        }
      }
      return;
    }
    const selection = {
      options: updatedOptions,
      dispose: () => {
        if (this._activeSelection.value === selection) {
          this._elementSelectionActive = false;
          this._onDidChangeElementSelectionState.fire({ active: false, options: selection.options });
          this._activeSelection.clearAndLeak();
          void this._queueInspectionOperation(async () => {
            await Promise.all([...this._registry.inspectors].map((i) => i.stopInspection()));
          }).catch(() => {
          });
        }
      }
    };
    this._activeSelection.value = selection;
    try {
      if (await this._startInspection(selection, updatedOptions)) {
        this._elementSelectionActive = true;
        this._onDidChangeElementSelectionState.fire({ active: true, options: updatedOptions });
      }
    } catch {
      if (this._activeSelection.value === selection && selection.options === updatedOptions) {
        this._activeSelection.clear();
      }
    }
  }
  async _startInspection(selection, options) {
    await this._queueInspectionOperation(async () => {
      if (this._activeSelection.value !== selection || selection.options !== options) {
        return;
      }
      await Promise.all([...this._registry.inspectors].map((i) => i.startInspection(options)));
    });
    return this._activeSelection.value === selection && selection.options === options;
  }
  _queueInspectionOperation(operation) {
    const result = this._inspectionOperation.then(operation);
    this._inspectionOperation = result.catch(() => {
    });
    return result;
  }
  setElementComments(update) {
    for (const inspector of this._registry.inspectors) {
      inspector.setElementComments(update);
    }
  }
  /**
   * Toggle drag-to-select area picking on the top frame only.
   * The picker reports the literal user-drawn rectangle (or `undefined` on cancellation)
   * via {@link onDidPickArea}; no DOM elements are inspected.
   */
  async toggleAreaSelection(enabled) {
    const newEnabled = enabled ?? !this._areaSelectionActive;
    if (newEnabled === this._areaSelectionActive) {
      return;
    }
    if (!newEnabled) {
      this._activeAreaSelection.clear();
      return;
    }
    this._activeSelection.clear();
    const mainFrame = this.browser.webContents.mainFrame;
    const start = () => {
      mainFrame.postMessage("vscode:browserView:startAreaPicker", void 0);
    };
    const stop = () => {
      try {
        mainFrame.postMessage("vscode:browserView:stopAreaPicker", void 0);
      } catch {
      }
    };
    const selection = {
      dispose: () => {
        stop();
        this._finishAreaPick(void 0);
      }
    };
    this._activeAreaSelection.value = selection;
    try {
      start();
      if (this._activeAreaSelection.value === selection) {
        this._areaSelectionActive = true;
        this._onDidChangeAreaSelectionActive.fire(true);
      }
    } catch {
      this._activeAreaSelection.clear();
    }
  }
  /**
   * Terminate the current area-pick session, firing `onDidPickArea` exactly once.
   * No-op if no session is active. Uses `clearAndLeak` to avoid recursing into
   * the IActiveSelection.dispose path.
   */
  _finishAreaPick(rect) {
    if (!this._areaSelectionActive && !this._activeAreaSelection.value) {
      return;
    }
    const wasActive = this._areaSelectionActive;
    this._areaSelectionActive = false;
    this._activeAreaSelection.clearAndLeak();
    this._onDidPickArea.fire(rect);
    if (wasActive) {
      this._onDidChangeAreaSelectionActive.fire(false);
    }
  }
  /**
   * Resolve a handle to an element. Routes to the correct frame inspector.
   */
  getElementHandle(id, frame) {
    const handle = this._registry.getByFrame(frame)?.getElementHandle(id);
    if (!handle) {
      return void 0;
    }
    let commentRequested = false;
    return {
      addToChat: () => handle.addToChat(),
      addComment: () => {
        if (commentRequested) {
          return;
        }
        commentRequested = true;
        setTimeout(() => {
          this._activeAreaSelection.clear();
          this._activeSelection.clear();
          void this._queueInspectionOperation(async () => {
            if (!this.browser.webContents.isDestroyed()) {
              this.browser.webContents.focus();
              handle.addComment();
            }
          });
        }, 0);
      },
      highlight: () => handle.highlight(),
      hideHighlight: () => handle.hideHighlight(),
      dispose: () => {
        if (!commentRequested) {
          handle.dispose();
        }
      }
    };
  }
  async getVisualViewportScale(frame = this.browser.webContents.mainFrame) {
    return this._registry.getByFrame(frame)?.getVisualViewportScale() ?? 1;
  }
  /**
   * Compute the cumulative offset of a frame relative to the top-level page.
   * Walks up the frame hierarchy using the parent's CDP session to query the
   * iframe element's box model via `DOM.getFrameOwner` + `DOM.getBoxModel`.
   * Works for both same-origin and cross-origin frames.
   */
  async _getFrameOffsetInPage(frame) {
    const mainFrame = this.browser.webContents.mainFrame;
    let x = 0;
    let y = 0;
    let current = frame;
    while (current !== mainFrame) {
      const parent = current.parent;
      if (!parent) {
        break;
      }
      const childInspector = this._registry.getByFrame(current);
      const parentInspector = this._registry.getByFrame(parent);
      if (!childInspector || !parentInspector) {
        break;
      }
      try {
        const childFrameId = childInspector.frameId;
        const frameOwner = await parentInspector.connection.sendCommand("DOM.getFrameOwner", {
          frameId: childFrameId
        });
        const boxModel = await parentInspector.connection.sendCommand("DOM.getBoxModel", {
          backendNodeId: frameOwner.backendNodeId
        });
        const content = boxModel.model.content;
        x += content[0];
        y += content[1];
      } catch {
        break;
      }
      current = parent;
    }
    return { x, y };
  }
  /**
   * Offset element data bounds by a frame offset.
   */
  _offsetElementData(data, offset) {
    if (offset.x === 0 && offset.y === 0) {
      return data;
    }
    return {
      ...data,
      bounds: {
        x: data.bounds.x + offset.x,
        y: data.bounds.y + offset.y,
        width: data.bounds.width,
        height: data.bounds.height
      }
    };
  }
}
class FrameInspectorRegistry extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidAdopt = this._register(new Emitter());
    this.onDidAdopt = this._onDidAdopt.event;
    /** Pending halves waiting for their counterpart. */
    this._pendingFrames = /* @__PURE__ */ new Map();
    this._pendingSessions = /* @__PURE__ */ new Map();
    /** Adopted inspectors indexed multiple ways. */
    this._all = /* @__PURE__ */ new Set();
    this._byFrame = /* @__PURE__ */ new WeakMap();
    this._byFrameId = /* @__PURE__ */ new Map();
    this._bySession = /* @__PURE__ */ new Map();
  }
  get inspectors() {
    return this._all;
  }
  getByFrame(frame) {
    return this._byFrame.get(frame);
  }
  /**
   * Called when a preload script signals readiness with a token.
   * If a matching CDP context was already discovered, adopts immediately.
   */
  notifyFrameReady(frame, token) {
    const pending = this._pendingSessions.get(token);
    if (pending) {
      this._pendingSessions.delete(token);
      this._adopt(pending.session, pending.uniqueContextId, pending.frameId, frame);
    } else {
      this._pendingFrames.set(token, frame);
    }
  }
  /**
   * Called when a CDP execution context is discovered and its preload token probed.
   * If a matching WebFrameMain was already registered, adopts immediately.
   */
  notifyContextDiscovered(session, uniqueContextId, frameId, token) {
    const frame = this._pendingFrames.get(token);
    if (frame) {
      this._pendingFrames.delete(token);
      this._adopt(session, uniqueContextId, frameId, frame);
    } else {
      this._pendingSessions.set(token, { session, uniqueContextId, frameId });
    }
  }
  /** Dispose the inspector owning the given CDP frameId, if any. Also cleans pending entries. */
  disposeByFrameId(frameId) {
    this._byFrameId.get(frameId)?.dispose();
    for (const [token, pending] of this._pendingSessions) {
      if (pending.frameId === frameId) {
        this._pendingSessions.delete(token);
      }
    }
    for (const [token, frame] of this._pendingFrames) {
      if (frame.detached || frame.isDestroyed()) {
        this._pendingFrames.delete(token);
      }
    }
  }
  /** Dispose all inspectors whose connection is the given session and clear related pending state. */
  disposeBySession(session) {
    const set = this._bySession.get(session);
    if (set) {
      for (const inspector of [...set]) {
        inspector.dispose();
      }
    }
    for (const [token, pending] of this._pendingSessions) {
      if (pending.session === session) {
        this._pendingSessions.delete(token);
      }
    }
  }
  _adopt(session, uniqueContextId, frameId, frame) {
    if (frame.detached || frame.isDestroyed()) {
      return;
    }
    const inspector = new BrowserViewFrameInspector(session, frame, uniqueContextId, frameId);
    this._all.add(inspector);
    this._byFrame.set(frame, inspector);
    this._byFrameId.set(frameId, inspector);
    let sessionSet = this._bySession.get(session);
    if (!sessionSet) {
      sessionSet = /* @__PURE__ */ new Set();
      this._bySession.set(session, sessionSet);
    }
    sessionSet.add(inspector);
    inspector.onWillDispose(() => {
      this._all.delete(inspector);
      this._byFrame.delete(frame);
      this._byFrameId.delete(frameId);
      const s = this._bySession.get(session);
      if (s) {
        s.delete(inspector);
        if (s.size === 0) {
          this._bySession.delete(session);
        }
      }
    });
    this._onDidAdopt.fire(inspector);
  }
  dispose() {
    for (const inspector of [...this._all]) {
      inspector.dispose();
    }
    this._pendingFrames.clear();
    this._pendingSessions.clear();
    super.dispose();
  }
}
export {
  BrowserViewInspectElementId,
  BrowserViewInspector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXdJbnNwZWN0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUsIElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlLCBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zLCBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25TdGF0ZSwgSUVsZW1lbnREYXRhLCBJQnJvd3NlclZpZXdUaGVtZSwgSUJyb3dzZXJWaWV3UmVjdCwgSUJyb3dzZXJWaWV3UHJlbG9hZExvY2FsaXplZFN0cmluZ3MgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSUNEUENvbm5lY3Rpb24gfSBmcm9tICcuLi9jb21tb24vY2RwL3R5cGVzLmpzJztcbmltcG9ydCB0eXBlIHsgQnJvd3NlclZpZXcgfSBmcm9tICcuL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3IgfSBmcm9tICcuL2Jyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3IuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuXG5jb25zdCBsb2NhbGl6ZWRTdHJpbmdzOiBJQnJvd3NlclZpZXdQcmVsb2FkTG9jYWxpemVkU3RyaW5ncyA9IHtcblx0YWRkQ29tbWVudDogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LmFkZENvbW1lbnQnLCBcIkFkZCBDb21tZW50XCIpLFxuXHRhZGRDb21tZW50UGxhY2Vob2xkZXI6IGxvY2FsaXplKCdicm93c2VyVmlldy5hZGRDb21tZW50UGxhY2Vob2xkZXInLCBcIkFkZCBhIGNvbW1lbnRcIiksXG5cdGNvbW1lbnRPblNlbGVjdGVkRWxlbWVudDogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LmNvbW1lbnRPblNlbGVjdGVkRWxlbWVudCcsIFwiQ29tbWVudCBvbiBzZWxlY3RlZCBlbGVtZW50XCIpLFxuXHRlbGVtZW50Q29tbWVudDogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LmVsZW1lbnRDb21tZW50JywgXCJFbGVtZW50IGNvbW1lbnQgezB9XCIpLFxuXHRlbGVtZW50Q29tbWVudFdpdGhCb2R5OiBsb2NhbGl6ZSgnYnJvd3NlclZpZXcuZWxlbWVudENvbW1lbnRXaXRoQm9keScsIFwiRWxlbWVudCBjb21tZW50IHswfTogezF9XCIpLFxuXHRlbXB0eUVsZW1lbnRDb21tZW50OiBsb2NhbGl6ZSgnYnJvd3NlclZpZXcuZW1wdHlFbGVtZW50Q29tbWVudCcsIFwiRW1wdHkgZWxlbWVudCBjb21tZW50IHswfVwiKSxcblx0cmVtb3ZlQ29tbWVudDogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LnJlbW92ZUNvbW1lbnQnLCBcIlJlbW92ZSBDb21tZW50XCIpLFxuXHRyZW1vdmVFbGVtZW50Q29tbWVudDogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LnJlbW92ZUVsZW1lbnRDb21tZW50JywgXCJSZW1vdmUgZWxlbWVudCBjb21tZW50XCIpLFxufTtcblxuaW50ZXJmYWNlIElBY3RpdmVTZWxlY3Rpb24gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdG9wdGlvbnM6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnM7XG59XG5cbmludGVyZmFjZSBJQWN0aXZlQXJlYVNlbGVjdGlvbiBleHRlbmRzIElEaXNwb3NhYmxlIHsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIElFbGVtZW50SGFuZGxlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRhZGRUb0NoYXQoKTogUHJvbWlzZTx2b2lkPjtcblx0YWRkQ29tbWVudCgpOiB2b2lkO1xuXHRoaWdobGlnaHQoKTogUHJvbWlzZTx2b2lkPjtcblx0aGlkZUhpZ2hsaWdodCgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKipcbiAqIFdlbGwta25vd24gaWRzIHVuZGVyc3Rvb2QgYnkgYF9fdnNjb2RlX2hlbHBlcnMuZ2V0RWxlbWVudChpZClgIGluXG4gKiBgcHJlbG9hZC1icm93c2VyVmlldy50c2AuIEFueSBvdGhlciBzdHJpbmcgaXMgdHJlYXRlZCBhcyB0aGUgaWQgb2YgYVxuICogZHluYW1pY2FsbHkgdHJhY2tlZCBlbGVtZW50LlxuICovXG5leHBvcnQgY29uc3QgZW51bSBCcm93c2VyVmlld0luc3BlY3RFbGVtZW50SWQge1xuXHQvKiogVGhlIHBhZ2UncyBgZG9jdW1lbnQuYWN0aXZlRWxlbWVudGAuICovXG5cdEFjdGl2ZSA9ICdhY3RpdmUnLFxuXHQvKiogVGhlIGVsZW1lbnQgdGFyZ2V0ZWQgYnkgdGhlIG1vc3QgcmVjZW50IGBjb250ZXh0bWVudWAgZXZlbnQuICovXG5cdENvbnRleHRNZW51VGFyZ2V0ID0gJ2NvbnRleHQtbWVudS10YXJnZXQnLFxufVxuXG4vKipcbiAqIE1hbmFnZXMgZWxlbWVudCBpbnNwZWN0aW9uIGFjcm9zcyBhbGwgZnJhbWVzIGluIGEgYnJvd3NlciB2aWV3LlxuICpcbiAqIENyZWF0ZXMgYSB7QGxpbmsgQnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvcn0gZm9yIHRoZSBtYWluIGZyYW1lIGFuZFxuICogYXV0b21hdGljYWxseSBkaXNjb3ZlcnMgaWZyYW1lIENEUCB0YXJnZXRzIHZpYSBhdXRvLWF0dGFjaCwgbWF0Y2hpbmdcbiAqIHRoZW0gdG8gdGhlaXIgY29ycmVzcG9uZGluZyBgV2ViRnJhbWVNYWluYCBpbnN0YW5jZXMgdXNpbmcgYW4gb3BhcXVlXG4gKiB0b2tlbiBnZW5lcmF0ZWQgYnkgdGhlIHByZWxvYWQgc2NyaXB0LlxuICpcbiAqIFRoaXMgY2xhc3MgaXMgYSB0aGluIG9yY2hlc3RyYXRvciBcdTIwMTQgYWxsIHBlci1mcmFtZSBDRFAgbG9naWMgKGRvbWFpblxuICogaW5pdGlhbGl6YXRpb24sIGVsZW1lbnQgZXh0cmFjdGlvbiwgQ0RQIGluc3BlY3QgbW9kZSkgbGl2ZXMgaW5cbiAqIHtAbGluayBCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yfS5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJWaWV3SW5zcGVjdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVsZW1lbnREYXRhPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3RFbGVtZW50OiBFdmVudDxJRWxlbWVudERhdGE+ID0gdGhpcy5fb25EaWRTZWxlY3RFbGVtZW50LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUVsZW1lbnRDb21tZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudCA9IHRoaXMuX29uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFbGVtZW50U2VsZWN0aW9uU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25TdGF0ZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlOiBFdmVudDxJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25TdGF0ZT4gPSB0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIF9lbGVtZW50U2VsZWN0aW9uQWN0aXZlID0gZmFsc2U7XG5cdGdldCBpc0VsZW1lbnRTZWxlY3Rpb25BY3RpdmUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9lbGVtZW50U2VsZWN0aW9uQWN0aXZlOyB9XG5cdGdldCBlbGVtZW50U2VsZWN0aW9uU3RhdGUoKTogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhY3RpdmU6IHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25BY3RpdmUsXG5cdFx0XHRvcHRpb25zOiB0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWU/Lm9wdGlvbnMgPz8ge31cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElBY3RpdmVTZWxlY3Rpb24+KCkpO1xuXHRwcml2YXRlIF9pbnNwZWN0aW9uT3BlcmF0aW9uOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHByaXZhdGUgX3RoZW1lOiBJQnJvd3NlclZpZXdUaGVtZSA9IHt9O1xuXG5cdC8vIEFyZWEgc2VsZWN0aW9uIFx1MjAxNCBkcmFnLXRvLXNlbGVjdCBhIHJlY3RhbmdsZSBvbiB0aGUgdG9wIGZyYW1lLlxuXHQvLyBgb25EaWRQaWNrQXJlYWAgZmlyZXMgZXhhY3RseSBvbmNlIHBlciBzZXNzaW9uLCB0ZXJtaW5hdGluZyBpdC5cblx0Ly8gVGhlIHJlY3RhbmdsZSBpcyB1bmRlZmluZWQgd2hlbiB0aGUgcGlja2VyIGlzIGNhbmNlbGxlZCAoRVNDLCB6ZXJvLWFyZWEgZHJhZyxcblx0Ly8gZXh0ZXJuYWwgdG9nZ2xlIG9mZiwgbmF2aWdhdGlvbiwgb3Igc3VwZXJzZXNzaW9uIGJ5IGVsZW1lbnQgc2VsZWN0aW9uKS5cblx0Ly8gQ29uc3VtZXJzIHNob3VsZCBsaXN0ZW4gdG8gdGhpcyBzaW5nbGUgZXZlbnQgaW5zdGVhZCBvZiB0cnlpbmcgdG8gcmVjb25jaWxlXG5cdC8vIHJlY3QgdnMuIGFjdGl2YXRpb24gZXZlbnRzIGFjcm9zcyB0aGUgSVBDIGJvdW5kYXJ5IFx1MjAxNCB0aG9zZSB0d28gZXZlbnRzIHRyYXZlbFxuXHQvLyB0aHJvdWdoIHNlcGFyYXRlIGNoYW5uZWxzIGFuZCBjYW4gYmUgZGVsaXZlcmVkIG91dCBvZiBvcmRlci5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQaWNrQXJlYSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyVmlld1JlY3QgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFBpY2tBcmVhOiBFdmVudDxJQnJvd3NlclZpZXdSZWN0IHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkUGlja0FyZWEuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZUFyZWFTZWxlY3Rpb25BY3RpdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfYXJlYVNlbGVjdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXHRnZXQgaXNBcmVhU2VsZWN0aW9uQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUFyZWFTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUFjdGl2ZUFyZWFTZWxlY3Rpb24+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEZyYW1lSW5zcGVjdG9yUmVnaXN0cnkoKSk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBicm93c2VyOiBCcm93c2VyVmlldykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCB3ZWJDb250ZW50cyA9IHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cztcblxuXHRcdC8vIFdpcmUgdXAgaW5zcGVjdG9yIGFkb3B0aW9uIGZyb20gdGhlIHJlZ2lzdHJ5XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVnaXN0cnkub25EaWRBZG9wdChpbnNwZWN0b3IgPT4gdGhpcy5fb25JbnNwZWN0b3JBZG9wdGVkKGluc3BlY3RvcikpKTtcblxuXHRcdC8vIE5hdmlnYXRpb24gZGVzdHJveXMgcHJlbG9hZCBvdmVybGF5cyBhbmQgQ0RQIHN0YXRlXG5cdFx0Y29uc3Qgb25OYXZpZ2F0ZWQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3RpdmVTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHR9O1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdkaWQtbmF2aWdhdGUnLCBvbk5hdmlnYXRlZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiB3ZWJDb250ZW50cy5yZW1vdmVMaXN0ZW5lcignZGlkLW5hdmlnYXRlJywgb25OYXZpZ2F0ZWQpIH0pO1xuXG5cdFx0Ly8gUHJlbG9hZCByZWFkeSBcdTIwMTQgdGhlIGtleSBjb3JyZWxhdGlvbiBwb2ludCBiZXR3ZWVuIFdlYkZyYW1lTWFpbiBhbmQgQ0RQIHRhcmdldFxuXHRcdGNvbnN0IG9uSXBjTWVzc2FnZSA9IChfZXZlbnQ6IEVsZWN0cm9uLkV2ZW50LCBjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VuZGVyRnJhbWUgPSAoX2V2ZW50IGFzIHsgc2VuZGVyRnJhbWU/OiBFbGVjdHJvbi5XZWJGcmFtZU1haW4gfSkuc2VuZGVyRnJhbWU7XG5cdFx0XHRpZiAoY2hhbm5lbCA9PT0gJ3ZzY29kZTpicm93c2VyVmlldzpwcmVsb2FkUmVhZHknKSB7XG5cdFx0XHRcdGlmICghc2VuZGVyRnJhbWUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZnJhbWVUb2tlbiA9IGFyZ3NbMF0gYXMgc3RyaW5nO1xuXHRcdFx0XHRpZiAoIWZyYW1lVG9rZW4pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBcHBseSB0aGVtZSBpbW1lZGlhdGVseSByZWdhcmRsZXNzIG9mIGluc3BlY3RvciBzdGF0ZVxuXHRcdFx0XHRzZW5kZXJGcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OnNldFRoZW1lJywgdGhpcy5fdGhlbWUpO1xuXHRcdFx0XHRzZW5kZXJGcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OnNldExvY2FsaXplZFN0cmluZ3MnLCBsb2NhbGl6ZWRTdHJpbmdzKTtcblxuXHRcdFx0XHR0aGlzLl9yZWdpc3RyeS5ub3RpZnlGcmFtZVJlYWR5KHNlbmRlckZyYW1lLCBmcmFtZVRva2VuKTtcblxuXHRcdFx0XHQvLyBJZiBhcmVhIHNlbGVjdGlvbiB3YXMgYWN0aXZhdGVkIGJlZm9yZSB0aGUgbWFpbi1mcmFtZSBwcmVsb2FkXG5cdFx0XHRcdC8vIGZpbmlzaGVkIHdpcmluZyB1cCBpdHMgSVBDIGxpc3RlbmVycyAoZS5nLiByaWdodCBhZnRlciBhXG5cdFx0XHRcdC8vIG5hdmlnYXRpb24pLCB0aGUgb3JpZ2luYWwgYHN0YXJ0QXJlYVBpY2tlcmAgcG9zdE1lc3NhZ2Ugd2FzXG5cdFx0XHRcdC8vIGRyb3BwZWQuIFJlcGxheSBpdCBub3cgc28gdGhlIHBpY2tlciBhY3R1YWxseSBhcHBlYXJzIGluc3RlYWRcblx0XHRcdFx0Ly8gb2YgbGVhdmluZyB0aGUgbW9kZWwgcmVwb3J0aW5nIGFjdGl2ZSB3aXRoIG5vIHZpc2libGUgb3ZlcmxheS5cblx0XHRcdFx0aWYgKHNlbmRlckZyYW1lID09PSB3ZWJDb250ZW50cy5tYWluRnJhbWUgJiYgdGhpcy5fYWN0aXZlQXJlYVNlbGVjdGlvbi52YWx1ZSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRzZW5kZXJGcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OnN0YXJ0QXJlYVBpY2tlcicsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBGcmFtZSBtYXkgYmUgZ29uZSBcdTIwMTQgaWdub3JlLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChjaGFubmVsID09PSAndnNjb2RlOmJyb3dzZXJWaWV3OmFyZWFQaWNrZWQnKSB7XG5cdFx0XHRcdC8vIEFyZWEgc2VsZWN0aW9uIGlzIHNjb3BlZCB0byB0aGUgdG9wIGZyYW1lIFx1MjAxNCB0aGUgdXNlci1kcmF3blxuXHRcdFx0XHQvLyByZWN0YW5nbGUgaXMgaW4gbWFpbi1mcmFtZSB2aWV3cG9ydCBjb29yZGluYXRlcy5cblx0XHRcdFx0aWYgKHNlbmRlckZyYW1lICE9PSB3ZWJDb250ZW50cy5tYWluRnJhbWUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVjdCA9IGFyZ3NbMF0gYXMgSUJyb3dzZXJWaWV3UmVjdCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgdmFsaWRSZWN0ID0gcmVjdCAmJiByZWN0LndpZHRoID4gMCAmJiByZWN0LmhlaWdodCA+IDAgPyByZWN0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9maW5pc2hBcmVhUGljayh2YWxpZFJlY3QpO1xuXHRcdFx0fSBlbHNlIGlmIChjaGFubmVsID09PSAndnNjb2RlOmJyb3dzZXJWaWV3OmFyZWFQaWNrU3RvcHBlZCcpIHtcblx0XHRcdFx0aWYgKHNlbmRlckZyYW1lICE9PSB3ZWJDb250ZW50cy5tYWluRnJhbWUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZmluaXNoQXJlYVBpY2sodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdpcGMtbWVzc2FnZScsIG9uSXBjTWVzc2FnZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiB3ZWJDb250ZW50cy5yZW1vdmVMaXN0ZW5lcignaXBjLW1lc3NhZ2UnLCBvbklwY01lc3NhZ2UpIH0pO1xuXG5cdFx0Ly8gQ3Jvc3Mtb3JpZ2luIChPT1BJRikgdGFyZ2V0cyBnZXQgdGhlaXIgb3duIHNlc3Npb24gXHUyMDE0IHdhdGNoIGl0IGZvciBjb250ZXh0c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJvd3Nlci5kZWJ1Z2dlci5vblRhcmdldERpc2NvdmVyZWQoYXN5bmMgKHsgdGFyZ2V0SWQsIHR5cGUgfSkgPT4ge1xuXHRcdFx0aWYgKHR5cGUgPT09ICdpZnJhbWUnKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuYnJvd3Nlci5kZWJ1Z2dlci5hdHRhY2hUb1RhcmdldCh0YXJnZXRJZCk7XG5cdFx0XHRcdFx0dGhpcy5fd2F0Y2hTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBdHRhY2ggdGhlIG1haW4gZGVidWdnZXIgc2Vzc2lvbiBhbmQgd2F0Y2ggaXQgZm9yIGNvbnRleHRzXG5cdFx0dGhpcy5icm93c2VyLmRlYnVnZ2VyLmF0dGFjaCgpLnRoZW4oY29ubiA9PiB0aGlzLl93YXRjaFNlc3Npb24oY29ubikpLmNhdGNoKCgpID0+IHsgfSk7XG5cdH1cblxuXHQvKipcblx0ICogV2F0Y2ggYSBDRFAgc2Vzc2lvbiBmb3IgZXhlY3V0aW9uIGNvbnRleHRzLiBXaGVuIGEgZGVmYXVsdCBjb250ZXh0IGFwcGVhcnMsXG5cdCAqIHByb2JlcyBmb3IgdGhlIHByZWxvYWQgdG9rZW4gYW5kIGNvcnJlbGF0ZXMgd2l0aCB0aGUgcGVuZGluZyBXZWJGcmFtZU1haW4uXG5cdCAqXG5cdCAqIENhbGxlZCBmb3IgZXZlcnkgc2Vzc2lvbjogdGhlIG1haW4gcGFnZSBzZXNzaW9uIChzZWVzIHNhbWUtb3JpZ2luIGZyYW1lcylcblx0ICogYW5kIGVhY2ggY3Jvc3Mtb3JpZ2luIHRhcmdldCBzZXNzaW9uIChzZWVzIG9ubHkgaXRzIG93biBmcmFtZSkuXG5cdCAqL1xuXHRwcml2YXRlIF93YXRjaFNlc3Npb24oc2Vzc2lvbjogSUNEUENvbm5lY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXNzaW9uLm9uRXZlbnQoYXN5bmMgZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50Lm1ldGhvZCA9PT0gJ1J1bnRpbWUuZXhlY3V0aW9uQ29udGV4dENyZWF0ZWQnKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSAoZXZlbnQucGFyYW1zIGFzIHtcblx0XHRcdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdFx0XHR1bmlxdWVJZDogc3RyaW5nO1xuXHRcdFx0XHRcdFx0YXV4RGF0YT86IHsgaXNEZWZhdWx0PzogYm9vbGVhbjsgZnJhbWVJZD86IHN0cmluZyB9O1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pLmNvbnRleHQ7XG5cblx0XHRcdFx0aWYgKCFjb250ZXh0Py5hdXhEYXRhPy5pc0RlZmF1bHQgfHwgIWNvbnRleHQuYXV4RGF0YS5mcmFtZUlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZnJhbWVJZCA9IGNvbnRleHQuYXV4RGF0YS5mcmFtZUlkO1xuXHRcdFx0XHRjb25zdCB1bmlxdWVDb250ZXh0SWQgPSBjb250ZXh0LnVuaXF1ZUlkO1xuXG5cdFx0XHRcdC8vIFByb2JlIGZvciB0aGUgcHJlbG9hZCB0b2tlbiBpbiB0aGlzIGNvbnRleHRcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgc2Vzc2lvbi5zZW5kQ29tbWFuZCgnUnVudGltZS5ldmFsdWF0ZScsIHtcblx0XHRcdFx0XHRcdGV4cHJlc3Npb246ICd3aW5kb3cuX192c2NvZGVfaGVscGVycz8uZ2V0RnJhbWVUb2tlbj8uKCknLFxuXHRcdFx0XHRcdFx0cmV0dXJuQnlWYWx1ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdHVuaXF1ZUNvbnRleHRJZCxcblx0XHRcdFx0XHR9KSBhcyB7IHJlc3VsdDogeyB2YWx1ZT86IHN0cmluZyB9IH07XG5cblx0XHRcdFx0XHRjb25zdCB0b2tlbiA9IHJlc3VsdC52YWx1ZTtcblx0XHRcdFx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0cnkubm90aWZ5Q29udGV4dERpc2NvdmVyZWQoc2Vzc2lvbiwgdW5pcXVlQ29udGV4dElkLCBmcmFtZUlkLCB0b2tlbik7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIENvbnRleHQgbWF5IGhhdmUgYmVlbiBkZXN0cm95ZWQgYnkgbm93IFx1MjAxNCBpZ25vcmUuXG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQubWV0aG9kID09PSAnUGFnZS5mcmFtZURldGFjaGVkJykge1xuXHRcdFx0XHRjb25zdCBmcmFtZUlkID0gKGV2ZW50LnBhcmFtcyBhcyB7IGZyYW1lSWQ/OiBzdHJpbmcgfSk/LmZyYW1lSWQ7XG5cdFx0XHRcdGlmIChmcmFtZUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0cnkuZGlzcG9zZUJ5RnJhbWVJZChmcmFtZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChldmVudC5tZXRob2QgPT09ICdSdW50aW1lLmV4ZWN1dGlvbkNvbnRleHRzQ2xlYXJlZCcpIHtcblx0XHRcdFx0Ly8gTmF2aWdhdGlvbiBjbGVhcmVkIGFsbCBjb250ZXh0cyBcdTIwMTQgZGlzcG9zZSBpbnNwZWN0b3JzIG93bmVkIGJ5IHRoaXMgc2Vzc2lvblxuXHRcdFx0XHR0aGlzLl9yZWdpc3RyeS5kaXNwb3NlQnlTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdEV2ZW50Lm9uY2Uoc2Vzc2lvbi5vbkNsb3NlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RyeS5kaXNwb3NlQnlTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRW5hYmxlIFJ1bnRpbWUgKyBQYWdlIHRvIHN0YXJ0IHJlY2VpdmluZyBjb250ZXh0IGFuZCBmcmFtZSBldmVudHNcblx0XHRzZXNzaW9uLnNlbmRDb21tYW5kKCdSdW50aW1lLmVuYWJsZScpLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0c2Vzc2lvbi5zZW5kQ29tbWFuZCgnUGFnZS5lbmFibGUnKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBieSB0aGUgcmVnaXN0cnkgd2hlbiBhIGZyYW1lIGluc3BlY3RvciBpcyBmdWxseSBhZG9wdGVkLlxuXHQgKiBXaXJlcyBpdHMgZXZlbnRzIHRvIHRoaXMgb3JjaGVzdHJhdG9yLlxuXHQgKi9cblx0cHJpdmF0ZSBfb25JbnNwZWN0b3JBZG9wdGVkKGluc3BlY3RvcjogQnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvcik6IHZvaWQge1xuXHRcdGluc3BlY3Rvci5vbkRpZEluc3BlY3RFbGVtZW50KGFzeW5jIG5vZGVEYXRhID0+IHtcblx0XHRcdGlmICghdGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlPy5vcHRpb25zPy5jb250aW51b3VzKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgb2Zmc2V0ID0gYXdhaXQgdGhpcy5fZ2V0RnJhbWVPZmZzZXRJblBhZ2UoaW5zcGVjdG9yLmZyYW1lKTtcblx0XHRcdFx0bm9kZURhdGEgPSB0aGlzLl9vZmZzZXRFbGVtZW50RGF0YShub2RlRGF0YSwgb2Zmc2V0KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBCZXN0IGVmZm9ydC5cblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0RWxlbWVudC5maXJlKG5vZGVEYXRhKTtcblx0XHR9KTtcblx0XHRpbnNwZWN0b3Iub25EaWRSZW1vdmVFbGVtZW50Q29tbWVudChlbGVtZW50SWQgPT4gdGhpcy5fb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudC5maXJlKGVsZW1lbnRJZCkpO1xuXG5cdFx0Ly8gV2hlbiBhIGZyYW1lJ3MgcHJlbG9hZCBzdG9wcyBwaWNraW5nLCBzdG9wIGFsbCBvdGhlciBmcmFtZXMgdG9vXG5cdFx0aW5zcGVjdG9yLm9uRGlkU3RvcFBpY2tpbmcoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHQvLyBJZiBlbGVtZW50IHNlbGVjdGlvbiBpcyBjdXJyZW50bHkgYWN0aXZlLCBzdGFydCBpdCBvbiB0aGUgbmV3IGZyYW1lXG5cdFx0aWYgKHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi52YWx1ZSkge1xuXHRcdFx0dm9pZCB0aGlzLl9xdWV1ZUluc3BlY3Rpb25PcGVyYXRpb24oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVTZWxlY3Rpb24gPSB0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWU7XG5cdFx0XHRcdGlmIChhY3RpdmVTZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRhd2FpdCBpbnNwZWN0b3Iuc3RhcnRJbnNwZWN0aW9uKGFjdGl2ZVNlbGVjdGlvbi5vcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHR9XG5cblx0XHRpbnNwZWN0b3Iuc2V0VGhlbWUodGhpcy5fdGhlbWUpO1xuXHR9XG5cblx0c2V0VGhlbWUodGhlbWU6IElCcm93c2VyVmlld1RoZW1lKTogdm9pZCB7XG5cdFx0dGhpcy5fdGhlbWUgPSB0aGVtZTtcblx0XHQvLyBCcm9hZGNhc3QgdG8gYWxsIGtub3duIGluc3BlY3RvcnNcblx0XHRmb3IgKGNvbnN0IGluc3BlY3RvciBvZiB0aGlzLl9yZWdpc3RyeS5pbnNwZWN0b3JzKSB7XG5cdFx0XHRpbnNwZWN0b3Iuc2V0VGhlbWUodGhlbWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGUgZWxlbWVudCBzZWxlY3Rpb24gbW9kZSBhY3Jvc3MgYWxsIGZyYW1lcy5cblx0ICovXG5cdGFzeW5jIHRvZ2dsZUVsZW1lbnRTZWxlY3Rpb24oZW5hYmxlZD86IGJvb2xlYW4sIG9wdGlvbnM6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5ld0VuYWJsZWQgPSBlbmFibGVkID8/ICF0aGlzLl9lbGVtZW50U2VsZWN0aW9uQWN0aXZlO1xuXHRcdGlmICghbmV3RW5hYmxlZCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEVsZW1lbnQgYW5kIGFyZWEgc2VsZWN0aW9uIGFyZSBtdXR1YWxseSBleGNsdXNpdmUgXHUyMDE0IGVuYWJsaW5nIG9uZVxuXHRcdC8vIGNhbmNlbHMgdGhlIG90aGVyIHNvIGJvdGggcGlja2VycyBuZXZlciBvdmVybGF5IHRoZSBwYWdlIGF0IG9uY2UuXG5cdFx0dGhpcy5fYWN0aXZlQXJlYVNlbGVjdGlvbi5jbGVhcigpO1xuXG5cdFx0Y29uc3QgYWN0aXZlU2VsZWN0aW9uID0gdGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlO1xuXHRcdGNvbnN0IHVwZGF0ZWRPcHRpb25zID0gYWN0aXZlU2VsZWN0aW9uID8geyAuLi5hY3RpdmVTZWxlY3Rpb24ub3B0aW9ucywgLi4ub3B0aW9ucyB9IDogeyBtb2RlOiBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuU2VsZWN0LCAuLi5vcHRpb25zIH07XG5cblx0XHRpZiAoYWN0aXZlU2VsZWN0aW9uKSB7XG5cdFx0XHRhY3RpdmVTZWxlY3Rpb24ub3B0aW9ucyA9IHVwZGF0ZWRPcHRpb25zO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuX3N0YXJ0SW5zcGVjdGlvbihhY3RpdmVTZWxlY3Rpb24sIHVwZGF0ZWRPcHRpb25zKSkge1xuXHRcdFx0XHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25BY3RpdmUgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlLmZpcmUoeyBhY3RpdmU6IHRydWUsIG9wdGlvbnM6IHVwZGF0ZWRPcHRpb25zIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi52YWx1ZSA9PT0gYWN0aXZlU2VsZWN0aW9uICYmIGFjdGl2ZVNlbGVjdGlvbi5vcHRpb25zID09PSB1cGRhdGVkT3B0aW9ucykge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uOiBJQWN0aXZlU2VsZWN0aW9uID0ge1xuXHRcdFx0b3B0aW9uczogdXBkYXRlZE9wdGlvbnMsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWUgPT09IHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25BY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5maXJlKHsgYWN0aXZlOiBmYWxzZSwgb3B0aW9uczogc2VsZWN0aW9uLm9wdGlvbnMgfSk7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLmNsZWFyQW5kTGVhaygpO1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5fcXVldWVJbnNwZWN0aW9uT3BlcmF0aW9uKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLl9yZWdpc3RyeS5pbnNwZWN0b3JzXS5tYXAoaSA9PiBpLnN0b3BJbnNwZWN0aW9uKCkpKTtcblx0XHRcdFx0XHR9KS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWUgPSBzZWxlY3Rpb247XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl9zdGFydEluc3BlY3Rpb24oc2VsZWN0aW9uLCB1cGRhdGVkT3B0aW9ucykpIHtcblx0XHRcdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvbkFjdGl2ZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlLmZpcmUoeyBhY3RpdmU6IHRydWUsIG9wdGlvbnM6IHVwZGF0ZWRPcHRpb25zIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi52YWx1ZSA9PT0gc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5vcHRpb25zID09PSB1cGRhdGVkT3B0aW9ucykge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydEluc3BlY3Rpb24oc2VsZWN0aW9uOiBJQWN0aXZlU2VsZWN0aW9uLCBvcHRpb25zOiBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0YXdhaXQgdGhpcy5fcXVldWVJbnNwZWN0aW9uT3BlcmF0aW9uKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWUgIT09IHNlbGVjdGlvbiB8fCBzZWxlY3Rpb24ub3B0aW9ucyAhPT0gb3B0aW9ucykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy5fcmVnaXN0cnkuaW5zcGVjdG9yc10ubWFwKGkgPT4gaS5zdGFydEluc3BlY3Rpb24ob3B0aW9ucykpKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlID09PSBzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLm9wdGlvbnMgPT09IG9wdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIF9xdWV1ZUluc3BlY3Rpb25PcGVyYXRpb24ob3BlcmF0aW9uOiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5faW5zcGVjdGlvbk9wZXJhdGlvbi50aGVuKG9wZXJhdGlvbik7XG5cdFx0dGhpcy5faW5zcGVjdGlvbk9wZXJhdGlvbiA9IHJlc3VsdC5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRzZXRFbGVtZW50Q29tbWVudHModXBkYXRlOiBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaW5zcGVjdG9yIG9mIHRoaXMuX3JlZ2lzdHJ5Lmluc3BlY3RvcnMpIHtcblx0XHRcdGluc3BlY3Rvci5zZXRFbGVtZW50Q29tbWVudHModXBkYXRlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVG9nZ2xlIGRyYWctdG8tc2VsZWN0IGFyZWEgcGlja2luZyBvbiB0aGUgdG9wIGZyYW1lIG9ubHkuXG5cdCAqIFRoZSBwaWNrZXIgcmVwb3J0cyB0aGUgbGl0ZXJhbCB1c2VyLWRyYXduIHJlY3RhbmdsZSAob3IgYHVuZGVmaW5lZGAgb24gY2FuY2VsbGF0aW9uKVxuXHQgKiB2aWEge0BsaW5rIG9uRGlkUGlja0FyZWF9OyBubyBET00gZWxlbWVudHMgYXJlIGluc3BlY3RlZC5cblx0ICovXG5cdGFzeW5jIHRvZ2dsZUFyZWFTZWxlY3Rpb24oZW5hYmxlZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuZXdFbmFibGVkID0gZW5hYmxlZCA/PyAhdGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZTtcblx0XHRpZiAobmV3RW5hYmxlZCA9PT0gdGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghbmV3RW5hYmxlZCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlQXJlYVNlbGVjdGlvbi5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEVsZW1lbnQgYW5kIGFyZWEgc2VsZWN0aW9uIGFyZSBtdXR1YWxseSBleGNsdXNpdmUgXHUyMDE0IGVuYWJsaW5nIG9uZVxuXHRcdC8vIGNhbmNlbHMgdGhlIG90aGVyIHNvIGJvdGggcGlja2VycyBuZXZlciBvdmVybGF5IHRoZSBwYWdlIGF0IG9uY2UuXG5cdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLmNsZWFyKCk7XG5cblx0XHRjb25zdCBtYWluRnJhbWUgPSB0aGlzLmJyb3dzZXIud2ViQ29udGVudHMubWFpbkZyYW1lO1xuXHRcdGNvbnN0IHN0YXJ0ID0gKCkgPT4geyBtYWluRnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzdGFydEFyZWFQaWNrZXInLCB1bmRlZmluZWQpOyB9O1xuXHRcdGNvbnN0IHN0b3AgPSAoKSA9PiB7IHRyeSB7IG1haW5GcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OnN0b3BBcmVhUGlja2VyJywgdW5kZWZpbmVkKTsgfSBjYXRjaCB7IC8qIGZyYW1lIG1heSBiZSBnb25lICovIH0gfTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbjogSUFjdGl2ZUFyZWFTZWxlY3Rpb24gPSB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdC8vIEV4dGVybmFsIGNhbmNlbGxhdGlvbiAodG9nZ2xlQXJlYVNlbGVjdGlvbihmYWxzZSksIG5hdmlnYXRpb24sIGVsZW1lbnRcblx0XHRcdFx0Ly8gc2VsZWN0aW9uIHRha2VvdmVyKS4gVGhlIElQQy1kcml2ZW4gdGVybWluYXRpb24gcGF0aHMgdXNlIGNsZWFyQW5kTGVha1xuXHRcdFx0XHQvLyBpbnNpZGUgYF9maW5pc2hBcmVhUGlja2AsIHNvIHJlYWNoaW5nIGhlcmUgbWVhbnMgdGhlIHBpY2tlciBpcyBzdGlsbFxuXHRcdFx0XHQvLyBydW5uaW5nIGluIHRoZSBwYWdlIGFuZCB3ZSBuZWVkIHRvIHRlbGwgaXQgdG8gc3RvcC5cblx0XHRcdFx0c3RvcCgpO1xuXHRcdFx0XHR0aGlzLl9maW5pc2hBcmVhUGljayh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fYWN0aXZlQXJlYVNlbGVjdGlvbi52YWx1ZSA9IHNlbGVjdGlvbjtcblxuXHRcdHRyeSB7XG5cdFx0XHRzdGFydCgpO1xuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24udmFsdWUgPT09IHNlbGVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl9hcmVhU2VsZWN0aW9uQWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlLmZpcmUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9hY3RpdmVBcmVhU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRlcm1pbmF0ZSB0aGUgY3VycmVudCBhcmVhLXBpY2sgc2Vzc2lvbiwgZmlyaW5nIGBvbkRpZFBpY2tBcmVhYCBleGFjdGx5IG9uY2UuXG5cdCAqIE5vLW9wIGlmIG5vIHNlc3Npb24gaXMgYWN0aXZlLiBVc2VzIGBjbGVhckFuZExlYWtgIHRvIGF2b2lkIHJlY3Vyc2luZyBpbnRvXG5cdCAqIHRoZSBJQWN0aXZlU2VsZWN0aW9uLmRpc3Bvc2UgcGF0aC5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmlzaEFyZWFQaWNrKHJlY3Q6IElCcm93c2VyVmlld1JlY3QgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2FyZWFTZWxlY3Rpb25BY3RpdmUgJiYgIXRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24udmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd2FzQWN0aXZlID0gdGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZTtcblx0XHR0aGlzLl9hcmVhU2VsZWN0aW9uQWN0aXZlID0gZmFsc2U7XG5cdFx0dGhpcy5fYWN0aXZlQXJlYVNlbGVjdGlvbi5jbGVhckFuZExlYWsoKTtcblx0XHR0aGlzLl9vbkRpZFBpY2tBcmVhLmZpcmUocmVjdCk7XG5cdFx0aWYgKHdhc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlLmZpcmUoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIGEgaGFuZGxlIHRvIGFuIGVsZW1lbnQuIFJvdXRlcyB0byB0aGUgY29ycmVjdCBmcmFtZSBpbnNwZWN0b3IuXG5cdCAqL1xuXHRnZXRFbGVtZW50SGFuZGxlKGlkOiBzdHJpbmcsIGZyYW1lOiBFbGVjdHJvbi5XZWJGcmFtZU1haW4pOiBJRWxlbWVudEhhbmRsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fcmVnaXN0cnkuZ2V0QnlGcmFtZShmcmFtZSk/LmdldEVsZW1lbnRIYW5kbGUoaWQpO1xuXHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgY29tbWVudFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRUb0NoYXQ6ICgpID0+IGhhbmRsZS5hZGRUb0NoYXQoKSxcblx0XHRcdGFkZENvbW1lbnQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKGNvbW1lbnRSZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29tbWVudFJlcXVlc3RlZCA9IHRydWU7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdFx0XHR2b2lkIHRoaXMuX3F1ZXVlSW5zcGVjdGlvbk9wZXJhdGlvbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5mb2N1cygpO1xuXHRcdFx0XHRcdFx0XHRoYW5kbGUuYWRkQ29tbWVudCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LCAwKTtcblx0XHRcdH0sXG5cdFx0XHRoaWdobGlnaHQ6ICgpID0+IGhhbmRsZS5oaWdobGlnaHQoKSxcblx0XHRcdGhpZGVIaWdobGlnaHQ6ICgpID0+IGhhbmRsZS5oaWRlSGlnaGxpZ2h0KCksXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghY29tbWVudFJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0VmlzdWFsVmlld3BvcnRTY2FsZShmcmFtZTogRWxlY3Ryb24uV2ViRnJhbWVNYWluID0gdGhpcy5icm93c2VyLndlYkNvbnRlbnRzLm1haW5GcmFtZSk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdHJ5LmdldEJ5RnJhbWUoZnJhbWUpPy5nZXRWaXN1YWxWaWV3cG9ydFNjYWxlKCkgPz8gMTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSBjdW11bGF0aXZlIG9mZnNldCBvZiBhIGZyYW1lIHJlbGF0aXZlIHRvIHRoZSB0b3AtbGV2ZWwgcGFnZS5cblx0ICogV2Fsa3MgdXAgdGhlIGZyYW1lIGhpZXJhcmNoeSB1c2luZyB0aGUgcGFyZW50J3MgQ0RQIHNlc3Npb24gdG8gcXVlcnkgdGhlXG5cdCAqIGlmcmFtZSBlbGVtZW50J3MgYm94IG1vZGVsIHZpYSBgRE9NLmdldEZyYW1lT3duZXJgICsgYERPTS5nZXRCb3hNb2RlbGAuXG5cdCAqIFdvcmtzIGZvciBib3RoIHNhbWUtb3JpZ2luIGFuZCBjcm9zcy1vcmlnaW4gZnJhbWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0RnJhbWVPZmZzZXRJblBhZ2UoZnJhbWU6IEVsZWN0cm9uLldlYkZyYW1lTWFpbik6IFByb21pc2U8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PiB7XG5cdFx0Y29uc3QgbWFpbkZyYW1lID0gdGhpcy5icm93c2VyLndlYkNvbnRlbnRzLm1haW5GcmFtZTtcblx0XHRsZXQgeCA9IDA7XG5cdFx0bGV0IHkgPSAwO1xuXHRcdGxldCBjdXJyZW50ID0gZnJhbWU7XG5cblx0XHR3aGlsZSAoY3VycmVudCAhPT0gbWFpbkZyYW1lKSB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBjdXJyZW50LnBhcmVudDtcblx0XHRcdGlmICghcGFyZW50KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGlsZEluc3BlY3RvciA9IHRoaXMuX3JlZ2lzdHJ5LmdldEJ5RnJhbWUoY3VycmVudCk7XG5cdFx0XHRjb25zdCBwYXJlbnRJbnNwZWN0b3IgPSB0aGlzLl9yZWdpc3RyeS5nZXRCeUZyYW1lKHBhcmVudCk7XG5cdFx0XHRpZiAoIWNoaWxkSW5zcGVjdG9yIHx8ICFwYXJlbnRJbnNwZWN0b3IpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkRnJhbWVJZCA9IGNoaWxkSW5zcGVjdG9yLmZyYW1lSWQ7XG5cblx0XHRcdFx0Ly8gQXNrIHRoZSBwYXJlbnQgc2Vzc2lvbiBmb3IgdGhlIGlmcmFtZSBlbGVtZW50IHRoYXQgb3ducyB0aGlzIGZyYW1lXG5cdFx0XHRcdGNvbnN0IGZyYW1lT3duZXIgPSBhd2FpdCBwYXJlbnRJbnNwZWN0b3IuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmdldEZyYW1lT3duZXInLCB7XG5cdFx0XHRcdFx0ZnJhbWVJZDogY2hpbGRGcmFtZUlkLFxuXHRcdFx0XHR9KSBhcyB7IGJhY2tlbmROb2RlSWQ6IG51bWJlciB9O1xuXG5cdFx0XHRcdC8vIEdldCB0aGUgaWZyYW1lIGVsZW1lbnQncyBib3ggbW9kZWwgaW4gdGhlIHBhcmVudCdzIGNvb3JkaW5hdGUgc3BhY2Vcblx0XHRcdFx0Y29uc3QgYm94TW9kZWwgPSBhd2FpdCBwYXJlbnRJbnNwZWN0b3IuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmdldEJveE1vZGVsJywge1xuXHRcdFx0XHRcdGJhY2tlbmROb2RlSWQ6IGZyYW1lT3duZXIuYmFja2VuZE5vZGVJZCxcblx0XHRcdFx0fSkgYXMgeyBtb2RlbDogeyBjb250ZW50OiBudW1iZXJbXSB9IH07XG5cblx0XHRcdFx0Ly8gY29udGVudCBxdWFkOiBbeDEseTEsIHgyLHkyLCB4Myx5MywgeDQseTRdIFx1MjAxNCB0b3AtbGVmdCBpcyBmaXJzdCBwYWlyXG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBib3hNb2RlbC5tb2RlbC5jb250ZW50O1xuXHRcdFx0XHR4ICs9IGNvbnRlbnRbMF07XG5cdFx0XHRcdHkgKz0gY29udGVudFsxXTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y3VycmVudCA9IHBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB4LCB5IH07XG5cdH1cblxuXHQvKipcblx0ICogT2Zmc2V0IGVsZW1lbnQgZGF0YSBib3VuZHMgYnkgYSBmcmFtZSBvZmZzZXQuXG5cdCAqL1xuXHRwcml2YXRlIF9vZmZzZXRFbGVtZW50RGF0YShkYXRhOiBJRWxlbWVudERhdGEsIG9mZnNldDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogSUVsZW1lbnREYXRhIHtcblx0XHRpZiAob2Zmc2V0LnggPT09IDAgJiYgb2Zmc2V0LnkgPT09IDApIHtcblx0XHRcdHJldHVybiBkYXRhO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uZGF0YSxcblx0XHRcdGJvdW5kczoge1xuXHRcdFx0XHR4OiBkYXRhLmJvdW5kcy54ICsgb2Zmc2V0LngsXG5cdFx0XHRcdHk6IGRhdGEuYm91bmRzLnkgKyBvZmZzZXQueSxcblx0XHRcdFx0d2lkdGg6IGRhdGEuYm91bmRzLndpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IGRhdGEuYm91bmRzLmhlaWdodCxcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cblxuaW50ZXJmYWNlIElQZW5kaW5nQ29udGV4dCB7XG5cdHJlYWRvbmx5IHNlc3Npb246IElDRFBDb25uZWN0aW9uO1xuXHRyZWFkb25seSB1bmlxdWVDb250ZXh0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZnJhbWVJZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRyYWNrcyB0aGUgdHdvLXNpZGVkIGNvcnJlbGF0aW9uIGJldHdlZW4gcHJlbG9hZCB0b2tlbnMgKGZyb20gV2ViRnJhbWVNYWluIElQQylcbiAqIGFuZCBDRFAgZXhlY3V0aW9uIGNvbnRleHRzLCBhbmQgaW5kZXhlcyBhZG9wdGVkIGluc3BlY3RvcnMgZm9yIE8oMSkgbG9va3VwIGJ5XG4gKiBmcmFtZSwgZnJhbWVJZCwgb3Igb3duaW5nIHNlc3Npb24uXG4gKi9cbmNsYXNzIEZyYW1lSW5zcGVjdG9yUmVnaXN0cnkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkb3B0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRvcHQ6IEV2ZW50PEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3I+ID0gdGhpcy5fb25EaWRBZG9wdC5ldmVudDtcblxuXHQvKiogUGVuZGluZyBoYWx2ZXMgd2FpdGluZyBmb3IgdGhlaXIgY291bnRlcnBhcnQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdGcmFtZXMgPSBuZXcgTWFwPHN0cmluZywgRWxlY3Ryb24uV2ViRnJhbWVNYWluPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSVBlbmRpbmdDb250ZXh0PigpO1xuXG5cdC8qKiBBZG9wdGVkIGluc3BlY3RvcnMgaW5kZXhlZCBtdWx0aXBsZSB3YXlzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGwgPSBuZXcgU2V0PEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3I+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J5RnJhbWUgPSBuZXcgV2Vha01hcDxFbGVjdHJvbi5XZWJGcmFtZU1haW4sIEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3I+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J5RnJhbWVJZCA9IG5ldyBNYXA8c3RyaW5nLCBCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ieVNlc3Npb24gPSBuZXcgTWFwPElDRFBDb25uZWN0aW9uLCBTZXQ8QnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvcj4+KCk7XG5cblx0Z2V0IGluc3BlY3RvcnMoKTogSXRlcmFibGU8QnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvcj4geyByZXR1cm4gdGhpcy5fYWxsOyB9XG5cblx0Z2V0QnlGcmFtZShmcmFtZTogRWxlY3Ryb24uV2ViRnJhbWVNYWluKTogQnJvd3NlclZpZXdGcmFtZUluc3BlY3RvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2J5RnJhbWUuZ2V0KGZyYW1lKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiBhIHByZWxvYWQgc2NyaXB0IHNpZ25hbHMgcmVhZGluZXNzIHdpdGggYSB0b2tlbi5cblx0ICogSWYgYSBtYXRjaGluZyBDRFAgY29udGV4dCB3YXMgYWxyZWFkeSBkaXNjb3ZlcmVkLCBhZG9wdHMgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRub3RpZnlGcmFtZVJlYWR5KGZyYW1lOiBFbGVjdHJvbi5XZWJGcmFtZU1haW4sIHRva2VuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1Nlc3Npb25zLmdldCh0b2tlbik7XG5cdFx0aWYgKHBlbmRpbmcpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9ucy5kZWxldGUodG9rZW4pO1xuXHRcdFx0dGhpcy5fYWRvcHQocGVuZGluZy5zZXNzaW9uLCBwZW5kaW5nLnVuaXF1ZUNvbnRleHRJZCwgcGVuZGluZy5mcmFtZUlkLCBmcmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdGcmFtZXMuc2V0KHRva2VuLCBmcmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIGEgQ0RQIGV4ZWN1dGlvbiBjb250ZXh0IGlzIGRpc2NvdmVyZWQgYW5kIGl0cyBwcmVsb2FkIHRva2VuIHByb2JlZC5cblx0ICogSWYgYSBtYXRjaGluZyBXZWJGcmFtZU1haW4gd2FzIGFscmVhZHkgcmVnaXN0ZXJlZCwgYWRvcHRzIGltbWVkaWF0ZWx5LlxuXHQgKi9cblx0bm90aWZ5Q29udGV4dERpc2NvdmVyZWQoc2Vzc2lvbjogSUNEUENvbm5lY3Rpb24sIHVuaXF1ZUNvbnRleHRJZDogc3RyaW5nLCBmcmFtZUlkOiBzdHJpbmcsIHRva2VuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBmcmFtZSA9IHRoaXMuX3BlbmRpbmdGcmFtZXMuZ2V0KHRva2VuKTtcblx0XHRpZiAoZnJhbWUpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdGcmFtZXMuZGVsZXRlKHRva2VuKTtcblx0XHRcdHRoaXMuX2Fkb3B0KHNlc3Npb24sIHVuaXF1ZUNvbnRleHRJZCwgZnJhbWVJZCwgZnJhbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvbnMuc2V0KHRva2VuLCB7IHNlc3Npb24sIHVuaXF1ZUNvbnRleHRJZCwgZnJhbWVJZCB9KTtcblx0XHR9XG5cdH1cblxuXHQvKiogRGlzcG9zZSB0aGUgaW5zcGVjdG9yIG93bmluZyB0aGUgZ2l2ZW4gQ0RQIGZyYW1lSWQsIGlmIGFueS4gQWxzbyBjbGVhbnMgcGVuZGluZyBlbnRyaWVzLiAqL1xuXHRkaXNwb3NlQnlGcmFtZUlkKGZyYW1lSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2J5RnJhbWVJZC5nZXQoZnJhbWVJZCk/LmRpc3Bvc2UoKTtcblx0XHQvLyBSZW1vdmUgcGVuZGluZyBzZXNzaW9uIGVudHJpZXMgd2hvc2UgZnJhbWVJZCBtYXRjaGVzIHRoZSBkZXRhY2hlZCBmcmFtZVxuXHRcdGZvciAoY29uc3QgW3Rva2VuLCBwZW5kaW5nXSBvZiB0aGlzLl9wZW5kaW5nU2Vzc2lvbnMpIHtcblx0XHRcdGlmIChwZW5kaW5nLmZyYW1lSWQgPT09IGZyYW1lSWQpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25zLmRlbGV0ZSh0b2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFJlbW92ZSBhbnkgcGVuZGluZyBmcmFtZSBlbnRyaWVzIHdob3NlIGZyYW1lIGlzIG5vdyBkZXRhY2hlZC9kZXN0cm95ZWRcblx0XHRmb3IgKGNvbnN0IFt0b2tlbiwgZnJhbWVdIG9mIHRoaXMuX3BlbmRpbmdGcmFtZXMpIHtcblx0XHRcdGlmIChmcmFtZS5kZXRhY2hlZCB8fCBmcmFtZS5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdGcmFtZXMuZGVsZXRlKHRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogRGlzcG9zZSBhbGwgaW5zcGVjdG9ycyB3aG9zZSBjb25uZWN0aW9uIGlzIHRoZSBnaXZlbiBzZXNzaW9uIGFuZCBjbGVhciByZWxhdGVkIHBlbmRpbmcgc3RhdGUuICovXG5cdGRpc3Bvc2VCeVNlc3Npb24oc2Vzc2lvbjogSUNEUENvbm5lY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzZXQgPSB0aGlzLl9ieVNlc3Npb24uZ2V0KHNlc3Npb24pO1xuXHRcdGlmIChzZXQpIHtcblx0XHRcdGZvciAoY29uc3QgaW5zcGVjdG9yIG9mIFsuLi5zZXRdKSB7XG5cdFx0XHRcdGluc3BlY3Rvci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW3Rva2VuLCBwZW5kaW5nXSBvZiB0aGlzLl9wZW5kaW5nU2Vzc2lvbnMpIHtcblx0XHRcdGlmIChwZW5kaW5nLnNlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25zLmRlbGV0ZSh0b2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRvcHQoXG5cdFx0c2Vzc2lvbjogSUNEUENvbm5lY3Rpb24sXG5cdFx0dW5pcXVlQ29udGV4dElkOiBzdHJpbmcsXG5cdFx0ZnJhbWVJZDogc3RyaW5nLFxuXHRcdGZyYW1lOiBFbGVjdHJvbi5XZWJGcmFtZU1haW4sXG5cdCk6IHZvaWQge1xuXHRcdC8vIEd1YXJkOiBmcmFtZSBtYXkgaGF2ZSBiZWVuIGRlc3Ryb3llZCBiZXR3ZWVuIElQQyBhbmQgY29udGV4dCBtYXRjaFxuXHRcdGlmIChmcmFtZS5kZXRhY2hlZCB8fCBmcmFtZS5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zcGVjdG9yID0gbmV3IEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3Ioc2Vzc2lvbiwgZnJhbWUsIHVuaXF1ZUNvbnRleHRJZCwgZnJhbWVJZCk7XG5cblx0XHR0aGlzLl9hbGwuYWRkKGluc3BlY3Rvcik7XG5cdFx0dGhpcy5fYnlGcmFtZS5zZXQoZnJhbWUsIGluc3BlY3Rvcik7XG5cdFx0dGhpcy5fYnlGcmFtZUlkLnNldChmcmFtZUlkLCBpbnNwZWN0b3IpO1xuXG5cdFx0bGV0IHNlc3Npb25TZXQgPSB0aGlzLl9ieVNlc3Npb24uZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghc2Vzc2lvblNldCkge1xuXHRcdFx0c2Vzc2lvblNldCA9IG5ldyBTZXQoKTtcblx0XHRcdHRoaXMuX2J5U2Vzc2lvbi5zZXQoc2Vzc2lvbiwgc2Vzc2lvblNldCk7XG5cdFx0fVxuXHRcdHNlc3Npb25TZXQuYWRkKGluc3BlY3Rvcik7XG5cblx0XHRpbnNwZWN0b3Iub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hbGwuZGVsZXRlKGluc3BlY3Rvcik7XG5cdFx0XHR0aGlzLl9ieUZyYW1lLmRlbGV0ZShmcmFtZSk7XG5cdFx0XHR0aGlzLl9ieUZyYW1lSWQuZGVsZXRlKGZyYW1lSWQpO1xuXHRcdFx0Y29uc3QgcyA9IHRoaXMuX2J5U2Vzc2lvbi5nZXQoc2Vzc2lvbik7XG5cdFx0XHRpZiAocykge1xuXHRcdFx0XHRzLmRlbGV0ZShpbnNwZWN0b3IpO1xuXHRcdFx0XHRpZiAocy5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fYnlTZXNzaW9uLmRlbGV0ZShzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fb25EaWRBZG9wdC5maXJlKGluc3BlY3Rvcik7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaW5zcGVjdG9yIG9mIFsuLi50aGlzLl9hbGxdKSB7XG5cdFx0XHRpbnNwZWN0b3IuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nRnJhbWVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25zLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLG1DQUEwTjtBQUduTyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdCQUFnQjtBQUV6QixNQUFNLG1CQUF3RDtBQUFBLEVBQzdELFlBQVksU0FBUywwQkFBMEIsYUFBYTtBQUFBLEVBQzVELHVCQUF1QixTQUFTLHFDQUFxQyxlQUFlO0FBQUEsRUFDcEYsMEJBQTBCLFNBQVMsd0NBQXdDLDZCQUE2QjtBQUFBLEVBQ3hHLGdCQUFnQixTQUFTLDhCQUE4QixxQkFBcUI7QUFBQSxFQUM1RSx3QkFBd0IsU0FBUyxzQ0FBc0MsMEJBQTBCO0FBQUEsRUFDakcscUJBQXFCLFNBQVMsbUNBQW1DLDJCQUEyQjtBQUFBLEVBQzVGLGVBQWUsU0FBUyw2QkFBNkIsZ0JBQWdCO0FBQUEsRUFDckUsc0JBQXNCLFNBQVMsb0NBQW9DLHdCQUF3QjtBQUM1RjtBQW9CTyxJQUFXLDhCQUFYLGtCQUFXQSxpQ0FBWDtBQUVOLEVBQUFBLDZCQUFBLFlBQVM7QUFFVCxFQUFBQSw2QkFBQSx1QkFBb0I7QUFKSCxTQUFBQTtBQUFBLEdBQUE7QUFtQlgsTUFBTSw2QkFBNkIsV0FBVztBQUFBLEVBMkNwRCxZQUE2QixTQUFzQjtBQUNsRCxVQUFNO0FBRHNCO0FBekM3QixTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElB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
