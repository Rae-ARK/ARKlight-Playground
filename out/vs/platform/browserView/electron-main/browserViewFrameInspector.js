var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { BrowserElementSelectionMode } from "../common/browserView.js";
import { collapseToShorthands, formatMatchedStyles, keyComputedProperties } from "../common/cssHelpers.js";
const inspectHighlightConfig = {
  showInfo: true,
  showRulers: false,
  showStyles: true,
  showAccessibilityInfo: true,
  showExtensionLines: false,
  contrastAlgorithm: "aa",
  contentColor: { r: 173, g: 216, b: 255, a: 0.8 },
  paddingColor: { r: 150, g: 200, b: 255, a: 0.5 },
  borderColor: { r: 120, g: 180, b: 255, a: 0.7 },
  marginColor: { r: 200, g: 220, b: 255, a: 0.4 },
  eventTargetColor: { r: 130, g: 160, b: 255, a: 0.8 },
  shapeColor: { r: 130, g: 160, b: 255, a: 0.8 },
  shapeMarginColor: { r: 130, g: 160, b: 255, a: 0.5 },
  gridHighlightConfig: {
    rowGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
    rowHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
    columnGapColor: { r: 140, g: 190, b: 255, a: 0.3 },
    columnHatchColor: { r: 140, g: 190, b: 255, a: 0.7 },
    rowLineColor: { r: 120, g: 180, b: 255 },
    columnLineColor: { r: 120, g: 180, b: 255 },
    rowLineDash: true,
    columnLineDash: true
  },
  flexContainerHighlightConfig: {
    containerBorder: { color: { r: 120, g: 180, b: 255 }, pattern: "solid" },
    itemSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: "solid" },
    lineSeparator: { color: { r: 140, g: 190, b: 255 }, pattern: "solid" },
    mainDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
    crossDistributedSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
    rowGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } },
    columnGapSpace: { hatchColor: { r: 140, g: 190, b: 255, a: 0.7 }, fillColor: { r: 140, g: 190, b: 255, a: 0.4 } }
  },
  flexItemHighlightConfig: {
    baseSizeBox: { hatchColor: { r: 130, g: 170, b: 255, a: 0.6 } },
    baseSizeBorder: { color: { r: 120, g: 180, b: 255 }, pattern: "solid" },
    flexibilityArrow: { color: { r: 130, g: 190, b: 255 } }
  }
};
function useScopedDisposal() {
  const store = new DisposableStore();
  store[Symbol.dispose] = () => store.dispose();
  return store;
}
class BrowserViewFrameInspector extends Disposable {
  /**
   * @param connection The CDP session that owns this frame's target.
   * @param frame The Electron WebFrameMain for this frame.
   * @param _uniqueContextId The unique execution context ID for Runtime calls in this frame.
   * @param _frameId The CDP frame ID for this frame.
   */
  constructor(connection, frame, _uniqueContextId, _frameId) {
    super();
    this.connection = connection;
    this.frame = frame;
    this._uniqueContextId = _uniqueContextId;
    this._frameId = _frameId;
    this._isDisposed = false;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidInspectElement = this._register(new Emitter());
    this.onDidInspectElement = this._onDidInspectElement.event;
    this._onDidRemoveElementComment = this._register(new Emitter());
    this.onDidRemoveElementComment = this._onDidRemoveElementComment.event;
    this._onDidStopPicking = this._register(new Emitter());
    this.onDidStopPicking = this._onDidStopPicking.event;
    this._isPaused = false;
    this._activeInspection = this._register(new MutableDisposable());
    this._register(connection.onClose(() => {
      this.dispose();
    }));
    this._register(connection.onEvent(async (event) => {
      switch (event.method) {
        case "Overlay.inspectNodeRequested": {
          const params = event.params;
          if (params?.backendNodeId && this.isInspecting) {
            try {
              const { node } = await this.connection.sendCommand("DOM.describeNode", {
                backendNodeId: params.backendNodeId
              });
              if (node.frameId && node.frameId !== this._frameId) {
                break;
              }
              const nodeData = await this.extractNodeData({ backendNodeId: params.backendNodeId });
              this._onDidInspectElement.fire(nodeData);
            } catch {
            }
          }
          break;
        }
        case "Debugger.paused":
          this._isPaused = true;
          break;
        case "Debugger.resumed":
          this._isPaused = false;
          break;
      }
    }));
    const onPicked = async (event, result) => {
      if (!result?.elementId || event.senderFrame !== this.frame) {
        return;
      }
      try {
        const nodeData = await this.extractNodeDataById(result.elementId);
        this._onDidInspectElement.fire({ ...nodeData, elementId: result.elementId, comment: result.comment });
      } catch {
        this._updateElementComments({ pendingCommentIdsToDiscard: [result.elementId] });
      }
    };
    frame.ipc.on("vscode:browserView:elementPicked", onPicked);
    this._register({ dispose: () => frame.ipc.removeListener("vscode:browserView:elementPicked", onPicked) });
    const onCommentRemoved = (event, elementId) => {
      if (elementId && event.senderFrame === this.frame) {
        this._onDidRemoveElementComment.fire(elementId);
      }
    };
    frame.ipc.on("vscode:browserView:elementCommentRemoved", onCommentRemoved);
    this._register({ dispose: () => frame.ipc.removeListener("vscode:browserView:elementCommentRemoved", onCommentRemoved) });
    const onPickStopped = (event) => {
      if (event.senderFrame !== this.frame) {
        return;
      }
      this._onDidStopPicking.fire();
    };
    frame.ipc.on("vscode:browserView:elementPickStopped", onPickStopped);
    this._register({ dispose: () => frame.ipc.removeListener("vscode:browserView:elementPickStopped", onPickStopped) });
    this._enableDomains().catch(() => {
    });
  }
  /** Whether this frame's JavaScript execution is currently paused by the debugger. */
  get isPaused() {
    return this._isPaused;
  }
  /** Whether element inspection is currently active on this frame. */
  get isInspecting() {
    return !!this._activeInspection.value;
  }
  /** The CDP frame ID for this frame. */
  get frameId() {
    return this._frameId;
  }
  async _enableDomains() {
    await this.connection.sendCommand("DOM.enable");
    await this.connection.sendCommand("Overlay.enable");
    await this.connection.sendCommand("CSS.enable");
    await this.connection.sendCommand("Runtime.enable");
    await this.connection.sendCommand("Page.enable");
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._onWillDispose.fire();
    super.dispose();
  }
  /**
   * Send the theme to this frame's preload.
   */
  setTheme(theme) {
    this.frame.postMessage("vscode:browserView:setTheme", theme);
  }
  /**
   * Start element inspection on this frame.
   * Uses CDP inspect mode if paused, otherwise the preload picker.
   * Stores a disposable so stop always tears down the correct mode.
   */
  async startInspection(options) {
    const mode = this._isPaused && options.mode !== BrowserElementSelectionMode.Comment ? "cdp" : "preload";
    if (this._activeInspection.value?.mode === mode) {
      if (mode === "preload") {
        this.frame.postMessage("vscode:browserView:startElementPicker", options);
      }
      return;
    }
    await this._stopInspection();
    if (mode === "cdp") {
      await this.connection.sendCommand("Overlay.setInspectMode", {
        mode: "searchForNode",
        highlightConfig: inspectHighlightConfig
      });
      const stop = async () => {
        if (this.frame.isDestroyed()) {
          return;
        }
        try {
          await this.connection.sendCommand("Overlay.setInspectMode", {
            mode: "none",
            highlightConfig: { showInfo: false, showStyles: false }
          });
          await this.connection.sendCommand("Overlay.hideHighlight");
        } catch {
        }
      };
      this._activeInspection.value = {
        mode,
        stop,
        dispose: () => {
          void stop();
        }
      };
    } else {
      this.frame.postMessage("vscode:browserView:startElementPicker", options);
      const stop = async () => {
        if (!this.frame.isDestroyed()) {
          this.frame.postMessage("vscode:browserView:stopElementPicker", {});
        }
      };
      this._activeInspection.value = {
        mode,
        stop,
        dispose: () => {
          void stop();
        }
      };
    }
  }
  async _stopInspection() {
    const activeInspection = this._activeInspection.value;
    if (activeInspection) {
      this._activeInspection.clearAndLeak();
      await activeInspection.stop();
    }
  }
  /**
   * Stop element inspection on this frame.
   */
  async stopInspection() {
    await this._stopInspection();
  }
  setElementComments(update) {
    this._updateElementComments(update);
  }
  _updateElementComments(update) {
    if (!this.frame.isDestroyed()) {
      this.frame.postMessage("vscode:browserView:setElementComments", update);
    }
  }
  /**
   * Resolve an element by its preload-tracked id and extract full node data.
   */
  async extractNodeDataById(elementId) {
    const { result } = await this.connection.sendCommand("Runtime.evaluate", {
      expression: `window.__vscode_helpers?.getElement(${JSON.stringify(elementId)})`,
      returnByValue: false,
      uniqueContextId: this._uniqueContextId
    });
    if (!result?.objectId) {
      throw new Error(`Element not found: ${elementId}`);
    }
    return this.extractNodeData({ objectId: result.objectId });
  }
  /**
   * Extract full element data from a CDP node reference.
   */
  async extractNodeData(id) {
    const data = await extractNodeData(this.connection, id);
    return { ...data, url: this.frame.url };
  }
  /**
   * Get the visual viewport scale for this frame.
   */
  async getVisualViewportScale() {
    try {
      const result = await this.connection.sendCommand("Page.getLayoutMetrics");
      if (typeof result.cssVisualViewport?.scale === "number") {
        const scale = Number(result.cssVisualViewport.scale);
        if (Number.isFinite(scale) && scale > 0) {
          return scale;
        }
      }
    } catch {
    }
    return 1;
  }
  /**
   * Create a handle to an element tracked by the preload script.
   */
  getElementHandle(elementId) {
    let disposed = false;
    return {
      addToChat: async () => {
        const nodeData = await this.extractNodeDataById(elementId);
        this._onDidInspectElement.fire(nodeData);
      },
      addComment: () => {
        this.frame.postMessage("vscode:browserView:showElementComment", { elementId });
      },
      highlight: async () => {
        this.frame.postMessage("vscode:browserView:highlightElement", { elementId });
      },
      hideHighlight: async () => {
        this.frame.postMessage("vscode:browserView:hideHighlight", {});
      },
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        this.frame.postMessage("vscode:browserView:hideHighlight", {});
      }
    };
  }
}
async function extractNodeData(connection, id) {
  var _stack = [];
  try {
    const store = __using(_stack, useScopedDisposal());
    const discoveredNodesByNodeId = {};
    store.add(connection.onEvent((event) => {
      if (event.method === "DOM.setChildNodes") {
        const { nodes } = event.params;
        for (const node2 of nodes) {
          discoveredNodesByNodeId[node2.nodeId] = node2;
          if (node2.children) {
            for (const child of node2.children) {
              discoveredNodesByNodeId[child.nodeId] = {
                ...child,
                parentId: node2.nodeId
              };
            }
          }
          if (node2.pseudoElements) {
            for (const pseudo of node2.pseudoElements) {
              discoveredNodesByNodeId[pseudo.nodeId] = {
                ...pseudo,
                parentId: node2.nodeId
              };
            }
          }
        }
      }
    }));
    await connection.sendCommand("DOM.getDocument");
    const { node } = await connection.sendCommand("DOM.describeNode", id);
    if (!node) {
      throw new Error("Failed to describe node.");
    }
    let nodeId = node.nodeId;
    if (!nodeId) {
      const { nodeIds } = await connection.sendCommand("DOM.pushNodesByBackendIdsToFrontend", { backendNodeIds: [node.backendNodeId] });
      if (!nodeIds?.length) {
        throw new Error("Failed to get node ID.");
      }
      nodeId = nodeIds[0];
    }
    const { model } = await connection.sendCommand("DOM.getBoxModel", { nodeId });
    if (!model) {
      throw new Error("Failed to get box model.");
    }
    const content = model.content;
    const margin = model.margin;
    const x = Math.min(margin[0], content[0]);
    const y = Math.min(margin[1], content[1]);
    const width = Math.max(margin[2] - margin[0], content[2] - content[0]);
    const height = Math.max(margin[5] - margin[1], content[5] - content[1]);
    const matched = await connection.sendCommand("CSS.getMatchedStylesForNode", { nodeId });
    if (!matched) {
      throw new Error("Failed to get matched css.");
    }
    const { rulesText, referencedVars, authorPropertyNames, userAgentPropertyNames } = formatMatchedStyles(matched);
    const { outerHTML } = await connection.sendCommand("DOM.getOuterHTML", { nodeId });
    if (!outerHTML) {
      throw new Error("Failed to get outerHTML.");
    }
    const attributes = attributeArrayToRecord(node.attributes);
    const ancestors = [];
    let currentNode = discoveredNodesByNodeId[nodeId] ?? node;
    while (currentNode) {
      const attributes2 = attributeArrayToRecord(currentNode.attributes);
      ancestors.unshift({
        tagName: currentNode.localName,
        id: attributes2.id,
        classNames: attributes2.class?.trim().split(/\s+/).filter(Boolean)
      });
      currentNode = currentNode.parentId ? discoveredNodesByNodeId[currentNode.parentId] : void 0;
    }
    let computedStyle = rulesText;
    let computedStyles;
    try {
      const { computedStyle: computedStyleArray } = await connection.sendCommand("CSS.getComputedStyleForNode", { nodeId });
      if (computedStyleArray) {
        computedStyles = {};
        const resolvedMap = /* @__PURE__ */ new Map();
        const varLines = [];
        for (const prop of computedStyleArray) {
          if (!prop.name || typeof prop.value !== "string") {
            continue;
          }
          if (referencedVars.has(prop.name) || keyComputedProperties.has(prop.name)) {
            computedStyles[prop.name] = prop.value;
          }
          if (authorPropertyNames.has(prop.name)) {
            resolvedMap.set(prop.name, prop.value);
          } else if (userAgentPropertyNames.has(prop.name)) {
            resolvedMap.set(prop.name, `${prop.value} /*UA*/`);
          }
          if (referencedVars.has(prop.name)) {
            varLines.push(`${prop.name}: ${prop.value};`);
          }
        }
        if (resolvedMap.size > 0) {
          const resolvedLines = collapseToShorthands(resolvedMap);
          computedStyle += "\n\n/* Resolved values */\n" + resolvedLines.join("\n");
        }
        if (varLines.length > 0) {
          computedStyle += "\n\n/* CSS variables */\n" + varLines.join("\n");
        }
      }
    } catch {
    }
    return {
      outerHTML,
      computedStyle,
      bounds: { x, y, width, height },
      ancestors,
      attributes,
      computedStyles,
      dimensions: { top: y, left: x, width, height }
    };
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
function attributeArrayToRecord(attributes) {
  const record = {};
  for (let i = 0; i < attributes.length; i += 2) {
    const name = attributes[i];
    const value = attributes[i + 1];
    record[name] = value;
  }
  return record;
}
export {
  BrowserViewFrameInspector,
  extractNodeData,
  inspectHighlightConfig
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLCBJRWxlbWVudERhdGEsIElFbGVtZW50QW5jZXN0b3IsIElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlLCBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zLCBJQnJvd3NlclZpZXdUaGVtZSB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBjb2xsYXBzZVRvU2hvcnRoYW5kcywgZm9ybWF0TWF0Y2hlZFN0eWxlcywga2V5Q29tcHV0ZWRQcm9wZXJ0aWVzLCB0eXBlIElNYXRjaGVkU3R5bGVzIH0gZnJvbSAnLi4vY29tbW9uL2Nzc0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgSUNEUENvbm5lY3Rpb24gfSBmcm9tICcuLi9jb21tb24vY2RwL3R5cGVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRnJhbWVFbGVtZW50SGFuZGxlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRhZGRUb0NoYXQoKTogUHJvbWlzZTx2b2lkPjtcblx0YWRkQ29tbWVudCgpOiB2b2lkO1xuXHRoaWdobGlnaHQoKTogUHJvbWlzZTx2b2lkPjtcblx0aGlkZUhpZ2hsaWdodCgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG50eXBlIFF1YWQgPSBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXG5pbnRlcmZhY2UgSUJveE1vZGVsIHtcblx0Y29udGVudDogUXVhZDtcblx0cGFkZGluZzogUXVhZDtcblx0Ym9yZGVyOiBRdWFkO1xuXHRtYXJnaW46IFF1YWQ7XG5cdHdpZHRoOiBudW1iZXI7XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSU5vZGUge1xuXHRub2RlSWQ6IG51bWJlcjtcblx0YmFja2VuZE5vZGVJZDogbnVtYmVyO1xuXHRwYXJlbnRJZD86IG51bWJlcjtcblx0bG9jYWxOYW1lOiBzdHJpbmc7XG5cdGF0dHJpYnV0ZXM6IHN0cmluZ1tdO1xuXHRjaGlsZHJlbj86IElOb2RlW107XG5cdHBzZXVkb0VsZW1lbnRzPzogSU5vZGVbXTtcbn1cblxuaW50ZXJmYWNlIElMYXlvdXRNZXRyaWNzUmVzdWx0IHtcblx0Y3NzVmlzdWFsVmlld3BvcnQ/OiB7XG5cdFx0c2NhbGU/OiBudW1iZXI7XG5cdH07XG59XG5cbmludGVyZmFjZSBJQWN0aXZlSW5zcGVjdGlvbiBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgbW9kZTogJ2NkcCcgfCAncHJlbG9hZCc7XG5cdHN0b3AoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuLyoqIFNsaWdodGx5IGN1c3RvbWlzZWQgQ0RQIGRlYnVnZ2VyIGluc3BlY3QgaGlnaGxpZ2h0IGNvbG91cnMuICovXG5leHBvcnQgY29uc3QgaW5zcGVjdEhpZ2hsaWdodENvbmZpZyA9IHtcblx0c2hvd0luZm86IHRydWUsXG5cdHNob3dSdWxlcnM6IGZhbHNlLFxuXHRzaG93U3R5bGVzOiB0cnVlLFxuXHRzaG93QWNjZXNzaWJpbGl0eUluZm86IHRydWUsXG5cdHNob3dFeHRlbnNpb25MaW5lczogZmFsc2UsXG5cdGNvbnRyYXN0QWxnb3JpdGhtOiAnYWEnLFxuXHRjb250ZW50Q29sb3I6IHsgcjogMTczLCBnOiAyMTYsIGI6IDI1NSwgYTogMC44IH0sXG5cdHBhZGRpbmdDb2xvcjogeyByOiAxNTAsIGc6IDIwMCwgYjogMjU1LCBhOiAwLjUgfSxcblx0Ym9yZGVyQ29sb3I6IHsgcjogMTIwLCBnOiAxODAsIGI6IDI1NSwgYTogMC43IH0sXG5cdG1hcmdpbkNvbG9yOiB7IHI6IDIwMCwgZzogMjIwLCBiOiAyNTUsIGE6IDAuNCB9LFxuXHRldmVudFRhcmdldENvbG9yOiB7IHI6IDEzMCwgZzogMTYwLCBiOiAyNTUsIGE6IDAuOCB9LFxuXHRzaGFwZUNvbG9yOiB7IHI6IDEzMCwgZzogMTYwLCBiOiAyNTUsIGE6IDAuOCB9LFxuXHRzaGFwZU1hcmdpbkNvbG9yOiB7IHI6IDEzMCwgZzogMTYwLCBiOiAyNTUsIGE6IDAuNSB9LFxuXHRncmlkSGlnaGxpZ2h0Q29uZmlnOiB7XG5cdFx0cm93R2FwQ29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSwgYTogMC4zIH0sXG5cdFx0cm93SGF0Y2hDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjcgfSxcblx0XHRjb2x1bW5HYXBDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjMgfSxcblx0XHRjb2x1bW5IYXRjaENvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUsIGE6IDAuNyB9LFxuXHRcdHJvd0xpbmVDb2xvcjogeyByOiAxMjAsIGc6IDE4MCwgYjogMjU1IH0sXG5cdFx0Y29sdW1uTGluZUNvbG9yOiB7IHI6IDEyMCwgZzogMTgwLCBiOiAyNTUgfSxcblx0XHRyb3dMaW5lRGFzaDogdHJ1ZSxcblx0XHRjb2x1bW5MaW5lRGFzaDogdHJ1ZVxuXHR9LFxuXHRmbGV4Q29udGFpbmVySGlnaGxpZ2h0Q29uZmlnOiB7XG5cdFx0Y29udGFpbmVyQm9yZGVyOiB7IGNvbG9yOiB7IHI6IDEyMCwgZzogMTgwLCBiOiAyNTUgfSwgcGF0dGVybjogJ3NvbGlkJyB9LFxuXHRcdGl0ZW1TZXBhcmF0b3I6IHsgY29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSB9LCBwYXR0ZXJuOiAnc29saWQnIH0sXG5cdFx0bGluZVNlcGFyYXRvcjogeyBjb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1IH0sIHBhdHRlcm46ICdzb2xpZCcgfSxcblx0XHRtYWluRGlzdHJpYnV0ZWRTcGFjZTogeyBoYXRjaENvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUsIGE6IDAuNyB9LCBmaWxsQ29sb3I6IHsgcjogMTQwLCBnOiAxOTAsIGI6IDI1NSwgYTogMC40IH0gfSxcblx0XHRjcm9zc0Rpc3RyaWJ1dGVkU3BhY2U6IHsgaGF0Y2hDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjcgfSwgZmlsbENvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUsIGE6IDAuNCB9IH0sXG5cdFx0cm93R2FwU3BhY2U6IHsgaGF0Y2hDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjcgfSwgZmlsbENvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUsIGE6IDAuNCB9IH0sXG5cdFx0Y29sdW1uR2FwU3BhY2U6IHsgaGF0Y2hDb2xvcjogeyByOiAxNDAsIGc6IDE5MCwgYjogMjU1LCBhOiAwLjcgfSwgZmlsbENvbG9yOiB7IHI6IDE0MCwgZzogMTkwLCBiOiAyNTUsIGE6IDAuNCB9IH0sXG5cdH0sXG5cdGZsZXhJdGVtSGlnaGxpZ2h0Q29uZmlnOiB7XG5cdFx0YmFzZVNpemVCb3g6IHsgaGF0Y2hDb2xvcjogeyByOiAxMzAsIGc6IDE3MCwgYjogMjU1LCBhOiAwLjYgfSB9LFxuXHRcdGJhc2VTaXplQm9yZGVyOiB7IGNvbG9yOiB7IHI6IDEyMCwgZzogMTgwLCBiOiAyNTUgfSwgcGF0dGVybjogJ3NvbGlkJyB9LFxuXHRcdGZsZXhpYmlsaXR5QXJyb3c6IHsgY29sb3I6IHsgcjogMTMwLCBnOiAxOTAsIGI6IDI1NSB9IH1cblx0fSxcbn07XG5cbmZ1bmN0aW9uIHVzZVNjb3BlZERpc3Bvc2FsKCkge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSBhcyBEaXNwb3NhYmxlU3RvcmUgJiB7IFtTeW1ib2wuZGlzcG9zZV0oKTogdm9pZCB9O1xuXHRzdG9yZVtTeW1ib2wuZGlzcG9zZV0gPSAoKSA9PiBzdG9yZS5kaXNwb3NlKCk7XG5cdHJldHVybiBzdG9yZTtcbn1cblxuLyoqXG4gKiBQZXItZnJhbWUgZWxlbWVudCBpbnNwZWN0b3IgYmFja2VkIGJ5IGEgZGVkaWNhdGVkIENEUCBzZXNzaW9uLlxuICpcbiAqIE93bnMgdGhlIGZ1bGwgbGlmZWN5Y2xlIG9mIGVsZW1lbnQgaW5zcGVjdGlvbiBmb3IgYSBzaW5nbGUgZnJhbWU6XG4gKiBDRFAgZG9tYWluIGluaXRpYWxpemF0aW9uLCBlbGVtZW50IHBpY2tpbmcgKG92ZXJsYXkgKyBDRFAgbW9kZXMpLFxuICogbm9kZSBkYXRhIGV4dHJhY3Rpb24sIGFuZCBoaWdobGlnaHQgbWFuYWdlbWVudC5cbiAqXG4gKiBGaXJlcyB7QGxpbmsgb25EaWRJbnNwZWN0RWxlbWVudH0gd2hlbiBhbiBlbGVtZW50IGlzIHNlbGVjdGVkIHZpYVxuICogQ0RQIGluc3BlY3QgbW9kZSAoZGVidWdnZXIgcGF1c2VkKS5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5zcGVjdEVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWxlbWVudERhdGE+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluc3BlY3RFbGVtZW50OiBFdmVudDxJRWxlbWVudERhdGE+ID0gdGhpcy5fb25EaWRJbnNwZWN0RWxlbWVudC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQgPSB0aGlzLl9vbkRpZFJlbW92ZUVsZW1lbnRDb21tZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RvcFBpY2tpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTdG9wUGlja2luZzogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFN0b3BQaWNraW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgX2lzUGF1c2VkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUluc3BlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUFjdGl2ZUluc3BlY3Rpb24+KCkpO1xuXG5cdC8qKiBXaGV0aGVyIHRoaXMgZnJhbWUncyBKYXZhU2NyaXB0IGV4ZWN1dGlvbiBpcyBjdXJyZW50bHkgcGF1c2VkIGJ5IHRoZSBkZWJ1Z2dlci4gKi9cblx0Z2V0IGlzUGF1c2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNQYXVzZWQ7IH1cblxuXHQvKiogV2hldGhlciBlbGVtZW50IGluc3BlY3Rpb24gaXMgY3VycmVudGx5IGFjdGl2ZSBvbiB0aGlzIGZyYW1lLiAqL1xuXHRnZXQgaXNJbnNwZWN0aW5nKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLl9hY3RpdmVJbnNwZWN0aW9uLnZhbHVlOyB9XG5cblx0LyoqIFRoZSBDRFAgZnJhbWUgSUQgZm9yIHRoaXMgZnJhbWUuICovXG5cdGdldCBmcmFtZUlkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9mcmFtZUlkOyB9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBjb25uZWN0aW9uIFRoZSBDRFAgc2Vzc2lvbiB0aGF0IG93bnMgdGhpcyBmcmFtZSdzIHRhcmdldC5cblx0ICogQHBhcmFtIGZyYW1lIFRoZSBFbGVjdHJvbiBXZWJGcmFtZU1haW4gZm9yIHRoaXMgZnJhbWUuXG5cdCAqIEBwYXJhbSBfdW5pcXVlQ29udGV4dElkIFRoZSB1bmlxdWUgZXhlY3V0aW9uIGNvbnRleHQgSUQgZm9yIFJ1bnRpbWUgY2FsbHMgaW4gdGhpcyBmcmFtZS5cblx0ICogQHBhcmFtIF9mcmFtZUlkIFRoZSBDRFAgZnJhbWUgSUQgZm9yIHRoaXMgZnJhbWUuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb25uZWN0aW9uOiBJQ0RQQ29ubmVjdGlvbixcblx0XHRyZWFkb25seSBmcmFtZTogRWxlY3Ryb24uV2ViRnJhbWVNYWluLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuaXF1ZUNvbnRleHRJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZyYW1lSWQ6IHN0cmluZyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbm5lY3Rpb24ub25DbG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25uZWN0aW9uLm9uRXZlbnQoYXN5bmMgZXZlbnQgPT4ge1xuXHRcdFx0c3dpdGNoIChldmVudC5tZXRob2QpIHtcblx0XHRcdFx0Y2FzZSAnT3ZlcmxheS5pbnNwZWN0Tm9kZVJlcXVlc3RlZCc6IHtcblx0XHRcdFx0XHRjb25zdCBwYXJhbXMgPSBldmVudC5wYXJhbXMgYXMgeyBiYWNrZW5kTm9kZUlkOiBudW1iZXIgfTtcblx0XHRcdFx0XHQvLyBPbmx5IGhhbmRsZSB0aGlzIGV2ZW50IHdoZW4gVlMgQ29kZSdzIG93biBlbGVtZW50IHBpY2tlciBpcyBhY3RpdmUuXG5cdFx0XHRcdFx0Ly8gVGhpcyBldmVudCBhbHNvIGZpcmVzIHdoZW4gdGhlIHVzZXIgaW5zcGVjdHMgZWxlbWVudHMgdmlhIHRoZVxuXHRcdFx0XHRcdC8vIERldlRvb2xzIGJ1aWx0LWluIGluc3BlY3QgY3Vyc29yIFx1MjAxNCBpbiB0aGF0IGNhc2Ugd2UgbXVzdCBub3Rcblx0XHRcdFx0XHQvLyBzaWxlbnRseSBhZGQgdGhlIGVsZW1lbnQgdG8gQ29waWxvdCBDaGF0IGFzIGNvbnRleHQuXG5cdFx0XHRcdFx0aWYgKHBhcmFtcz8uYmFja2VuZE5vZGVJZCAmJiB0aGlzLmlzSW5zcGVjdGluZykge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Ly8gVmVyaWZ5IHRoZSBub2RlIGJlbG9uZ3MgdG8gdGhpcyBmcmFtZSAoaW1wb3J0YW50IHdoZW5cblx0XHRcdFx0XHRcdFx0Ly8gc2hhcmluZyBhIHNlc3Npb24gd2l0aCBzYW1lLW9yaWdpbiBzaWJsaW5ncykuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgbm9kZSB9ID0gYXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdET00uZGVzY3JpYmVOb2RlJywge1xuXHRcdFx0XHRcdFx0XHRcdGJhY2tlbmROb2RlSWQ6IHBhcmFtcy5iYWNrZW5kTm9kZUlkLFxuXHRcdFx0XHRcdFx0XHR9KSBhcyB7IG5vZGU6IHsgZnJhbWVJZD86IHN0cmluZyB9IH07XG5cdFx0XHRcdFx0XHRcdGlmIChub2RlLmZyYW1lSWQgJiYgbm9kZS5mcmFtZUlkICE9PSB0aGlzLl9mcmFtZUlkKSB7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3Qgbm9kZURhdGEgPSBhd2FpdCB0aGlzLmV4dHJhY3ROb2RlRGF0YSh7IGJhY2tlbmROb2RlSWQ6IHBhcmFtcy5iYWNrZW5kTm9kZUlkIH0pO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZEluc3BlY3RFbGVtZW50LmZpcmUobm9kZURhdGEpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdC8vIEJlc3QgZWZmb3J0LlxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdEZWJ1Z2dlci5wYXVzZWQnOlxuXHRcdFx0XHRcdHRoaXMuX2lzUGF1c2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnRGVidWdnZXIucmVzdW1lZCc6XG5cdFx0XHRcdFx0dGhpcy5faXNQYXVzZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGVsZW1lbnQtcGlja2VkIElQQyBmcm9tIHRoaXMgZnJhbWUncyBwcmVsb2FkXG5cdFx0Y29uc3Qgb25QaWNrZWQgPSBhc3luYyAoZXZlbnQ6IEVsZWN0cm9uLklwY01haW5FdmVudCwgcmVzdWx0OiB7IGVsZW1lbnRJZD86IHN0cmluZzsgY29tbWVudD86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRpZiAoIXJlc3VsdD8uZWxlbWVudElkIHx8IGV2ZW50LnNlbmRlckZyYW1lICE9PSB0aGlzLmZyYW1lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG5vZGVEYXRhID0gYXdhaXQgdGhpcy5leHRyYWN0Tm9kZURhdGFCeUlkKHJlc3VsdC5lbGVtZW50SWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEluc3BlY3RFbGVtZW50LmZpcmUoeyAuLi5ub2RlRGF0YSwgZWxlbWVudElkOiByZXN1bHQuZWxlbWVudElkLCBjb21tZW50OiByZXN1bHQuY29tbWVudCB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVFbGVtZW50Q29tbWVudHMoeyBwZW5kaW5nQ29tbWVudElkc1RvRGlzY2FyZDogW3Jlc3VsdC5lbGVtZW50SWRdIH0pO1xuXHRcdFx0XHQvLyBCZXN0IGVmZm9ydDsgdXNlciBjYW4gcmUtcGljay5cblx0XHRcdH1cblx0XHR9O1xuXHRcdGZyYW1lLmlwYy5vbigndnNjb2RlOmJyb3dzZXJWaWV3OmVsZW1lbnRQaWNrZWQnLCBvblBpY2tlZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBmcmFtZS5pcGMucmVtb3ZlTGlzdGVuZXIoJ3ZzY29kZTpicm93c2VyVmlldzplbGVtZW50UGlja2VkJywgb25QaWNrZWQpIH0pO1xuXHRcdGNvbnN0IG9uQ29tbWVudFJlbW92ZWQgPSAoZXZlbnQ6IEVsZWN0cm9uLklwY01haW5FdmVudCwgZWxlbWVudElkOiBzdHJpbmcpID0+IHtcblx0XHRcdGlmIChlbGVtZW50SWQgJiYgZXZlbnQuc2VuZGVyRnJhbWUgPT09IHRoaXMuZnJhbWUpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudC5maXJlKGVsZW1lbnRJZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRmcmFtZS5pcGMub24oJ3ZzY29kZTpicm93c2VyVmlldzplbGVtZW50Q29tbWVudFJlbW92ZWQnLCBvbkNvbW1lbnRSZW1vdmVkKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IGZyYW1lLmlwYy5yZW1vdmVMaXN0ZW5lcigndnNjb2RlOmJyb3dzZXJWaWV3OmVsZW1lbnRDb21tZW50UmVtb3ZlZCcsIG9uQ29tbWVudFJlbW92ZWQpIH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBwaWNrLXN0b3BwZWQgSVBDIGZyb20gdGhpcyBmcmFtZSdzIHByZWxvYWRcblx0XHRjb25zdCBvblBpY2tTdG9wcGVkID0gKGV2ZW50OiBFbGVjdHJvbi5JcGNNYWluRXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC5zZW5kZXJGcmFtZSAhPT0gdGhpcy5mcmFtZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZFN0b3BQaWNraW5nLmZpcmUoKTtcblx0XHR9O1xuXHRcdGZyYW1lLmlwYy5vbigndnNjb2RlOmJyb3dzZXJWaWV3OmVsZW1lbnRQaWNrU3RvcHBlZCcsIG9uUGlja1N0b3BwZWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gZnJhbWUuaXBjLnJlbW92ZUxpc3RlbmVyKCd2c2NvZGU6YnJvd3NlclZpZXc6ZWxlbWVudFBpY2tTdG9wcGVkJywgb25QaWNrU3RvcHBlZCkgfSk7XG5cblx0XHR0aGlzLl9lbmFibGVEb21haW5zKCkuY2F0Y2goKCkgPT4geyB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VuYWJsZURvbWFpbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdET00uZW5hYmxlJyk7XG5cdFx0YXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdPdmVybGF5LmVuYWJsZScpO1xuXHRcdGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnQ1NTLmVuYWJsZScpO1xuXHRcdGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnUnVudGltZS5lbmFibGUnKTtcblx0XHRhd2FpdCB0aGlzLmNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ1BhZ2UuZW5hYmxlJyk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIHRoZSB0aGVtZSB0byB0aGlzIGZyYW1lJ3MgcHJlbG9hZC5cblx0ICovXG5cdHNldFRoZW1lKHRoZW1lOiBJQnJvd3NlclZpZXdUaGVtZSk6IHZvaWQge1xuXHRcdHRoaXMuZnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzZXRUaGVtZScsIHRoZW1lKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGFydCBlbGVtZW50IGluc3BlY3Rpb24gb24gdGhpcyBmcmFtZS5cblx0ICogVXNlcyBDRFAgaW5zcGVjdCBtb2RlIGlmIHBhdXNlZCwgb3RoZXJ3aXNlIHRoZSBwcmVsb2FkIHBpY2tlci5cblx0ICogU3RvcmVzIGEgZGlzcG9zYWJsZSBzbyBzdG9wIGFsd2F5cyB0ZWFycyBkb3duIHRoZSBjb3JyZWN0IG1vZGUuXG5cdCAqL1xuXHRhc3luYyBzdGFydEluc3BlY3Rpb24ob3B0aW9uczogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9pc1BhdXNlZCAmJiBvcHRpb25zLm1vZGUgIT09IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50ID8gJ2NkcCcgOiAncHJlbG9hZCc7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUluc3BlY3Rpb24udmFsdWU/Lm1vZGUgPT09IG1vZGUpIHtcblx0XHRcdGlmIChtb2RlID09PSAncHJlbG9hZCcpIHtcblx0XHRcdFx0dGhpcy5mcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OnN0YXJ0RWxlbWVudFBpY2tlcicsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3N0b3BJbnNwZWN0aW9uKCk7XG5cdFx0aWYgKG1vZGUgPT09ICdjZHAnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ092ZXJsYXkuc2V0SW5zcGVjdE1vZGUnLCB7XG5cdFx0XHRcdG1vZGU6ICdzZWFyY2hGb3JOb2RlJyxcblx0XHRcdFx0aGlnaGxpZ2h0Q29uZmlnOiBpbnNwZWN0SGlnaGxpZ2h0Q29uZmlnLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzdG9wID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5mcmFtZS5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdPdmVybGF5LnNldEluc3BlY3RNb2RlJywge1xuXHRcdFx0XHRcdFx0bW9kZTogJ25vbmUnLFxuXHRcdFx0XHRcdFx0aGlnaGxpZ2h0Q29uZmlnOiB7IHNob3dJbmZvOiBmYWxzZSwgc2hvd1N0eWxlczogZmFsc2UgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnT3ZlcmxheS5oaWRlSGlnaGxpZ2h0Jyk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIEJlc3QgZWZmb3J0LlxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fYWN0aXZlSW5zcGVjdGlvbi52YWx1ZSA9IHtcblx0XHRcdFx0bW9kZSxcblx0XHRcdFx0c3RvcCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHZvaWQgc3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZyYW1lLnBvc3RNZXNzYWdlKCd2c2NvZGU6YnJvd3NlclZpZXc6c3RhcnRFbGVtZW50UGlja2VyJywgb3B0aW9ucyk7XG5cdFx0XHRjb25zdCBzdG9wID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuZnJhbWUuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuZnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzdG9wRWxlbWVudFBpY2tlcicsIHt9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FjdGl2ZUluc3BlY3Rpb24udmFsdWUgPSB7XG5cdFx0XHRcdG1vZGUsXG5cdFx0XHRcdHN0b3AsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHR2b2lkIHN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdG9wSW5zcGVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY3RpdmVJbnNwZWN0aW9uID0gdGhpcy5fYWN0aXZlSW5zcGVjdGlvbi52YWx1ZTtcblx0XHRpZiAoYWN0aXZlSW5zcGVjdGlvbikge1xuXHRcdFx0dGhpcy5fYWN0aXZlSW5zcGVjdGlvbi5jbGVhckFuZExlYWsoKTtcblx0XHRcdGF3YWl0IGFjdGl2ZUluc3BlY3Rpb24uc3RvcCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdG9wIGVsZW1lbnQgaW5zcGVjdGlvbiBvbiB0aGlzIGZyYW1lLlxuXHQgKi9cblx0YXN5bmMgc3RvcEluc3BlY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcEluc3BlY3Rpb24oKTtcblx0fVxuXG5cdHNldEVsZW1lbnRDb21tZW50cyh1cGRhdGU6IElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlRWxlbWVudENvbW1lbnRzKHVwZGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFbGVtZW50Q29tbWVudHModXBkYXRlOiBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5mcmFtZS5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHR0aGlzLmZyYW1lLnBvc3RNZXNzYWdlKCd2c2NvZGU6YnJvd3NlclZpZXc6c2V0RWxlbWVudENvbW1lbnRzJywgdXBkYXRlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhbiBlbGVtZW50IGJ5IGl0cyBwcmVsb2FkLXRyYWNrZWQgaWQgYW5kIGV4dHJhY3QgZnVsbCBub2RlIGRhdGEuXG5cdCAqL1xuXHRhc3luYyBleHRyYWN0Tm9kZURhdGFCeUlkKGVsZW1lbnRJZDogc3RyaW5nKTogUHJvbWlzZTxJRWxlbWVudERhdGE+IHtcblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdSdW50aW1lLmV2YWx1YXRlJywge1xuXHRcdFx0ZXhwcmVzc2lvbjogYHdpbmRvdy5fX3ZzY29kZV9oZWxwZXJzPy5nZXRFbGVtZW50KCR7SlNPTi5zdHJpbmdpZnkoZWxlbWVudElkKX0pYCxcblx0XHRcdHJldHVybkJ5VmFsdWU6IGZhbHNlLFxuXHRcdFx0dW5pcXVlQ29udGV4dElkOiB0aGlzLl91bmlxdWVDb250ZXh0SWQsXG5cdFx0fSkgYXMgeyByZXN1bHQ6IHsgb2JqZWN0SWQ/OiBzdHJpbmcgfSB9O1xuXG5cdFx0aWYgKCFyZXN1bHQ/Lm9iamVjdElkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke2VsZW1lbnRJZH1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5leHRyYWN0Tm9kZURhdGEoeyBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4dHJhY3QgZnVsbCBlbGVtZW50IGRhdGEgZnJvbSBhIENEUCBub2RlIHJlZmVyZW5jZS5cblx0ICovXG5cdGFzeW5jIGV4dHJhY3ROb2RlRGF0YShpZDogeyBiYWNrZW5kTm9kZUlkPzogbnVtYmVyOyBvYmplY3RJZD86IHN0cmluZyB9KTogUHJvbWlzZTxJRWxlbWVudERhdGE+IHtcblx0XHRjb25zdCBkYXRhID0gYXdhaXQgZXh0cmFjdE5vZGVEYXRhKHRoaXMuY29ubmVjdGlvbiwgaWQpO1xuXHRcdHJldHVybiB7IC4uLmRhdGEsIHVybDogdGhpcy5mcmFtZS51cmwgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHZpc3VhbCB2aWV3cG9ydCBzY2FsZSBmb3IgdGhpcyBmcmFtZS5cblx0ICovXG5cdGFzeW5jIGdldFZpc3VhbFZpZXdwb3J0U2NhbGUoKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb25uZWN0aW9uLnNlbmRDb21tYW5kKCdQYWdlLmdldExheW91dE1ldHJpY3MnKSBhcyBJTGF5b3V0TWV0cmljc1Jlc3VsdDtcblx0XHRcdGlmICh0eXBlb2YgcmVzdWx0LmNzc1Zpc3VhbFZpZXdwb3J0Py5zY2FsZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0Y29uc3Qgc2NhbGUgPSBOdW1iZXIocmVzdWx0LmNzc1Zpc3VhbFZpZXdwb3J0LnNjYWxlKTtcblx0XHRcdFx0aWYgKE51bWJlci5pc0Zpbml0ZShzY2FsZSkgJiYgc2NhbGUgPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNjYWxlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmUgZXhlY3V0aW9uIGVycm9ycyB3aGlsZSBsb2FkaW5nIGFuZCB1c2UgZGVmYXVsdHMuXG5cdFx0fVxuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIGhhbmRsZSB0byBhbiBlbGVtZW50IHRyYWNrZWQgYnkgdGhlIHByZWxvYWQgc2NyaXB0LlxuXHQgKi9cblx0Z2V0RWxlbWVudEhhbmRsZShlbGVtZW50SWQ6IHN0cmluZyk6IElGcmFtZUVsZW1lbnRIYW5kbGUge1xuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRUb0NoYXQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgbm9kZURhdGEgPSBhd2FpdCB0aGlzLmV4dHJhY3ROb2RlRGF0YUJ5SWQoZWxlbWVudElkKTtcblx0XHRcdFx0dGhpcy5fb25EaWRJbnNwZWN0RWxlbWVudC5maXJlKG5vZGVEYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRhZGRDb21tZW50OiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzaG93RWxlbWVudENvbW1lbnQnLCB7IGVsZW1lbnRJZCB9KTtcblx0XHRcdH0sXG5cdFx0XHRoaWdobGlnaHQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5mcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OmhpZ2hsaWdodEVsZW1lbnQnLCB7IGVsZW1lbnRJZCB9KTtcblx0XHRcdH0sXG5cdFx0XHRoaWRlSGlnaGxpZ2h0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpoaWRlSGlnaGxpZ2h0Jywge30pO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5mcmFtZS5wb3N0TWVzc2FnZSgndnNjb2RlOmJyb3dzZXJWaWV3OmhpZGVIaWdobGlnaHQnLCB7fSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXh0cmFjdE5vZGVEYXRhKGNvbm5lY3Rpb246IElDRFBDb25uZWN0aW9uLCBpZDogeyBiYWNrZW5kTm9kZUlkPzogbnVtYmVyOyBvYmplY3RJZD86IHN0cmluZyB9KTogUHJvbWlzZTxJRWxlbWVudERhdGE+IHtcblx0dXNpbmcgc3RvcmUgPSB1c2VTY29wZWREaXNwb3NhbCgpO1xuXG5cdGNvbnN0IGRpc2NvdmVyZWROb2Rlc0J5Tm9kZUlkOiBSZWNvcmQ8bnVtYmVyLCBJTm9kZT4gPSB7fTtcblx0c3RvcmUuYWRkKGNvbm5lY3Rpb24ub25FdmVudChldmVudCA9PiB7XG5cdFx0aWYgKGV2ZW50Lm1ldGhvZCA9PT0gJ0RPTS5zZXRDaGlsZE5vZGVzJykge1xuXHRcdFx0Y29uc3QgeyBub2RlcyB9ID0gZXZlbnQucGFyYW1zIGFzIHsgbm9kZXM6IElOb2RlW10gfTtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuXHRcdFx0XHRkaXNjb3ZlcmVkTm9kZXNCeU5vZGVJZFtub2RlLm5vZGVJZF0gPSBub2RlO1xuXHRcdFx0XHRpZiAobm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0ZGlzY292ZXJlZE5vZGVzQnlOb2RlSWRbY2hpbGQubm9kZUlkXSA9IHtcblx0XHRcdFx0XHRcdFx0Li4uY2hpbGQsXG5cdFx0XHRcdFx0XHRcdHBhcmVudElkOiBub2RlLm5vZGVJZFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5vZGUucHNldWRvRWxlbWVudHMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHBzZXVkbyBvZiBub2RlLnBzZXVkb0VsZW1lbnRzKSB7XG5cdFx0XHRcdFx0XHRkaXNjb3ZlcmVkTm9kZXNCeU5vZGVJZFtwc2V1ZG8ubm9kZUlkXSA9IHtcblx0XHRcdFx0XHRcdFx0Li4ucHNldWRvLFxuXHRcdFx0XHRcdFx0XHRwYXJlbnRJZDogbm9kZS5ub2RlSWRcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KSk7XG5cblx0YXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmdldERvY3VtZW50Jyk7XG5cblx0Y29uc3QgeyBub2RlIH0gPSBhd2FpdCBjb25uZWN0aW9uLnNlbmRDb21tYW5kKCdET00uZGVzY3JpYmVOb2RlJywgaWQpIGFzIHsgbm9kZTogSU5vZGUgfTtcblx0aWYgKCFub2RlKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZGVzY3JpYmUgbm9kZS4nKTtcblx0fVxuXHRsZXQgbm9kZUlkID0gbm9kZS5ub2RlSWQ7XG5cdGlmICghbm9kZUlkKSB7XG5cdFx0Y29uc3QgeyBub2RlSWRzIH0gPSBhd2FpdCBjb25uZWN0aW9uLnNlbmRDb21tYW5kKCdET00ucHVzaE5vZGVzQnlCYWNrZW5kSWRzVG9Gcm9udGVuZCcsIHsgYmFja2VuZE5vZGVJZHM6IFtub2RlLmJhY2tlbmROb2RlSWRdIH0pIGFzIHsgbm9kZUlkczogbnVtYmVyW10gfTtcblx0XHRpZiAoIW5vZGVJZHM/Lmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IG5vZGUgSUQuJyk7XG5cdFx0fVxuXHRcdG5vZGVJZCA9IG5vZGVJZHNbMF07XG5cdH1cblxuXHRjb25zdCB7IG1vZGVsIH0gPSBhd2FpdCBjb25uZWN0aW9uLnNlbmRDb21tYW5kKCdET00uZ2V0Qm94TW9kZWwnLCB7IG5vZGVJZCB9KSBhcyB7IG1vZGVsOiBJQm94TW9kZWwgfTtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBib3ggbW9kZWwuJyk7XG5cdH1cblxuXHRjb25zdCBjb250ZW50ID0gbW9kZWwuY29udGVudDtcblx0Y29uc3QgbWFyZ2luID0gbW9kZWwubWFyZ2luO1xuXHRjb25zdCB4ID0gTWF0aC5taW4obWFyZ2luWzBdLCBjb250ZW50WzBdKTtcblx0Y29uc3QgeSA9IE1hdGgubWluKG1hcmdpblsxXSwgY29udGVudFsxXSk7XG5cdGNvbnN0IHdpZHRoID0gTWF0aC5tYXgobWFyZ2luWzJdIC0gbWFyZ2luWzBdLCBjb250ZW50WzJdIC0gY29udGVudFswXSk7XG5cdGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KG1hcmdpbls1XSAtIG1hcmdpblsxXSwgY29udGVudFs1XSAtIGNvbnRlbnRbMV0pO1xuXG5cdGNvbnN0IG1hdGNoZWQgPSBhd2FpdCBjb25uZWN0aW9uLnNlbmRDb21tYW5kKCdDU1MuZ2V0TWF0Y2hlZFN0eWxlc0Zvck5vZGUnLCB7IG5vZGVJZCB9KTtcblx0aWYgKCFtYXRjaGVkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IG1hdGNoZWQgY3NzLicpO1xuXHR9XG5cblx0Y29uc3QgeyBydWxlc1RleHQsIHJlZmVyZW5jZWRWYXJzLCBhdXRob3JQcm9wZXJ0eU5hbWVzLCB1c2VyQWdlbnRQcm9wZXJ0eU5hbWVzIH0gPSBmb3JtYXRNYXRjaGVkU3R5bGVzKG1hdGNoZWQgYXMgSU1hdGNoZWRTdHlsZXMpO1xuXHRjb25zdCB7IG91dGVySFRNTCB9ID0gYXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnRE9NLmdldE91dGVySFRNTCcsIHsgbm9kZUlkIH0pIGFzIHsgb3V0ZXJIVE1MOiBzdHJpbmcgfTtcblx0aWYgKCFvdXRlckhUTUwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3V0ZXJIVE1MLicpO1xuXHR9XG5cblx0Y29uc3QgYXR0cmlidXRlcyA9IGF0dHJpYnV0ZUFycmF5VG9SZWNvcmQobm9kZS5hdHRyaWJ1dGVzKTtcblxuXHRjb25zdCBhbmNlc3RvcnM6IElFbGVtZW50QW5jZXN0b3JbXSA9IFtdO1xuXHRsZXQgY3VycmVudE5vZGU6IElOb2RlIHwgdW5kZWZpbmVkID0gZGlzY292ZXJlZE5vZGVzQnlOb2RlSWRbbm9kZUlkXSA/PyBub2RlO1xuXHR3aGlsZSAoY3VycmVudE5vZGUpIHtcblx0XHRjb25zdCBhdHRyaWJ1dGVzID0gYXR0cmlidXRlQXJyYXlUb1JlY29yZChjdXJyZW50Tm9kZS5hdHRyaWJ1dGVzKTtcblx0XHRhbmNlc3RvcnMudW5zaGlmdCh7XG5cdFx0XHR0YWdOYW1lOiBjdXJyZW50Tm9kZS5sb2NhbE5hbWUsXG5cdFx0XHRpZDogYXR0cmlidXRlcy5pZCxcblx0XHRcdGNsYXNzTmFtZXM6IGF0dHJpYnV0ZXMuY2xhc3M/LnRyaW0oKS5zcGxpdCgvXFxzKy8pLmZpbHRlcihCb29sZWFuKVxuXHRcdH0pO1xuXHRcdGN1cnJlbnROb2RlID0gY3VycmVudE5vZGUucGFyZW50SWQgPyBkaXNjb3ZlcmVkTm9kZXNCeU5vZGVJZFtjdXJyZW50Tm9kZS5wYXJlbnRJZF0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBCdWlsZCB0aGUgY29tcHV0ZWQgc3R5bGUgc3RyaW5nIGFuZCBmaWx0ZXJlZCBjb21wdXRlZFN0eWxlcyByZWNvcmRcblx0bGV0IGNvbXB1dGVkU3R5bGUgPSBydWxlc1RleHQ7XG5cdGxldCBjb21wdXRlZFN0eWxlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0dHJ5IHtcblx0XHRjb25zdCB7IGNvbXB1dGVkU3R5bGU6IGNvbXB1dGVkU3R5bGVBcnJheSB9ID0gYXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZCgnQ1NTLmdldENvbXB1dGVkU3R5bGVGb3JOb2RlJywgeyBub2RlSWQgfSkgYXMgeyBjb21wdXRlZFN0eWxlPzogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT4gfTtcblx0XHRpZiAoY29tcHV0ZWRTdHlsZUFycmF5KSB7XG5cdFx0XHRjb21wdXRlZFN0eWxlcyA9IHt9O1xuXG5cdFx0XHQvLyBDb2xsZWN0IHJlc29sdmVkIHByb3BlcnR5IHZhbHVlcyBpbnRvIGEgbWFwIGZvciBzaG9ydGhhbmQgY29sbGFwc2luZ1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRNYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgdmFyTGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgcHJvcCBvZiBjb21wdXRlZFN0eWxlQXJyYXkpIHtcblx0XHRcdFx0aWYgKCFwcm9wLm5hbWUgfHwgdHlwZW9mIHByb3AudmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbmNsdWRlIGluIGNvbXB1dGVkU3R5bGVzIHJlY29yZDogcmVmZXJlbmNlZCB2YXJzICsga2V5IFVJIHByb3BlcnRpZXNcblx0XHRcdFx0aWYgKHJlZmVyZW5jZWRWYXJzLmhhcyhwcm9wLm5hbWUpIHx8IGtleUNvbXB1dGVkUHJvcGVydGllcy5oYXMocHJvcC5uYW1lKSkge1xuXHRcdFx0XHRcdGNvbXB1dGVkU3R5bGVzW3Byb3AubmFtZV0gPSBwcm9wLnZhbHVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW5jbHVkZSBpbiByZXNvbHZlZCB2YWx1ZXM6IGFueSBwcm9wZXJ0eSBleHBsaWNpdGx5IHNldCBieSBzdHlsZXNoZWV0c1xuXHRcdFx0XHRpZiAoYXV0aG9yUHJvcGVydHlOYW1lcy5oYXMocHJvcC5uYW1lKSkge1xuXHRcdFx0XHRcdHJlc29sdmVkTWFwLnNldChwcm9wLm5hbWUsIHByb3AudmFsdWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHVzZXJBZ2VudFByb3BlcnR5TmFtZXMuaGFzKHByb3AubmFtZSkpIHtcblx0XHRcdFx0XHRyZXNvbHZlZE1hcC5zZXQocHJvcC5uYW1lLCBgJHtwcm9wLnZhbHVlfSAvKlVBKi9gKTsgLy8gTWFyayBpdCBhcyBjb21pbmcgZnJvbSBVc2VyIEFnZW50IHN0eWxlcy5cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEluY2x1ZGUgcmVmZXJlbmNlZCBDU1MgdmFyaWFibGUgdmFsdWVzXG5cdFx0XHRcdGlmIChyZWZlcmVuY2VkVmFycy5oYXMocHJvcC5uYW1lKSkge1xuXHRcdFx0XHRcdHZhckxpbmVzLnB1c2goYCR7cHJvcC5uYW1lfTogJHtwcm9wLnZhbHVlfTtgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzb2x2ZWRNYXAuc2l6ZSA+IDApIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRMaW5lcyA9IGNvbGxhcHNlVG9TaG9ydGhhbmRzKHJlc29sdmVkTWFwKTtcblx0XHRcdFx0Y29tcHV0ZWRTdHlsZSArPSAnXFxuXFxuLyogUmVzb2x2ZWQgdmFsdWVzICovXFxuJyArIHJlc29sdmVkTGluZXMuam9pbignXFxuJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFyTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb21wdXRlZFN0eWxlICs9ICdcXG5cXG4vKiBDU1MgdmFyaWFibGVzICovXFxuJyArIHZhckxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBjYXRjaCB7IH1cblxuXHRyZXR1cm4ge1xuXHRcdG91dGVySFRNTCxcblx0XHRjb21wdXRlZFN0eWxlLFxuXHRcdGJvdW5kczogeyB4LCB5LCB3aWR0aCwgaGVpZ2h0IH0sXG5cdFx0YW5jZXN0b3JzLFxuXHRcdGF0dHJpYnV0ZXMsXG5cdFx0Y29tcHV0ZWRTdHlsZXMsXG5cdFx0ZGltZW5zaW9uczogeyB0b3A6IHksIGxlZnQ6IHgsIHdpZHRoLCBoZWlnaHQgfVxuXHR9O1xufVxuXG5mdW5jdGlvbiBhdHRyaWJ1dGVBcnJheVRvUmVjb3JkKGF0dHJpYnV0ZXM6IHN0cmluZ1tdKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG5cdGNvbnN0IHJlY29yZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGF0dHJpYnV0ZXMubGVuZ3RoOyBpICs9IDIpIHtcblx0XHRjb25zdCBuYW1lID0gYXR0cmlidXRlc1tpXTtcblx0XHRjb25zdCB2YWx1ZSA9IGF0dHJpYnV0ZXNbaSArIDFdO1xuXHRcdHJlY29yZFtuYW1lXSA9IHZhbHVlO1xuXHR9XG5cdHJldHVybiByZWNvcmQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsbUNBQXNKO0FBQy9KLFNBQVMsc0JBQXNCLHFCQUFxQiw2QkFBa0Q7QUEyQy9GLE1BQU0seUJBQXlCO0FBQUEsRUFDckMsVUFBVTtBQUFBLEVBQ1YsWUFBWTtBQUFBLEVBQ1osWUFBWTtBQUFBLEVBQ1osdUJBQXVCO0FBQUEsRUFDdkIsb0JBQW9CO0FBQUEsRUFDcEIsbUJBQW1CO0FBQUEsRUFDbkIsY0FBYyxFQUFFLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUFBLEVBQy9DLGNBQWMsRUFBRSxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFBQSxFQUMvQyxhQUFhLEVBQUUsR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQUEsRUFDOUMsYUFBYSxFQUFFLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUFBLEVBQzlDLGtCQUFrQixFQUFFLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUFBLEVBQ25ELFlBQVksRUFBRSxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFBQSxFQUM3QyxrQkFBa0IsRUFBRSxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFBQSxFQUNuRCxxQkFBcUI7QUFBQSxJQUNwQixhQUFhLEVBQUUsR0FBRyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQUEsSUFDOUMsZUFBZSxFQUFFLEdBQUcsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcs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
