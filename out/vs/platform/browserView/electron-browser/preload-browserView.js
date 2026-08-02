const commentElementSelectionMode = "comment";
let localizedStrings = {
  addComment: "Add Comment",
  addCommentPlaceholder: "Add a comment",
  commentOnSelectedElement: "Comment on selected element",
  elementComment: "Element comment {0}",
  elementCommentWithBody: "Element comment {0}: {1}",
  emptyElementComment: "Empty element comment {0}",
  removeComment: "Remove Comment",
  removeElementComment: "Remove element comment"
};
function init() {
  const { contextBridge, ipcRenderer } = require("electron");
  const nativeCtrlCmdKeybindings = {
    mac: {
      always: /* @__PURE__ */ new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "backspace", "delete"]),
      noShift: /* @__PURE__ */ new Set(["a", "c", "v", "x", "z"]),
      withShift: /* @__PURE__ */ new Set(["v", "z"])
    },
    nonMac: {
      always: /* @__PURE__ */ new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "home", "end", "backspace", "delete"]),
      noShift: /* @__PURE__ */ new Set(["a", "c", "v", "x", "z", "y"]),
      withShift: /* @__PURE__ */ new Set(["v", "z"])
    }
  };
  window.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !event.isTrusted) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    const isNonEditingKey = event.key === "Escape" || /^F\d+$/.test(event.key) || event.key.startsWith("Audio") || event.key.startsWith("Media") || event.key.startsWith("Browser");
    if (!(event.ctrlKey || event.altKey || event.metaKey) && !isNonEditingKey) {
      return;
    }
    if (event.key === "Control" || event.key === "Shift" || event.key === "Alt" || event.key === "Meta") {
      return;
    }
    const isMac = navigator.platform.indexOf("Mac") >= 0;
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (isMac || /^Numpad\d+$/.test(event.code)) {
        return;
      }
    }
    if (event.key === "F10" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      return;
    }
    const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
    if (ctrlCmd && !event.altKey) {
      let key = event.key.toLowerCase();
      if (!/^[a-z]$/.test(key) && /^Key[A-Z]$/.test(event.code)) {
        key = event.code.slice(3).toLowerCase();
      }
      const keySetsToCheck = [
        nativeCtrlCmdKeybindings[isMac ? "mac" : "nonMac"].always,
        nativeCtrlCmdKeybindings[isMac ? "mac" : "nonMac"][event.shiftKey ? "withShift" : "noShift"]
      ];
      if (keySetsToCheck.some((set) => set.has(key))) {
        return;
      }
      if (isMac && event.ctrlKey && !event.shiftKey && key === " ") {
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer.send("vscode:browserView:keydown", {
      key: event.key,
      keyCode: event.keyCode,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      repeat: event.repeat
    });
  });
  const elementPicker = new ElementPicker(
    (el, comment) => {
      const elementId = track(el);
      ipcRenderer.send("vscode:browserView:elementPicked", { elementId, comment });
      return elementId;
    },
    (elementId) => ipcRenderer.send("vscode:browserView:elementCommentRemoved", elementId),
    () => ipcRenderer.send("vscode:browserView:elementPickStopped")
  );
  const areaPicker = new AreaPicker(
    (rect) => ipcRenderer.send("vscode:browserView:areaPicked", rect),
    () => ipcRenderer.send("vscode:browserView:areaPickStopped")
  );
  const trackedElementsById = /* @__PURE__ */ new Map();
  const finalizationRegistry = new FinalizationRegistry((id) => {
    trackedElementsById.delete(id);
  });
  function track(element) {
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    trackedElementsById.set(id, new WeakRef(element));
    finalizationRegistry.register(element, id);
    return id;
  }
  let contextMenuTarget;
  window.addEventListener("contextmenu", (event) => {
    if (!event.isTrusted) {
      return;
    }
    const target = elementPicker.resolveContextMenuTarget(event);
    if (target) {
      const els = [target];
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        els.push(selection.anchorNode, selection.focusNode);
      }
      contextMenuTarget = {
        ref: new WeakRef(findCommonVisibleAncestor(els) ?? target),
        anchor: { x: event.clientX, y: event.clientY }
      };
    } else {
      contextMenuTarget = void 0;
    }
  }, { capture: true });
  ipcRenderer.on("vscode:browserView:setTheme", (_event, theme) => {
    elementPicker.setTheme(theme);
    areaPicker.setTheme(theme);
  });
  ipcRenderer.on("vscode:browserView:setLocalizedStrings", (_event, strings) => {
    localizedStrings = strings;
    elementPicker.updateLocalizedStrings();
  });
  ipcRenderer.on("vscode:browserView:startElementPicker", (_event, options) => {
    elementPicker.start(options);
  });
  ipcRenderer.on("vscode:browserView:stopElementPicker", (_event) => {
    elementPicker.stop();
  });
  ipcRenderer.on("vscode:browserView:startAreaPicker", (_event) => {
    areaPicker.start();
  });
  ipcRenderer.on("vscode:browserView:stopAreaPicker", (_event) => {
    areaPicker.stop();
  });
  ipcRenderer.on("vscode:browserView:highlightElement", (_event, { elementId }) => {
    const element = getElement(elementId);
    if (element) {
      elementPicker.highlight(element);
    }
  });
  ipcRenderer.on("vscode:browserView:showElementComment", (_event, { elementId }) => {
    const element = getElement(elementId);
    if (element) {
      elementPicker.comment(element, elementId === "context-menu-target" ? contextMenuTarget?.anchor : void 0);
    }
  });
  ipcRenderer.on("vscode:browserView:hideHighlight", (_event) => {
    elementPicker.hideHighlight();
  });
  ipcRenderer.on("vscode:browserView:setElementComments", (_event, update) => {
    elementPicker.updateComments(update);
  });
  const getElement = (id) => {
    switch (id) {
      case "active":
        return document.activeElement;
      case "context-menu-target":
        return contextMenuTarget?.ref.deref() ?? null;
      default:
        return trackedElementsById.get(id)?.deref() ?? null;
    }
  };
  const isolatedHelpers = {
    /**
     * Get the currently selected text in the page.
     */
    getSelectedText() {
      try {
        return window.getSelection()?.toString() ?? "";
      } catch {
        return "";
      }
    }
  };
  const frameToken = `frame-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const mainWorldHelpers = {
    getElement,
    /** Opaque token exposed for CDP-side frame matching. */
    getFrameToken() {
      return frameToken;
    }
  };
  try {
    contextBridge.exposeInIsolatedWorld(999, "browserViewAPI", isolatedHelpers);
    contextBridge.exposeInMainWorld("__vscode_helpers", mainWorldHelpers);
  } catch (error) {
    console.error(error);
  }
  ipcRenderer.send("vscode:browserView:preloadReady", frameToken);
}
function findCommonVisibleAncestor(candidates) {
  const filteredNodes = candidates.filter((c) => !!c);
  const unique = [...new Set(filteredNodes.map((node) => node instanceof Element ? node : node.parentElement).filter((e) => !!e))];
  if (unique.length === 0) {
    return void 0;
  }
  const findVisible = (el) => {
    for (let cur = el; cur; cur = cur.parentElement) {
      const width = cur instanceof HTMLElement ? cur.offsetWidth : cur.clientWidth;
      const height = cur instanceof HTMLElement ? cur.offsetHeight : cur.clientHeight;
      if (width > 0 && height > 0) {
        return cur;
      }
    }
    return el;
  };
  if (unique.length === 1) {
    return findVisible(unique[0]);
  }
  const firstChain = [];
  for (let cur = unique[0]; cur; cur = cur.parentElement) {
    firstChain.unshift(cur);
  }
  let common = firstChain;
  for (let i = 1; i < unique.length; i++) {
    const otherChain = [];
    for (let cur = unique[i]; cur; cur = cur.parentElement) {
      otherChain.unshift(cur);
    }
    let j = 0;
    const limit = Math.min(common.length, otherChain.length);
    while (j < limit && common[j] === otherChain[j]) {
      j++;
    }
    common = common.slice(0, j);
    if (common.length === 0) {
      return void 0;
    }
  }
  return findVisible(common[common.length - 1]);
}
const _ElementPicker = class _ElementPicker {
  constructor(_onPicked, _onCommentRemoved, _onStopped) {
    this._onPicked = _onPicked;
    this._onCommentRemoved = _onCommentRemoved;
    this._onStopped = _onStopped;
    this._selectionActive = false;
    this._continuous = false;
    this._commentMode = false;
    this._comments = /* @__PURE__ */ new Map();
    this._pendingComments = /* @__PURE__ */ new Map();
    this._dismissedCommentOnPointerDown = false;
    this._commentBackdropRequest = 0;
    this._commentPreviewAnimations = [];
    this._commentPreviewCollapsing = false;
    this._reducedMotion = false;
    // --- Event handlers ---
    this._onPointerMove = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (this._commentTarget || this._commentPreviewElementId || this._externalHighlightTarget || e.composedPath().includes(this._shadowHost)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!this._dragStart) {
        this._updateHighlight(this._pickElementAt(e.clientX, e.clientY));
        return;
      }
      const dx = Math.abs(e.clientX - this._dragStart.x);
      const dy = Math.abs(e.clientY - this._dragStart.y);
      if (dx < _ElementPicker._DRAG_THRESHOLD_PX && dy < _ElementPicker._DRAG_THRESHOLD_PX) {
        return;
      }
      const left = Math.min(this._dragStart.x, e.clientX);
      const top = Math.min(this._dragStart.y, e.clientY);
      if (this._dragbox) {
        this._dragbox.style.display = "block";
        this._dragbox.style.left = `${left}px`;
        this._dragbox.style.top = `${top}px`;
        this._dragbox.style.width = `${dx}px`;
        this._dragbox.style.height = `${dy}px`;
      }
      this._updateHighlight(this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy }));
    };
    this._onPointerLeave = () => {
      if (!this._selectionActive || this._commentTarget || this._commentPreviewElementId || this._externalHighlightTarget) {
        return;
      }
      if (!this._dragStart) {
        this._updateHighlight(this._focusedTarget);
      }
    };
    this._onPointerDown = (e) => {
      if (!this._selectionActive) {
        return;
      }
      this._dismissedCommentOnPointerDown = false;
      if (e.composedPath().includes(this._shadowHost)) {
        return;
      }
      if (this._commentTarget) {
        this._dismissedCommentOnPointerDown = true;
        this._finishCommentInteraction();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      this._dragStart = { x: e.clientX, y: e.clientY };
      this._dragStartTarget = this._pickElementAt(e.clientX, e.clientY);
      if (this._cursorStylesheet) {
        this._cursorStylesheet.textContent = _ElementPicker._CURSOR_CROSSHAIR;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onPointerUp = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (this._dismissedCommentOnPointerDown) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.composedPath().includes(this._shadowHost)) {
        return;
      }
      if (!this._dragStart) {
        return;
      }
      const dx = Math.abs(e.clientX - this._dragStart.x);
      const dy = Math.abs(e.clientY - this._dragStart.y);
      const start = this._dragStart;
      this._dragStart = void 0;
      if (this._cursorStylesheet) {
        this._cursorStylesheet.textContent = _ElementPicker._CURSOR_DEFAULT;
      }
      if (dx < _ElementPicker._DRAG_THRESHOLD_PX && dy < _ElementPicker._DRAG_THRESHOLD_PX) {
        const target = this._dragStartTarget ?? this._pickElementAt(e.clientX, e.clientY);
        this._dragStartTarget = void 0;
        if (target) {
          this._commit(target, { x: e.clientX, y: e.clientY });
        }
      } else {
        this._dragStartTarget = void 0;
        if (this._dragbox) {
          this._dragbox.style.display = "none";
        }
        this._updateHighlight(void 0);
        const left = Math.min(start.x, e.clientX);
        const top = Math.min(start.y, e.clientY);
        const ancestor = this._pickRegionAncestor({ x: left, y: top, width: dx, height: dy });
        if (ancestor) {
          this._commit(ancestor, { x: e.clientX, y: e.clientY });
        }
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onClick = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (this._dismissedCommentOnPointerDown) {
        this._dismissedCommentOnPointerDown = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.composedPath().includes(this._shadowHost)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onFocusIn = (event) => {
      if (!this._selectionActive || this._commentTarget || this._externalHighlightTarget) {
        return;
      }
      if (event.composedPath().includes(this._shadowHost)) {
        return;
      }
      const focusedElement = this._getFocusedElement();
      this._focusedTarget = focusedElement?.matches(":focus-visible") ? focusedElement : void 0;
      this._updateHighlight(this._focusedTarget);
    };
    this._onWindowBlur = () => {
      if (!this._selectionActive || this._commentTarget || this._externalHighlightTarget) {
        return;
      }
      this._focusedTarget = void 0;
      this._updateHighlight(void 0);
    };
    this._onKeyDown = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (e.key === "Escape") {
        if (this._commentTarget) {
          const target = this._commentTarget;
          this._finishCommentInteraction();
          this._focusCommentTarget(target);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        this.stop();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Enter" && !e.isComposing) {
        const focusedElement = this._getFocusedElement();
        if (focusedElement) {
          e.preventDefault();
          e.stopPropagation();
          this._commit(focusedElement);
        }
      }
    };
    const shadowHost = document.createElement("div");
    shadowHost.setAttribute("data-vscode-pick-host", "");
    shadowHost.style.cssText = "position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
    const root = shadowHost.attachShadow({ mode: "closed" });
    root.appendChild(_ElementPicker._buildStyle());
    this._shadowHost = shadowHost;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const commentBackdrop = document.createElementNS(svgNamespace, "svg");
    commentBackdrop.classList.add("comment-backdrop");
    const backdropMaskId = `vscode-comment-cutout-${Math.random().toString(36).slice(2)}`;
    const backdropDefinitions = document.createElementNS(svgNamespace, "defs");
    const backdropMask = document.createElementNS(svgNamespace, "mask");
    backdropMask.id = backdropMaskId;
    backdropMask.setAttribute("maskUnits", "userSpaceOnUse");
    backdropMask.setAttribute("x", "0");
    backdropMask.setAttribute("y", "0");
    backdropMask.setAttribute("width", "100%");
    backdropMask.setAttribute("height", "100%");
    const backdropMaskFill = document.createElementNS(svgNamespace, "rect");
    backdropMaskFill.setAttribute("width", "100%");
    backdropMaskFill.setAttribute("height", "100%");
    backdropMaskFill.setAttribute("fill", "white");
    const backdropCutout = document.createElementNS(svgNamespace, "rect");
    backdropCutout.setAttribute("fill", "black");
    backdropMask.append(backdropMaskFill, backdropCutout);
    backdropDefinitions.appendChild(backdropMask);
    const backdropFill = document.createElementNS(svgNamespace, "rect");
    backdropFill.classList.add("comment-backdrop-fill");
    backdropFill.setAttribute("width", "100%");
    backdropFill.setAttribute("height", "100%");
    backdropFill.setAttribute("mask", `url(#${backdropMaskId})`);
    const highlightShape = document.createElementNS(svgNamespace, "rect");
    highlightShape.classList.add("highlight-shape");
    highlightShape.style.display = "none";
    commentBackdrop.append(backdropDefinitions, backdropFill, highlightShape);
    root.appendChild(commentBackdrop);
    this._commentBackdrop = commentBackdrop;
    this._commentBackdropCutout = backdropCutout;
    this._highlightShape = highlightShape;
    const highlight = document.createElement("div");
    highlight.className = "highlight";
    highlight.style.display = "none";
    root.appendChild(highlight);
    this._highlight = highlight;
    const commentPreviewRemoveButton = document.createElement("button");
    commentPreviewRemoveButton.className = "comment-preview-remove";
    commentPreviewRemoveButton.type = "button";
    const commentPreviewRemoveIcon = document.createElementNS(svgNamespace, "svg");
    commentPreviewRemoveIcon.setAttribute("viewBox", "0 0 16 16");
    commentPreviewRemoveIcon.setAttribute("fill", "currentColor");
    commentPreviewRemoveIcon.setAttribute("aria-hidden", "true");
    const commentPreviewRemoveIconPath = document.createElementNS(svgNamespace, "path");
    commentPreviewRemoveIconPath.setAttribute("d", "M3.854 3.146a.5.5 0 0 0-.708.708L7.293 8l-4.147 4.146a.5.5 0 0 0 .708.708L8 8.707l4.146 4.147a.5.5 0 0 0 .708-.708L8.707 8l4.147-4.146a.5.5 0 0 0-.708-.708L8 7.293 3.854 3.146Z");
    commentPreviewRemoveIcon.appendChild(commentPreviewRemoveIconPath);
    commentPreviewRemoveButton.appendChild(commentPreviewRemoveIcon);
    commentPreviewRemoveButton.title = localizedStrings.removeComment;
    commentPreviewRemoveButton.setAttribute("aria-label", localizedStrings.removeElementComment);
    commentPreviewRemoveButton.addEventListener("click", () => {
      if (this._commentPreviewElementId) {
        this._removeComment(this._commentPreviewElementId);
      }
    });
    this._commentPreviewRemoveButton = commentPreviewRemoveButton;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    root.appendChild(overlay);
    this._overlay = overlay;
    const label = document.createElement("div");
    label.className = "label";
    label.style.display = "none";
    root.appendChild(label);
    this._label = label;
    const labelInfo = document.createElement("span");
    labelInfo.className = "label-info";
    label.appendChild(labelInfo);
    const labelSelector = document.createElement("span");
    labelSelector.className = "label-selector";
    labelInfo.appendChild(labelSelector);
    this._labelSelector = labelSelector;
    const labelClasses = document.createElement("span");
    labelClasses.className = "label-classes";
    labelInfo.appendChild(labelClasses);
    this._labelClasses = labelClasses;
    const labelDims = document.createElement("span");
    labelDims.className = "label-dims";
    label.appendChild(labelDims);
    this._labelDims = labelDims;
    const commentPreview = document.createElement("div");
    commentPreview.className = "comment-surface comment-preview";
    commentPreview.style.display = "none";
    commentPreview.setAttribute("role", "note");
    const commentPreviewBody = document.createElement("span");
    commentPreviewBody.className = "comment-preview-body";
    commentPreview.appendChild(commentPreviewBody);
    commentPreview.appendChild(commentPreviewRemoveButton);
    root.appendChild(commentPreview);
    this._commentPreview = commentPreview;
    this._commentPreviewBody = commentPreviewBody;
    for (const element of [highlight, label, commentPreview]) {
      element.addEventListener("mouseenter", () => this._cancelCommentPreviewHide());
      element.addEventListener("mouseleave", () => this._scheduleCommentPreviewHide());
      element.addEventListener("focusin", () => this._cancelCommentPreviewHide());
      element.addEventListener("focusout", () => this._scheduleCommentPreviewHide());
    }
    const dragbox = document.createElement("div");
    dragbox.className = "dragbox";
    dragbox.style.display = "none";
    root.appendChild(dragbox);
    this._dragbox = dragbox;
    const commentLayer = document.createElement("div");
    commentLayer.className = "comment-layer";
    root.appendChild(commentLayer);
    this._commentLayer = commentLayer;
    const commentComposer = document.createElement("div");
    commentComposer.className = "comment-surface comment-composer";
    commentComposer.style.display = "none";
    commentComposer.setAttribute("role", "dialog");
    commentComposer.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    commentComposer.setAttribute("aria-modal", "true");
    commentLayer.appendChild(commentComposer);
    this._commentComposer = commentComposer;
    const commentInput = document.createElement("textarea");
    commentInput.className = "comment-input";
    commentInput.rows = 1;
    commentInput.placeholder = localizedStrings.addCommentPlaceholder;
    commentInput.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    commentInput.addEventListener("input", () => this._layoutCommentInput());
    commentInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        this._submitComment();
      }
    });
    commentComposer.appendChild(commentInput);
    this._commentInput = commentInput;
    const sendButton = document.createElement("button");
    sendButton.className = "comment-send";
    sendButton.type = "button";
    const sendButtonIcon = document.createElementNS(svgNamespace, "svg");
    sendButtonIcon.setAttribute("viewBox", "0 0 16 16");
    sendButtonIcon.setAttribute("fill", "currentColor");
    sendButtonIcon.setAttribute("aria-hidden", "true");
    const sendButtonIconPath = document.createElementNS(svgNamespace, "path");
    sendButtonIconPath.setAttribute("d", "M8.5 3a.5.5 0 0 0-1 0v4.5H3a.5.5 0 0 0 0 1h4.5V13a.5.5 0 0 0 1 0V8.5H13a.5.5 0 0 0 0-1H8.5V3Z");
    sendButtonIcon.appendChild(sendButtonIconPath);
    sendButton.appendChild(sendButtonIcon);
    sendButton.title = localizedStrings.addComment;
    sendButton.setAttribute("aria-label", localizedStrings.addComment);
    sendButton.addEventListener("click", () => this._submitComment());
    commentComposer.appendChild(sendButton);
    this._commentSendButton = sendButton;
    commentComposer.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") {
        return;
      }
      if (event.shiftKey && event.target === commentInput) {
        event.preventDefault();
        sendButton.focus();
      } else if (!event.shiftKey && event.target === sendButton) {
        event.preventDefault();
        commentInput.focus();
      }
    });
    window.addEventListener("scroll", () => this._onScrollOrResize(), { passive: true, capture: true });
    window.addEventListener("resize", () => this._onScrollOrResize());
  }
  start(options) {
    if (this._selectionActive) {
      this._updateSelectionOptions(options);
      return true;
    }
    this._commentMode = options.mode === commentElementSelectionMode;
    this._continuous = options.continuous ?? false;
    this._ensureMounted();
    this._selectionActive = true;
    this._overlay.style.display = "block";
    const cursorStyle = document.createElement("style");
    cursorStyle.textContent = _ElementPicker._CURSOR_DEFAULT;
    document.head.appendChild(cursorStyle);
    this._cursorStylesheet = cursorStyle;
    window.addEventListener("pointermove", this._onPointerMove, true);
    document.addEventListener("pointerleave", this._onPointerLeave, true);
    window.addEventListener("pointerdown", this._onPointerDown, true);
    window.addEventListener("pointerup", this._onPointerUp, true);
    window.addEventListener("click", this._onClick, true);
    window.addEventListener("contextmenu", this._onClick, true);
    window.addEventListener("focusin", this._onFocusIn, true);
    window.addEventListener("blur", this._onWindowBlur);
    window.addEventListener("keydown", this._onKeyDown, true);
    if (!this._externalHighlightTarget) {
      const focusedElement = this._getFocusedElement();
      this._focusedTarget = options.highlightFocusedElement ? focusedElement : void 0;
      this._updateHighlight(this._focusedTarget);
    }
    return true;
  }
  _updateSelectionOptions(options) {
    const wasCommentMode = this._commentMode;
    this._commentMode = options.mode === commentElementSelectionMode;
    this._continuous = options.continuous ?? false;
    if (wasCommentMode && !this._commentMode && this._commentTarget) {
      this._closeCommentComposer();
    }
    if (options.highlightFocusedElement && !this._commentTarget && !this._commentPreviewElementId && !this._externalHighlightTarget) {
      this._focusedTarget = this._getFocusedElement();
      this._updateHighlight(this._focusedTarget);
    }
  }
  stop() {
    if (!this._selectionActive) {
      return;
    }
    this._hideActiveCommentPreview();
    this._selectionActive = false;
    this._closeCommentComposer();
    this._overlay.style.display = "none";
    this._cursorStylesheet?.remove();
    this._cursorStylesheet = void 0;
    window.removeEventListener("pointermove", this._onPointerMove, true);
    document.removeEventListener("pointerleave", this._onPointerLeave, true);
    window.removeEventListener("pointerdown", this._onPointerDown, true);
    window.removeEventListener("pointerup", this._onPointerUp, true);
    window.removeEventListener("click", this._onClick, true);
    window.removeEventListener("contextmenu", this._onClick, true);
    window.removeEventListener("focusin", this._onFocusIn, true);
    window.removeEventListener("blur", this._onWindowBlur);
    window.removeEventListener("keydown", this._onKeyDown, true);
    this._highlight.style.display = "none";
    this._label.style.display = "none";
    this._dragbox.style.display = "none";
    this._dragStart = void 0;
    this._dragStartTarget = void 0;
    this._dismissedCommentOnPointerDown = false;
    this._highlightTarget = void 0;
    this._focusedTarget = void 0;
    if (this._externalHighlightTarget) {
      this._updateHighlight(this._externalHighlightTarget);
    }
    this._onStopped();
    this._unmountWhenIdle();
  }
  /**
   * Update the theme colors applied to the overlay.
   * Can be called at any time; takes effect immediately.
   */
  setTheme(theme) {
    _ElementPicker._applyTheme(this._shadowHost, theme);
    this._reducedMotion = theme.reducedMotion ?? false;
    this._shadowHost.classList.toggle("reduce-motion", this._reducedMotion);
  }
  updateLocalizedStrings() {
    this._applyLocalizedStrings();
  }
  resolveContextMenuTarget(event) {
    if (this._commentPreviewElementId && event.composedPath().includes(this._shadowHost)) {
      this._hideActiveCommentPreview();
      return this._pickElementAt(event.clientX, event.clientY);
    }
    return event.target instanceof Element ? event.target : void 0;
  }
  /**
   * Highlight a specific element without starting a pick session.
   * Mounts the shadow host if not already in the document.
   */
  highlight(element) {
    this._ensureMounted();
    this._externalHighlightTarget = element;
    this._hideActiveCommentPreview();
    this._updateHighlight(element);
  }
  /**
   * Hide any current highlight. If no pick session is active, also
   * removes the shadow host from the document.
   */
  hideHighlight() {
    this._externalHighlightTarget = void 0;
    if (this._commentTarget) {
      return;
    }
    this._updateHighlight(void 0);
    this._unmountWhenIdle();
  }
  comment(element, anchor) {
    this._externalHighlightTarget = void 0;
    if (this._selectionActive) {
      this.stop();
    }
    this.start({ mode: commentElementSelectionMode });
    const bounds = element.getBoundingClientRect();
    this._showCommentComposer(element, anchor ?? {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    });
  }
  updateComments(update) {
    if (update.comments) {
      const incoming = new Map(update.comments.map((comment, index) => [comment.elementId, { body: comment.body, ordinal: index + 1 }]));
      for (const [elementId, comment] of this._comments) {
        const incomingComment = incoming.get(elementId);
        if (!incomingComment) {
          this._clearCommentPreview(comment.target);
          comment.pin.remove();
          this._comments.delete(elementId);
        } else {
          comment.ordinal = incomingComment.ordinal;
          if (incomingComment.body === comment.body) {
            continue;
          }
          comment.body = incomingComment.body;
          if (this._commentPreviewElementId === elementId) {
            this._setCommentPreviewBody(incomingComment.body);
            this._renderHighlight(comment.target);
          }
        }
      }
      for (const [elementId, comment] of incoming) {
        if (this._comments.has(elementId)) {
          continue;
        }
        const pending = this._pendingComments.get(elementId);
        if (pending) {
          this._createCommentPin(elementId, pending.target, pending.anchor, comment.body, comment.ordinal);
        }
      }
    }
    for (const elementId of update.pendingCommentIdsToDiscard ?? []) {
      this._pendingComments.delete(elementId);
    }
    this._updateCommentPinNumbers();
    this._unmountWhenIdle();
  }
  _onScrollOrResize() {
    if (this._commentPreviewCollapsing) {
      this._hideActiveCommentPreview();
    }
    this._cancelCommentPreviewAnimations();
    if (this._highlightTarget) {
      this._renderHighlight(this._highlightTarget);
    }
    if (this._commentBackdropTarget) {
      this._layoutCommentBackdrop(this._commentBackdropTarget);
    }
    for (const comment of this._comments.values()) {
      this._layoutCommentPin(comment);
    }
  }
  // --- Picking helpers ---
  _getFocusedElement() {
    if (!document.hasFocus()) {
      return void 0;
    }
    let activeElement = document.activeElement;
    while (activeElement?.shadowRoot?.activeElement) {
      activeElement = activeElement.shadowRoot.activeElement;
    }
    if (!activeElement || activeElement === document.body || activeElement === document.documentElement || activeElement === this._shadowHost || activeElement instanceof HTMLIFrameElement) {
      return void 0;
    }
    return activeElement;
  }
  /** Return the page element under a viewport point, skipping our own overlay host. */
  _pickElementAt(x, y) {
    const candidates = document.elementsFromPoint(x, y);
    for (const el of candidates) {
      if (el === this._shadowHost || this._shadowHost.contains(el)) {
        continue;
      }
      return el;
    }
    return void 0;
  }
  /**
   * Resolve the element that "covers" a drag rectangle.
   *
   * Samples `elementFromPoint` at the 4 corners, 4 edge midpoints, and
   * center, then returns their deepest common ancestor.
   */
  _pickRegionAncestor(rect) {
    const { x, y, width, height } = rect;
    const x2 = x + width;
    const y2 = y + height;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const samples = [];
    for (const [sx, sy] of [
      [x, y],
      [x2, y],
      [x, y2],
      [x2, y2],
      // corners
      [cx, y],
      [cx, y2],
      [x, cy],
      [x2, cy],
      // edge midpoints
      [cx, cy]
      // center
    ]) {
      const el = this._pickElementAt(sx, sy);
      if (el) {
        samples.push(el);
      }
    }
    return findCommonVisibleAncestor(samples);
  }
  // --- Highlight ---
  _renderHighlight(target) {
    const highlight = this._highlight;
    const label = this._label;
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const viewportHeight = window.innerHeight;
    const viewportWidth = document.documentElement.clientWidth;
    const visibleRect = this._getVisibleTargetBounds(rect);
    const labelHeight = 22;
    highlight.style.display = "block";
    highlight.style.left = `${rect.left + scrollX}px`;
    highlight.style.top = `${rect.top + scrollY}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    this._highlightShape.style.display = "block";
    this._highlightShape.setAttribute("x", `${visibleRect.x}`);
    this._highlightShape.setAttribute("y", `${visibleRect.y}`);
    this._highlightShape.setAttribute("width", `${visibleRect.width}`);
    this._highlightShape.setAttribute("height", `${visibleRect.height}`);
    this._highlightShape.setAttribute("rx", "2");
    const tagName = String(target.tagName || "").toLowerCase();
    const idPart = target.id ? `#${target.id}` : "";
    const classPart = target.classList.length ? "." + [...target.classList].join(".") : "";
    this._labelSelector.textContent = tagName + idPart;
    this._labelClasses.textContent = classPart;
    this._labelDims.textContent = `${Math.round(rect.width)} \xD7 ${Math.round(rect.height)}`;
    label.style.display = "inline-flex";
    const idealTop = rect.top - labelHeight;
    const labelTop = Math.max(0, Math.min(viewportHeight - labelHeight, idealTop));
    label.style.left = "0";
    const naturalWidth = label.offsetWidth;
    const idealLeft = rect.left;
    const labelLeft = Math.max(0, Math.min(idealLeft, viewportWidth - naturalWidth));
    label.style.left = `${labelLeft}px`;
    label.style.top = `${labelTop}px`;
    let commentSurfaceAbove = false;
    for (const surface of [this._commentPreview, this._commentComposer]) {
      if (surface.style.display !== "none") {
        commentSurfaceAbove = this._layoutCommentSurface(surface, visibleRect, viewportWidth, viewportHeight) === "above" || commentSurfaceAbove;
      }
    }
    if (commentSurfaceAbove) {
      label.style.top = `${Math.max(0, Math.min(viewportHeight - labelHeight, visibleRect.bottom + 2))}px`;
    }
  }
  _getVisibleTargetBounds(rect) {
    const left = Math.max(0, Math.min(rect.left, window.innerWidth));
    const right = Math.max(left, Math.min(rect.right, window.innerWidth));
    const top = Math.max(0, Math.min(rect.top, window.innerHeight));
    const bottom = Math.max(top, Math.min(rect.bottom, window.innerHeight));
    return new DOMRect(left, top, right - left, bottom - top);
  }
  _layoutCommentSurface(surface, targetBounds, viewportWidth, viewportHeight) {
    if (surface === this._commentPreview) {
      const availableWidth = Math.min(320, viewportWidth - 16);
      const maximumWidth = Math.min(Math.max(320, targetBounds.width), availableWidth);
      surface.style.width = "max-content";
      surface.style.minWidth = "0";
      surface.style.maxWidth = `${maximumWidth}px`;
    }
    const surfaceHeight = surface.offsetHeight;
    const belowTop = targetBounds.bottom;
    const placement = belowTop + surfaceHeight <= viewportHeight - 8 ? "below" : "above";
    const surfaceTop = belowTop + surfaceHeight <= viewportHeight - 8 ? belowTop : Math.max(0, targetBounds.top - surfaceHeight);
    const surfaceWidth = surface.offsetWidth;
    const alignLeft = targetBounds.left + surfaceWidth <= viewportWidth;
    const alignment = alignLeft ? "left" : "right";
    const surfaceLeft = alignLeft ? Math.max(0, targetBounds.left) : Math.max(0, targetBounds.right - surfaceWidth);
    surface.dataset.attachmentCorner = `${placement === "below" ? "top" : "bottom"}-${alignment}`;
    surface.style.left = `${surfaceLeft}px`;
    surface.style.top = `${surfaceTop}px`;
    return placement;
  }
  _updateHighlight(target) {
    this._highlightTarget = target;
    if (!target) {
      this._highlight.style.display = "none";
      this._highlightShape.style.display = "none";
      this._label.style.display = "none";
      this._commentPreview.style.display = "none";
      return;
    }
    this._renderHighlight(target);
  }
  // --- Commit ---
  _commit(target, anchor) {
    if (!this._selectionActive) {
      return;
    }
    if (this._commentMode) {
      const bounds = target.getBoundingClientRect();
      this._showCommentComposer(target, anchor ?? {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2
      });
      return;
    }
    requestAnimationFrame(() => {
      if (!this._continuous) {
        this.stop();
      } else {
        this._updateHighlight(void 0);
      }
      this._onPicked(target);
    });
  }
  _showCommentComposer(target, anchor) {
    this._externalHighlightTarget = void 0;
    this._hideActiveCommentPreview();
    this._commentTarget = target;
    this._commentAnchor = {
      x: anchor.x + window.scrollX,
      y: anchor.y + window.scrollY
    };
    this._updateHighlight(target);
    this._showCommentBackdrop(target);
    this._commentLayer.classList.add("composing");
    this._commentInput.value = "";
    this._commentComposer.style.display = "flex";
    this._layoutCommentComposer();
    this._layoutCommentInput();
    this._animateCommentHighlight(
      new DOMRect(anchor.x - 3, anchor.y - 3, 6, 6),
      target,
      [this._label, this._commentComposer]
    );
    this._commentInput.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (this._commentTarget === target) {
        this._commentInput.focus({ preventScroll: true });
      }
    });
  }
  _closeCommentComposer() {
    this._commentTarget = void 0;
    this._commentAnchor = void 0;
    this._hideCommentBackdrop();
    this._commentLayer.classList.remove("composing");
    this._commentComposer.style.display = "none";
    this._commentInput.value = "";
    this._cancelCommentPreviewAnimations();
    this._updateHighlight(void 0);
  }
  _finishCommentInteraction() {
    if (this._continuous) {
      this._closeCommentComposer();
    } else {
      this.stop();
    }
  }
  _submitComment() {
    const target = this._commentTarget;
    const anchor = this._commentAnchor;
    if (!target || !anchor) {
      return;
    }
    const body = this._commentInput.value.replace(/\r?\n/g, " ");
    const elementId = this._onPicked(target, body);
    this._pendingComments.set(elementId, { target, anchor, body });
    this._finishCommentInteraction();
    this._focusCommentTarget(target);
  }
  _focusCommentTarget(target) {
    if (!target.isConnected || !(target instanceof HTMLElement || target instanceof SVGElement)) {
      return;
    }
    const hadTabIndex = target.hasAttribute("tabindex");
    if (!hadTabIndex) {
      target.tabIndex = -1;
    }
    target.focus({ preventScroll: true });
    if (!hadTabIndex) {
      target.removeAttribute("tabindex");
    }
  }
  _createCommentPin(elementId, target, anchor, body, ordinal) {
    this._ensureMounted();
    const existing = this._comments.get(elementId);
    if (existing) {
      this._clearCommentPreview(existing.target);
    }
    existing?.pin.remove();
    this._pendingComments.delete(elementId);
    const rect = target.getBoundingClientRect();
    const offset = {
      x: anchor.x - (rect.left + window.scrollX),
      y: anchor.y - (rect.top + window.scrollY)
    };
    const pin = document.createElement("div");
    pin.className = "comment-pin";
    pin.tabIndex = 0;
    pin.setAttribute("role", "note");
    const bubble = document.createElement("span");
    bubble.className = "comment-pin-bubble";
    const numberElement = document.createElement("span");
    numberElement.className = "comment-pin-number";
    bubble.appendChild(numberElement);
    pin.appendChild(bubble);
    const show = () => {
      if (this._commentTarget || this._externalHighlightTarget) {
        return;
      }
      this._showCommentPreview(elementId, target, body);
    };
    pin.addEventListener("mouseenter", show);
    pin.addEventListener("mouseleave", () => this._scheduleCommentPreviewHide());
    pin.addEventListener("focusin", show);
    pin.addEventListener("focusout", () => this._scheduleCommentPreviewHide());
    this._commentLayer.appendChild(pin);
    const comment = { target, pin, numberElement, body, ordinal, offset };
    this._comments.set(elementId, comment);
    this._updateCommentPinNumbers();
    this._layoutCommentPin(comment);
  }
  _updateCommentPinNumbers() {
    for (const comment of this._comments.values()) {
      const numberLabel = String(comment.ordinal);
      comment.numberElement.textContent = numberLabel;
      comment.pin.title = comment.body || this._formatLocalizedString(localizedStrings.elementComment, numberLabel);
      comment.pin.setAttribute(
        "aria-label",
        comment.body ? this._formatLocalizedString(localizedStrings.elementCommentWithBody, numberLabel, comment.body) : this._formatLocalizedString(localizedStrings.emptyElementComment, numberLabel)
      );
    }
  }
  _applyLocalizedStrings() {
    this._commentPreviewRemoveButton.title = localizedStrings.removeComment;
    this._commentPreviewRemoveButton.setAttribute("aria-label", localizedStrings.removeElementComment);
    this._commentComposer.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    this._commentInput.placeholder = localizedStrings.addCommentPlaceholder;
    this._commentInput.setAttribute("aria-label", localizedStrings.commentOnSelectedElement);
    this._commentSendButton.title = localizedStrings.addComment;
    this._commentSendButton.setAttribute("aria-label", localizedStrings.addComment);
    this._updateCommentPinNumbers();
  }
  _formatLocalizedString(template, ...values) {
    return template.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? "");
  }
  _layoutCommentPin(comment) {
    const rect = comment.target.getBoundingClientRect();
    const x = rect.left + window.scrollX + comment.offset.x;
    const y = rect.top + window.scrollY + comment.offset.y;
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const halfWidth = comment.pin.offsetWidth / 2;
    const halfHeight = comment.pin.offsetHeight / 2;
    const clampedX = Math.max(halfWidth, Math.min(x, scrollingElement.scrollWidth - halfWidth));
    const clampedY = Math.max(halfHeight, Math.min(y, scrollingElement.scrollHeight - halfHeight));
    comment.pin.style.left = `${clampedX}px`;
    comment.pin.style.top = `${clampedY}px`;
  }
  _showCommentPreview(elementId, target, fallbackBody) {
    if (this._commentPreviewCollapsing) {
      return;
    }
    if (this._commentPreviewElementId === elementId) {
      this._cancelCommentPreviewHide();
      return;
    }
    this._hideActiveCommentPreview();
    this._commentPreviewElementId = elementId;
    const comment = this._comments.get(elementId);
    const pinBounds = comment ? this._getCommentPinPointBounds(comment.pin) : void 0;
    if (comment) {
      comment.pin.classList.add("previewing");
      comment.pin.after(this._commentPreview);
    }
    const body = comment?.body ?? fallbackBody;
    this._setCommentPreviewBody(body);
    this._shadowHost.classList.add("comment-preview-active");
    this._updateHighlight(target);
    this._showCommentBackdrop(target);
    if (pinBounds) {
      this._animateCommentHighlight(
        pinBounds,
        target,
        [this._label, this._commentPreview]
      );
    }
  }
  _setCommentPreviewBody(body) {
    this._commentPreviewBody.textContent = body;
    this._commentPreview.title = body;
    this._commentPreview.classList.toggle("empty", !body);
    this._commentPreview.style.display = "flex";
  }
  _getCommentPinPointBounds(pin) {
    const pinBounds = pin.getBoundingClientRect();
    return new DOMRect(pinBounds.left + 8, pinBounds.top + 8, 6, 6);
  }
  _animateCommentHighlight(pinBounds, target, supportingElements, collapsing = false) {
    if (this._reducedMotion) {
      return void 0;
    }
    const targetBounds = this._getVisibleTargetBounds(target.getBoundingClientRect());
    const duration = 180;
    const easing = "cubic-bezier(0.2, 0, 0, 1)";
    const pinKeyframe = {
      x: `${pinBounds.left}px`,
      y: `${pinBounds.top}px`,
      width: `${pinBounds.width}px`,
      height: `${pinBounds.height}px`,
      rx: `${pinBounds.width / 2}px`
    };
    const targetKeyframe = {
      x: `${targetBounds.left}px`,
      y: `${targetBounds.top}px`,
      width: `${targetBounds.width}px`,
      height: `${targetBounds.height}px`,
      rx: "2px"
    };
    const highlightAnimation = this._highlightShape.animate(
      collapsing ? [targetKeyframe, pinKeyframe] : [pinKeyframe, targetKeyframe],
      { duration, easing, fill: "forwards" }
    );
    this._commentPreviewAnimations.push(highlightAnimation);
    this._commentPreviewAnimations.push(this._commentBackdropCutout.animate(
      collapsing ? [targetKeyframe, pinKeyframe] : [pinKeyframe, targetKeyframe],
      { duration, easing, fill: "forwards" }
    ));
    for (const element of supportingElements) {
      if (element.style.display === "none") {
        continue;
      }
      const hiddenKeyframe = { opacity: 0, transform: "translateY(-4px)" };
      const keyframes = collapsing ? [{ opacity: 1, transform: "translateY(0)" }, { ...hiddenKeyframe, offset: 0.55 }, hiddenKeyframe] : [hiddenKeyframe, { ...hiddenKeyframe, offset: 0.45 }, { opacity: 1, transform: "translateY(0)" }];
      this._commentPreviewAnimations.push(element.animate(keyframes, { duration, easing, fill: "forwards" }));
    }
    return highlightAnimation;
  }
  _scheduleCommentPreviewHide() {
    this._cancelCommentPreviewHide();
    this._commentPreviewHideTimeout = window.setTimeout(() => {
      this._commentPreviewHideTimeout = void 0;
      const comment = this._commentPreviewElementId ? this._comments.get(this._commentPreviewElementId) : void 0;
      if (comment?.pin.matches(":hover, :focus-within") || this._highlight.matches(":hover, :focus-within") || this._label.matches(":hover, :focus-within") || this._commentPreview.matches(":hover, :focus-within") || this._commentPreviewRemoveButton.matches(":hover, :focus-within")) {
        return;
      }
      this._collapseActiveCommentPreview();
    }, 80);
  }
  _cancelCommentPreviewHide() {
    if (this._commentPreviewHideTimeout !== void 0) {
      window.clearTimeout(this._commentPreviewHideTimeout);
      this._commentPreviewHideTimeout = void 0;
    }
  }
  _collapseActiveCommentPreview() {
    const elementId = this._commentPreviewElementId;
    const comment = elementId ? this._comments.get(elementId) : void 0;
    if (!elementId || !comment || this._reducedMotion) {
      this._hideActiveCommentPreview();
      return;
    }
    this._commentPreviewCollapsing = true;
    this._shadowHost.classList.add("comment-preview-collapsing");
    this._fadeOutCommentBackdrop();
    let highlightAnimation = this._commentPreviewAnimations[0];
    if (highlightAnimation) {
      for (const animation of this._commentPreviewAnimations) {
        animation.reverse();
      }
    } else {
      highlightAnimation = this._animateCommentHighlight(
        this._getCommentPinPointBounds(comment.pin),
        comment.target,
        [this._label, this._commentPreview],
        true
      );
    }
    if (!highlightAnimation) {
      this._hideActiveCommentPreview();
      return;
    }
    highlightAnimation.onfinish = () => {
      if (this._commentPreviewCollapsing && this._commentPreviewElementId === elementId) {
        this._commentPreviewCollapsing = false;
        this._hideActiveCommentPreview();
      }
    };
  }
  _cancelCommentPreviewAnimations() {
    for (const animation of this._commentPreviewAnimations) {
      animation.cancel();
    }
    this._commentPreviewAnimations = [];
  }
  _hideActiveCommentPreview() {
    this._cancelCommentPreviewHide();
    this._commentPreviewCollapsing = false;
    this._shadowHost.classList.remove("comment-preview-collapsing");
    this._cancelCommentPreviewAnimations();
    if (this._commentPreviewElementId) {
      this._comments.get(this._commentPreviewElementId)?.pin.classList.remove("previewing");
    }
    this._commentPreviewElementId = void 0;
    this._shadowHost.classList.remove("comment-preview-active");
    this._commentPreview.style.display = "none";
    this._hideCommentBackdrop();
    if (!this._commentTarget) {
      this._updateHighlight(this._externalHighlightTarget);
    }
  }
  _removeComment(elementId) {
    const comment = this._comments.get(elementId);
    if (!comment) {
      return;
    }
    this._hideActiveCommentPreview();
    comment.pin.remove();
    this._comments.delete(elementId);
    this._updateCommentPinNumbers();
    this._unmountWhenIdle();
    this._onCommentRemoved(elementId);
  }
  _layoutCommentInput() {
    this._commentInput.style.height = "auto";
    this._commentInput.style.height = `${Math.min(this._commentInput.scrollHeight, 96)}px`;
    this._layoutCommentComposer();
  }
  _layoutCommentBackdrop(target) {
    const rect = this._getVisibleTargetBounds(target.getBoundingClientRect());
    this._commentBackdropCutout.setAttribute("x", `${rect.x}`);
    this._commentBackdropCutout.setAttribute("y", `${rect.y}`);
    this._commentBackdropCutout.setAttribute("width", `${rect.width}`);
    this._commentBackdropCutout.setAttribute("height", `${rect.height}`);
    this._commentBackdropCutout.setAttribute("rx", "2");
  }
  _showCommentBackdrop(target) {
    const request = ++this._commentBackdropRequest;
    this._commentBackdropTarget = target;
    this._layoutCommentBackdrop(target);
    this._commentBackdrop.classList.remove("visible");
    requestAnimationFrame(() => {
      if (this._commentBackdropRequest === request) {
        this._commentBackdrop.classList.add("visible");
      }
    });
  }
  _hideCommentBackdrop() {
    this._commentBackdropRequest++;
    this._commentBackdropTarget = void 0;
    this._commentBackdrop.classList.remove("visible");
  }
  _fadeOutCommentBackdrop() {
    this._commentBackdropRequest++;
    this._commentBackdrop.classList.remove("visible");
  }
  _clearCommentPreview(target) {
    if (this._commentTarget || this._commentBackdropTarget !== target) {
      return;
    }
    this._hideActiveCommentPreview();
  }
  _layoutCommentComposer() {
    if (!this._commentTarget) {
      return;
    }
    this._renderHighlight(this._commentTarget);
  }
  _ensureMounted() {
    if (!this._shadowHost.parentNode) {
      document.documentElement.appendChild(this._shadowHost);
    }
  }
  _unmountWhenIdle() {
    if (!this._selectionActive && !this._highlightTarget && this._comments.size === 0) {
      this._shadowHost.remove();
    }
  }
  // --- Static helpers ---
  /**
   * Inject the shadow-root stylesheet. Custom properties on the host
   * element drive the colors so the workbench can theme them.
   *
   * We deliberately do **not** use a `*` selector with `all: initial` —
   * that would also reset `<style>`'s default `display: none`, causing
   * the literal CSS source to render as page text.
   */
  static _buildStyle() {
    const style = document.createElement("style");
    style.textContent = `
			:host {
				all: initial;
				font-family: var(--pick-font, system-ui, -apple-system, sans-serif);
				pointer-events: none !important;
			}
			.highlight {
				position: absolute; box-sizing: border-box;
				z-index: 2;
			}
			.comment-backdrop {
				position: fixed;
				inset: 0;
				width: 100%;
				height: 100%;
				pointer-events: none;
				z-index: 2;
			}
			.comment-backdrop-fill {
				fill: var(--vscode-widget-shadow, transparent);
				opacity: 0;
				transition: opacity 120ms linear;
			}
			.comment-backdrop.visible .comment-backdrop-fill {
				opacity: 1;
			}
			.highlight-shape {
				fill: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				stroke: var(--vscode-focusBorder, #0078d4);
				stroke-width: 2px;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent; box-sizing: border-box;
				z-index: 1;
			}
			.comment-layer {
				position: absolute; inset: 0; pointer-events: none;
			}
			.comment-surface {
				position: fixed;
				box-sizing: border-box;
				width: min(320px, calc(100vw - 16px));
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-large, 8px);
				background: var(--vscode-editorWidget-background, #252526);
				color: var(--vscode-editorWidget-foreground, #cccccc);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
				font-size: 13px;
				font-weight: 400;
				z-index: 3;
			}
			.comment-surface[data-attachment-corner='top-left'] {
				border-top-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='top-right'] {
				border-top-right-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-left'] {
				border-bottom-left-radius: 0;
			}
			.comment-surface[data-attachment-corner='bottom-right'] {
				border-bottom-right-radius: 0;
			}
			.comment-preview {
				align-items: flex-start;
				gap: 8px;
				max-height: 96px;
				padding: 6px 8px;
				overflow: hidden;
				line-height: 20px;
				pointer-events: none;
			}
			.comment-preview.empty {
				gap: 0;
				padding: 4px;
			}
			.comment-preview.empty .comment-preview-body {
				display: none;
			}
			.comment-preview.empty .comment-preview-remove {
				margin-block: 0;
			}
			.comment-preview-body {
				flex: 1;
				min-width: 0;
				max-height: 82px;
				overflow-x: hidden;
				overflow-y: auto;
				overflow-wrap: anywhere;
				scrollbar-width: thin;
				white-space: pre-wrap;
			}
			:host(.comment-preview-active) .highlight,
			:host(.comment-preview-active) .label,
			:host(.comment-preview-active) .comment-preview {
				pointer-events: auto;
			}
			:host(.comment-preview-collapsing) .highlight,
			:host(.comment-preview-collapsing) .label,
			:host(.comment-preview-collapsing) .comment-preview {
				pointer-events: none;
			}
			.comment-preview-remove {
				flex: none;
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 24px;
				height: 24px;
				margin-block: -2px;
				padding: 0;
				border: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, inherit);
				cursor: pointer;
				font-family: inherit;
			}
			.comment-preview-remove svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-preview-remove:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-composer {
				align-items: flex-end; gap: 6px; padding: 6px;
				pointer-events: auto;
				z-index: 4;
			}
			.comment-input {
				flex: 1; min-width: 0; resize: none; overflow: auto;
				scrollbar-width: none;
				box-sizing: border-box; margin: 0; padding: 2px 6px;
				background: transparent; color: inherit;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder, #454545));
				border-radius: var(--vscode-cornerRadius-small, 4px);
				outline: 0;
				font: inherit;
				line-height: 20px;
				caret-color: var(--vscode-focusBorder, currentColor);
			}
			.comment-input::-webkit-scrollbar {
				display: none;
			}
			.comment-input::placeholder {
				color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground, #ccccccb3));
				opacity: 1;
			}
			.comment-send {
				box-sizing: border-box; border: 0; cursor: pointer; font-family: inherit;
			}
			.comment-send {
				flex: none; width: 24px; height: 24px; padding: 0;
				border-radius: var(--vscode-cornerRadius-small, 4px);
				background: transparent;
				color: var(--vscode-editorWidget-foreground, #cccccc);
				display: grid;
				place-items: center;
			}
			.comment-send svg {
				display: block;
				width: var(--vscode-codiconFontSize, 16px);
				height: var(--vscode-codiconFontSize, 16px);
			}
			.comment-send:hover {
				background: var(--vscode-toolbar-hoverBackground, transparent);
			}
			.comment-pin {
				position: absolute;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				transform: translate(-11px, -11px);
				pointer-events: auto;
				z-index: 4;
			}
			.comment-layer.composing .comment-pin {
				pointer-events: none;
				z-index: auto;
			}
			.comment-pin:hover, .comment-pin:focus-within {
				z-index: 5;
			}
			.comment-pin.previewing:not(:focus-within) .comment-pin-bubble {
				visibility: hidden;
			}
			.comment-pin-bubble {
				box-sizing: border-box;
				display: grid;
				place-items: center;
				width: 22px;
				height: 22px;
				padding: 0;
				border: var(--vscode-strokeThickness, 1px) solid var(--vscode-editorWidget-background, #252526);
				border-radius: var(--vscode-cornerRadius-circle, 9999px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				box-shadow: 0 2px 6px var(--vscode-widget-shadow, transparent);
			}
			.comment-pin-number {
				display: block;
				width: 100%;
				font-size: 11px;
				font-weight: 600;
				line-height: 12px;
				text-align: center;
			}
			.comment-send:focus-visible, .comment-preview-remove:focus-visible, .comment-pin:focus-visible, .comment-input:focus-visible {
				outline: 2px solid var(--vscode-focusBorder, #0078d4);
				outline-offset: 2px;
			}
			:host(.reduce-motion) .comment-backdrop-fill {
				transition: none;
			}
			.label {
				position: fixed; box-sizing: border-box;
				display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 6px;
				max-width: min(100%, 320px);
				background: var(--vscode-button-background, #0078d4);
				color: var(--vscode-button-foreground, white);
				font-family: inherit;
				font-size: 11px; line-height: 20px;
				white-space: nowrap;
				border-radius: 2px;
				box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
				z-index: 3;
			}
			.label-info {
				display: inline-block; overflow: hidden; text-overflow: ellipsis; min-width: 0;
			}
			.label-selector {
				font-weight: 600;
			}
			.label-dims {
				flex-shrink: 0; opacity: 0.8;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dotted var(--vscode-focusBorder, #a0aabe);
				background: transparent;
				z-index: 2;
			}
		`;
    return style;
  }
  static _applyTheme(host, theme) {
    host.style.setProperty("--vscode-focusBorder", theme?.focusBorder ?? null);
    host.style.setProperty("--vscode-button-background", theme?.buttonBackground ?? null);
    host.style.setProperty("--vscode-button-foreground", theme?.buttonForeground ?? null);
    host.style.setProperty("--vscode-editorWidget-background", theme?.widgetBackground ?? null);
    host.style.setProperty("--vscode-editorWidget-foreground", theme?.widgetForeground ?? null);
    host.style.setProperty("--vscode-editorWidget-border", theme?.widgetBorder ?? null);
    host.style.setProperty("--vscode-widget-shadow", theme?.widgetShadow ?? null);
    host.style.setProperty("--vscode-contrastBorder", theme?.contrastBorder ?? null);
    host.style.setProperty("--vscode-descriptionForeground", theme?.descriptionForeground ?? null);
    host.style.setProperty("--vscode-input-placeholderForeground", theme?.inputPlaceholderForeground ?? null);
    host.style.setProperty("--vscode-toolbar-hoverBackground", theme?.toolbarHoverBackground ?? null);
    host.style.setProperty("--pick-font", theme?.font ?? null);
  }
};
_ElementPicker._DRAG_THRESHOLD_PX = 4;
_ElementPicker._CURSOR_DEFAULT = "/* VS Code injected style */ * { cursor: default !important; }";
_ElementPicker._CURSOR_CROSSHAIR = "/* VS Code injected style */ * { cursor: crosshair !important; }";
let ElementPicker = _ElementPicker;
const _AreaPicker = class _AreaPicker {
  constructor(_onPicked, _onStopped) {
    this._onPicked = _onPicked;
    this._onStopped = _onStopped;
    this._selectionActive = false;
    this._onPointerDown = (e) => {
      if (!this._selectionActive || e.button !== 0) {
        return;
      }
      this._dragStart = { x: e.clientX, y: e.clientY };
      this._dragbox.style.display = "block";
      this._dragbox.style.left = `${e.clientX}px`;
      this._dragbox.style.top = `${e.clientY}px`;
      this._dragbox.style.width = "0px";
      this._dragbox.style.height = "0px";
      e.preventDefault();
      e.stopPropagation();
    };
    this._onPointerMove = (e) => {
      if (!this._selectionActive || !this._dragStart) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const left = Math.min(this._dragStart.x, e.clientX);
      const top = Math.min(this._dragStart.y, e.clientY);
      const width = Math.abs(e.clientX - this._dragStart.x);
      const height = Math.abs(e.clientY - this._dragStart.y);
      this._dragbox.style.left = `${left}px`;
      this._dragbox.style.top = `${top}px`;
      this._dragbox.style.width = `${width}px`;
      this._dragbox.style.height = `${height}px`;
    };
    this._onPointerUp = (e) => {
      if (!this._selectionActive || !this._dragStart) {
        return;
      }
      const start = this._dragStart;
      const left = Math.min(start.x, e.clientX);
      const top = Math.min(start.y, e.clientY);
      const width = Math.abs(e.clientX - start.x);
      const height = Math.abs(e.clientY - start.y);
      this._teardown();
      e.preventDefault();
      e.stopPropagation();
      if (width < _AreaPicker._MIN_AREA_PX || height < _AreaPicker._MIN_AREA_PX) {
        this._onStopped();
        return;
      }
      const vv = window.visualViewport;
      const offsetLeft = vv?.offsetLeft ?? 0;
      const offsetTop = vv?.offsetTop ?? 0;
      const rect = { x: left - offsetLeft, y: top - offsetTop, width, height };
      this._onPicked(rect);
    };
    this._onClick = (e) => {
      if (!this._selectionActive) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    this._onKeyDown = (e) => {
      if (!this._selectionActive) {
        return;
      }
      if (e.key === "Escape") {
        this.stop();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const shadowHost = document.createElement("div");
    shadowHost.setAttribute("data-vscode-area-pick-host", "");
    shadowHost.style.cssText = "position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
    const root = shadowHost.attachShadow({ mode: "closed" });
    root.appendChild(_AreaPicker._buildStyle());
    this._shadowHost = shadowHost;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    root.appendChild(overlay);
    const dragbox = document.createElement("div");
    dragbox.className = "dragbox";
    dragbox.style.display = "none";
    root.appendChild(dragbox);
    this._dragbox = dragbox;
  }
  start() {
    if (this._selectionActive) {
      return;
    }
    this._dragStart = void 0;
    document.documentElement.appendChild(this._shadowHost);
    this._selectionActive = true;
    const cursorStyle = document.createElement("style");
    cursorStyle.setAttribute("data-vscode-area-pick-cursor", "");
    cursorStyle.textContent = _AreaPicker._CURSOR_CROSSHAIR;
    document.head.appendChild(cursorStyle);
    this._cursorStylesheet = cursorStyle;
    window.addEventListener("pointermove", this._onPointerMove, true);
    window.addEventListener("pointerdown", this._onPointerDown, true);
    window.addEventListener("pointerup", this._onPointerUp, true);
    window.addEventListener("click", this._onClick, true);
    window.addEventListener("contextmenu", this._onClick, true);
    window.addEventListener("keydown", this._onKeyDown, true);
  }
  stop() {
    if (!this._selectionActive) {
      return;
    }
    this._teardown();
    this._onStopped();
  }
  /**
   * Synchronous teardown of the overlay, cursor style, and event listeners.
   * Used by both {@link stop} (which then fires `_onStopped`) and `_onPointerUp`
   * (which fires `_onPicked` or `_onStopped` after teardown completes, so the
   * IPC consumer can capture the page without our overlay in the frame).
   */
  _teardown() {
    this._selectionActive = false;
    this._shadowHost.remove();
    this._cursorStylesheet?.remove();
    this._cursorStylesheet = void 0;
    window.removeEventListener("pointermove", this._onPointerMove, true);
    window.removeEventListener("pointerdown", this._onPointerDown, true);
    window.removeEventListener("pointerup", this._onPointerUp, true);
    window.removeEventListener("click", this._onClick, true);
    window.removeEventListener("contextmenu", this._onClick, true);
    window.removeEventListener("keydown", this._onKeyDown, true);
    this._dragbox.style.display = "none";
    this._dragbox.style.left = "0px";
    this._dragbox.style.top = "0px";
    this._dragbox.style.width = "0px";
    this._dragbox.style.height = "0px";
    this._dragStart = void 0;
  }
  setTheme(theme) {
    this._shadowHost.style.setProperty("--vscode-focusBorder", theme?.focusBorder ?? null);
  }
  static _buildStyle() {
    const style = document.createElement("style");
    style.textContent = `
			:host {
				all: initial;
				pointer-events: none !important;
			}
			.overlay {
				position: fixed; inset: 0;
				background: transparent;
				z-index: 1;
				/* Capture hit-testing so pointer events don't reach the underlying
				 * page during a pick \u2014 otherwise hover/:hover styles would
				 * fire on elements beneath the cursor while we're dragging. */
				pointer-events: auto;
			}
			.dragbox {
				position: fixed; box-sizing: border-box;
				border: 1px dashed var(--vscode-focusBorder, #0078d4);
				background: color-mix(in srgb, var(--vscode-focusBorder, #0078d4) 12%, transparent);
				z-index: 2;
				pointer-events: auto;
			}
		`;
    return style;
  }
};
_AreaPicker._MIN_AREA_PX = 4;
_AreaPicker._CURSOR_CROSSHAIR = "/* VS Code injected style */ * { cursor: crosshair !important; }";
let AreaPicker = _AreaPicker;
init();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvcHJlbG9hZC1icm93c2VyVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qIGVzbGludC1kaXNhYmxlIG5vLXJlc3RyaWN0ZWQtZ2xvYmFscyAqL1xuLyogZXNsaW50LWRpc2FibGUgbm8tcmVzdHJpY3RlZC1zeW50YXggKi9cblxuLy8gT25seSBgaW1wb3J0IHR5cGVgIGlzIGFsbG93ZWQgaW4gcHJlbG9hZCBzY3JpcHRzIFx1MjAxNCBFbGVjdHJvbiBwcmVsb2FkcyBjYW5ub3QgcmVzb2x2ZSBtb2R1bGUgaW1wb3J0cyBhdCBydW50aW1lLlxuaW1wb3J0IHR5cGUgeyBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUsIElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlLCBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zLCBJQnJvd3NlclZpZXdQcmVsb2FkTG9jYWxpemVkU3RyaW5ncywgSUJyb3dzZXJWaWV3VGhlbWUsIElCcm93c2VyVmlld1JlY3QgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuXG5jb25zdCBjb21tZW50RWxlbWVudFNlbGVjdGlvbk1vZGUgPSAnY29tbWVudCcgYXMgQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlO1xubGV0IGxvY2FsaXplZFN0cmluZ3M6IElCcm93c2VyVmlld1ByZWxvYWRMb2NhbGl6ZWRTdHJpbmdzID0ge1xuXHRhZGRDb21tZW50OiAnQWRkIENvbW1lbnQnLFxuXHRhZGRDb21tZW50UGxhY2Vob2xkZXI6ICdBZGQgYSBjb21tZW50Jyxcblx0Y29tbWVudE9uU2VsZWN0ZWRFbGVtZW50OiAnQ29tbWVudCBvbiBzZWxlY3RlZCBlbGVtZW50Jyxcblx0ZWxlbWVudENvbW1lbnQ6ICdFbGVtZW50IGNvbW1lbnQgezB9Jyxcblx0ZWxlbWVudENvbW1lbnRXaXRoQm9keTogJ0VsZW1lbnQgY29tbWVudCB7MH06IHsxfScsXG5cdGVtcHR5RWxlbWVudENvbW1lbnQ6ICdFbXB0eSBlbGVtZW50IGNvbW1lbnQgezB9Jyxcblx0cmVtb3ZlQ29tbWVudDogJ1JlbW92ZSBDb21tZW50Jyxcblx0cmVtb3ZlRWxlbWVudENvbW1lbnQ6ICdSZW1vdmUgZWxlbWVudCBjb21tZW50Jyxcbn07XG5cbi8qKlxuICogUHJlbG9hZCBzY3JpcHQgZm9yIHBhZ2VzIGxvYWRlZCBpbiBJbnRlZ3JhdGVkIEJyb3dzZXJcbiAqXG4gKiBJdCBydW5zIGluIGFuIGlzb2xhdGVkIGNvbnRleHQgdGhhdCBFbGVjdHJvbiBjYWxscyBhbiBcImlzb2xhdGVkIHdvcmxkXCIuXG4gKiBTcGVjaWZpY2FsbHkgdGhlIGlzb2xhdGVkIHdvcmxkIHdpdGggd29ybGRJZCA5OTksIHdoaWNoIHNob3dzIGluIERldlRvb2xzIGFzIFwiRWxlY3Ryb24gSXNvbGF0ZWQgQ29udGV4dFwiLlxuICogRGVzcGl0ZSBiZWluZyBpc29sYXRlZCwgaXQgc3RpbGwgcnVucyBvbiB0aGUgc2FtZSBwYWdlIGFzIHRoZSBKUyBmcm9tIHRoZSBhY3R1YWwgbG9hZGVkIHdlYnNpdGVcbiAqIHdoaWNoIHJ1bnMgb24gdGhlIHNvLWNhbGxlZCBcIm1haW4gd29ybGRcIiAod29ybGRJZCAwLiBJbiBEZXZUb29scyBhcyBcInRvcFwiKS5cbiAqXG4gKiBMZWFybiBtb3JlOiBzZWUgRWxlY3Ryb24gZG9jcyBmb3IgU2VjdXJpdHksIGNvbnRleHRCcmlkZ2UsIGFuZCBDb250ZXh0IElzb2xhdGlvbi5cbiAqL1xuZnVuY3Rpb24gaW5pdCgpIHtcblx0Y29uc3QgeyBjb250ZXh0QnJpZGdlLCBpcGNSZW5kZXJlciB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcblxuXHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXHQvLyAjIyMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgISEhIERPIE5PVCBVU0UgR0VUL1NFVCBQUk9QRVJUSUVTIEFOWVdIRVJFIEhFUkUgISEhICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgISEhICBVTkxFU1MgVEhFIEFDQ0VTUyBJUyBXSVRIT1VUIFNJREUgRUZGRUNUUyAgISEhICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgKGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMjU1MTYpICAgICAgICMjI1xuXHQvLyAjIyMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMjI1xuXHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXG5cdC8vIEN0cmwvQ21kIGtleWJpbmRpbmdzIHRoYXQgY29ycmVzcG9uZCB0byBuYXRpdmUgZWRpdGluZyBzaG9ydGN1dHMgYW5kIHNob3VsZCBiZSBoYW5kbGVkIGJ5IHRoZSBicm93c2VyIC8gT1MgYW5kIG5vdCBmb3J3YXJkZWQgdG8gdGhlIHdvcmtiZW5jaC5cblx0Y29uc3QgbmF0aXZlQ3RybENtZEtleWJpbmRpbmdzID0ge1xuXHRcdG1hYzoge1xuXHRcdFx0YWx3YXlzOiBuZXcgU2V0KFsnYXJyb3d1cCcsICdhcnJvd2Rvd24nLCAnYXJyb3dsZWZ0JywgJ2Fycm93cmlnaHQnLCAnYmFja3NwYWNlJywgJ2RlbGV0ZSddKSxcblx0XHRcdG5vU2hpZnQ6IG5ldyBTZXQoWydhJywgJ2MnLCAndicsICd4JywgJ3onXSksXG5cdFx0XHR3aXRoU2hpZnQ6IG5ldyBTZXQoWyd2JywgJ3onXSksXG5cdFx0fSxcblx0XHRub25NYWM6IHtcblx0XHRcdGFsd2F5czogbmV3IFNldChbJ2Fycm93dXAnLCAnYXJyb3dkb3duJywgJ2Fycm93bGVmdCcsICdhcnJvd3JpZ2h0JywgJ2hvbWUnLCAnZW5kJywgJ2JhY2tzcGFjZScsICdkZWxldGUnXSksXG5cdFx0XHRub1NoaWZ0OiBuZXcgU2V0KFsnYScsICdjJywgJ3YnLCAneCcsICd6JywgJ3knXSksXG5cdFx0XHR3aXRoU2hpZnQ6IG5ldyBTZXQoWyd2JywgJ3onXSksXG5cdFx0fVxuXHR9O1xuXG5cdC8vIExpc3RlbiBmb3Iga2V5ZG93biBldmVudHMgdGhhdCB0aGUgcGFnZSBkaWQgbm90IGhhbmRsZSBhbmQgZm9yd2FyZCB0aGVtIGZvciBzaG9ydGN1dCBoYW5kbGluZy5cblx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZXZlbnQpID0+IHtcblx0XHQvLyBSZXF1aXJlIHRoYXQgdGhlIGV2ZW50IGlzIHRydXN0ZWQgLS0gaS5lLiB1c2VyLWluaXRpYXRlZC5cblx0XHRpZiAoIShldmVudCBpbnN0YW5jZW9mIEtleWJvYXJkRXZlbnQpIHx8ICFldmVudC5pc1RydXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgZXZlbnQgd2FzIGFscmVhZHkgaGFuZGxlZCBieSB0aGUgcGFnZSwgZG8gbm90IGZvcndhcmQgaXQuXG5cdFx0aWYgKGV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc05vbkVkaXRpbmdLZXkgPVxuXHRcdFx0ZXZlbnQua2V5ID09PSAnRXNjYXBlJyB8fFxuXHRcdFx0L15GXFxkKyQvLnRlc3QoZXZlbnQua2V5KSB8fFxuXHRcdFx0ZXZlbnQua2V5LnN0YXJ0c1dpdGgoJ0F1ZGlvJykgfHwgZXZlbnQua2V5LnN0YXJ0c1dpdGgoJ01lZGlhJykgfHwgZXZlbnQua2V5LnN0YXJ0c1dpdGgoJ0Jyb3dzZXInKTtcblxuXHRcdC8vIE9ubHkgZm9yd2FyZCBpZiB0aGVyZSdzIGEgY29tbWFuZCBtb2RpZmllciBvciBpdCdzIGEgbm9uLWVkaXRpbmcga2V5XG5cdFx0Ly8gKG1vc3QgcGxhaW4ga2V5IGV2ZW50cyBzaG91bGQganVzdCBiZSBoYW5kbGVkIG5hdGl2ZWx5IGJ5IHRoZSBicm93c2VyIGFuZCBub3QgZm9yd2FyZGVkKVxuXHRcdGlmICghKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQuYWx0S2V5IHx8IGV2ZW50Lm1ldGFLZXkpICYmICFpc05vbkVkaXRpbmdLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBOZXZlciBoYW5kbGUgcGxhaW4gbW9kaWZpZXIga2V5IHByZXNzZXMgYXMga2V5YmluZGluZ3Ncblx0XHRpZiAoZXZlbnQua2V5ID09PSAnQ29udHJvbCcgfHwgZXZlbnQua2V5ID09PSAnU2hpZnQnIHx8IGV2ZW50LmtleSA9PT0gJ0FsdCcgfHwgZXZlbnQua2V5ID09PSAnTWV0YScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc01hYyA9IG5hdmlnYXRvci5wbGF0Zm9ybS5pbmRleE9mKCdNYWMnKSA+PSAwO1xuXG5cdFx0Ly8gQWx0K0tleSBzcGVjaWFsIGNoYXJhY3RlciBoYW5kbGluZyAoQWx0ICsgTnVtcGFkIGtleXMgb24gV2luZG93cy9MaW51eCwgQWx0ICsgYW55IGtleSBvbiBNYWMpXG5cdFx0aWYgKGV2ZW50LmFsdEtleSAmJiAhZXZlbnQuY3RybEtleSAmJiAhZXZlbnQubWV0YUtleSkge1xuXHRcdFx0aWYgKGlzTWFjIHx8IC9eTnVtcGFkXFxkKyQvLnRlc3QoZXZlbnQuY29kZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFsbG93IFNoaWZ0K0YxMCBmb3IgY29udGV4dCBtZW51XG5cdFx0aWYgKGV2ZW50LmtleSA9PT0gJ0YxMCcgJiYgZXZlbnQuc2hpZnRLZXkgJiYgIWV2ZW50LmN0cmxLZXkgJiYgIWV2ZW50LmFsdEtleSAmJiAhZXZlbnQubWV0YUtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFsbG93IG5hdGl2ZSBzaG9ydGN1dHMgdG8gYmUgaGFuZGxlZCBieSB0aGUgYnJvd3NlclxuXHRcdGNvbnN0IGN0cmxDbWQgPSBpc01hYyA/IGV2ZW50Lm1ldGFLZXkgOiBldmVudC5jdHJsS2V5O1xuXHRcdGlmIChjdHJsQ21kICYmICFldmVudC5hbHRLZXkpIHtcblx0XHRcdGxldCBrZXkgPSBldmVudC5rZXkudG9Mb3dlckNhc2UoKTtcblx0XHRcdC8vIFByZWZlciByZW1hcHBlZCBMYXRpbiBsZXR0ZXJzLCBmYWxsaW5nIGJhY2sgdG8gdGhlIHBoeXNpY2FsIGtleSBmb3Igbm9uLUxhdGluIGxheW91dHMuXG5cdFx0XHRpZiAoIS9eW2Etel0kLy50ZXN0KGtleSkgJiYgL15LZXlbQS1aXSQvLnRlc3QoZXZlbnQuY29kZSkpIHtcblx0XHRcdFx0a2V5ID0gZXZlbnQuY29kZS5zbGljZSgzKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2V5U2V0c1RvQ2hlY2sgPSBbXG5cdFx0XHRcdG5hdGl2ZUN0cmxDbWRLZXliaW5kaW5nc1tpc01hYyA/ICdtYWMnIDogJ25vbk1hYyddLmFsd2F5cyxcblx0XHRcdFx0bmF0aXZlQ3RybENtZEtleWJpbmRpbmdzW2lzTWFjID8gJ21hYycgOiAnbm9uTWFjJ11bZXZlbnQuc2hpZnRLZXkgPyAnd2l0aFNoaWZ0JyA6ICdub1NoaWZ0J10sXG5cdFx0XHRdO1xuXHRcdFx0aWYgKGtleVNldHNUb0NoZWNrLnNvbWUoc2V0ID0+IHNldC5oYXMoa2V5KSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbW9qaSBwaWNrZXIgb24gTWFjXG5cdFx0XHRpZiAoaXNNYWMgJiYgZXZlbnQuY3RybEtleSAmJiAhZXZlbnQuc2hpZnRLZXkgJiYga2V5ID09PSAnICcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEV2ZXJ5dGhpbmcgZWxzZSBzaG91bGQgYmUgZm9yd2FyZGVkIHRvIHRoZSB3b3JrYmVuY2ggZm9yIHBvdGVudGlhbCBzaG9ydGN1dCBoYW5kbGluZy5cblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdGlwY1JlbmRlcmVyLnNlbmQoJ3ZzY29kZTpicm93c2VyVmlldzprZXlkb3duJywge1xuXHRcdFx0a2V5OiBldmVudC5rZXksXG5cdFx0XHRrZXlDb2RlOiBldmVudC5rZXlDb2RlLFxuXHRcdFx0Y29kZTogZXZlbnQuY29kZSxcblx0XHRcdGN0cmxLZXk6IGV2ZW50LmN0cmxLZXksXG5cdFx0XHRzaGlmdEtleTogZXZlbnQuc2hpZnRLZXksXG5cdFx0XHRhbHRLZXk6IGV2ZW50LmFsdEtleSxcblx0XHRcdG1ldGFLZXk6IGV2ZW50Lm1ldGFLZXksXG5cdFx0XHRyZXBlYXQ6IGV2ZW50LnJlcGVhdFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25zdCBlbGVtZW50UGlja2VyID0gbmV3IEVsZW1lbnRQaWNrZXIoXG5cdFx0KGVsLCBjb21tZW50KSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50SWQgPSB0cmFjayhlbCk7XG5cdFx0XHRpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6YnJvd3NlclZpZXc6ZWxlbWVudFBpY2tlZCcsIHsgZWxlbWVudElkLCBjb21tZW50IH0pO1xuXHRcdFx0cmV0dXJuIGVsZW1lbnRJZDtcblx0XHR9LFxuXHRcdGVsZW1lbnRJZCA9PiBpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6YnJvd3NlclZpZXc6ZWxlbWVudENvbW1lbnRSZW1vdmVkJywgZWxlbWVudElkKSxcblx0XHQoKSA9PiBpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6YnJvd3NlclZpZXc6ZWxlbWVudFBpY2tTdG9wcGVkJylcblx0KTtcblxuXHRjb25zdCBhcmVhUGlja2VyID0gbmV3IEFyZWFQaWNrZXIoXG5cdFx0cmVjdCA9PiBpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6YnJvd3NlclZpZXc6YXJlYVBpY2tlZCcsIHJlY3QpLFxuXHRcdCgpID0+IGlwY1JlbmRlcmVyLnNlbmQoJ3ZzY29kZTpicm93c2VyVmlldzphcmVhUGlja1N0b3BwZWQnKVxuXHQpO1xuXG5cdGNvbnN0IHRyYWNrZWRFbGVtZW50c0J5SWQgPSBuZXcgTWFwPHN0cmluZywgV2Vha1JlZjxFbGVtZW50Pj4oKTtcblx0Y29uc3QgZmluYWxpemF0aW9uUmVnaXN0cnkgPSBuZXcgRmluYWxpemF0aW9uUmVnaXN0cnk8c3RyaW5nPihpZCA9PiB7XG5cdFx0dHJhY2tlZEVsZW1lbnRzQnlJZC5kZWxldGUoaWQpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0cmFjayhlbGVtZW50OiBFbGVtZW50KTogc3RyaW5nIHtcblx0XHRjb25zdCBpZCA9IGBlbC0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YDtcblx0XHR0cmFja2VkRWxlbWVudHNCeUlkLnNldChpZCwgbmV3IFdlYWtSZWYoZWxlbWVudCkpO1xuXHRcdGZpbmFsaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKGVsZW1lbnQsIGlkKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblxuXHRsZXQgY29udGV4dE1lbnVUYXJnZXQ6IHsgcmVmOiBXZWFrUmVmPEVsZW1lbnQ+OyBhbmNob3I6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB9IHwgdW5kZWZpbmVkO1xuXHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCAoZXZlbnQpID0+IHtcblx0XHRpZiAoIWV2ZW50LmlzVHJ1c3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXQgPSBlbGVtZW50UGlja2VyLnJlc29sdmVDb250ZXh0TWVudVRhcmdldChldmVudCk7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0Y29uc3QgZWxzID0gW3RhcmdldF07XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoc2VsZWN0aW9uICYmICFzZWxlY3Rpb24uaXNDb2xsYXBzZWQpIHtcblx0XHRcdFx0ZWxzLnB1c2goc2VsZWN0aW9uLmFuY2hvck5vZGUgYXMgRWxlbWVudCwgc2VsZWN0aW9uLmZvY3VzTm9kZSBhcyBFbGVtZW50KTtcblx0XHRcdH1cblx0XHRcdGNvbnRleHRNZW51VGFyZ2V0ID0ge1xuXHRcdFx0XHRyZWY6IG5ldyBXZWFrUmVmKGZpbmRDb21tb25WaXNpYmxlQW5jZXN0b3IoZWxzKSA/PyB0YXJnZXQpLFxuXHRcdFx0XHRhbmNob3I6IHsgeDogZXZlbnQuY2xpZW50WCwgeTogZXZlbnQuY2xpZW50WSB9XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250ZXh0TWVudVRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0sIHsgY2FwdHVyZTogdHJ1ZSB9KTtcblxuXHQvLyBJbnZva2VkIG92ZXIgSVBDIHRvIHN1cHBvcnQgZnJhbWVzIChleGVjdXRlSmF2YVNjcmlwdEluSXNvbGF0ZWRXb3JsZCBkb2Vzbid0IGV4aXN0IG9uIFdlYkZyYW1lTWFpbikuXG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6c2V0VGhlbWUnLCAoX2V2ZW50OiB1bmtub3duLCB0aGVtZTogSUJyb3dzZXJWaWV3VGhlbWUpID0+IHtcblx0XHRlbGVtZW50UGlja2VyLnNldFRoZW1lKHRoZW1lKTtcblx0XHRhcmVhUGlja2VyLnNldFRoZW1lKHRoZW1lKTtcblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6c2V0TG9jYWxpemVkU3RyaW5ncycsIChfZXZlbnQ6IHVua25vd24sIHN0cmluZ3M6IElCcm93c2VyVmlld1ByZWxvYWRMb2NhbGl6ZWRTdHJpbmdzKSA9PiB7XG5cdFx0bG9jYWxpemVkU3RyaW5ncyA9IHN0cmluZ3M7XG5cdFx0ZWxlbWVudFBpY2tlci51cGRhdGVMb2NhbGl6ZWRTdHJpbmdzKCk7XG5cdH0pO1xuXHRpcGNSZW5kZXJlci5vbigndnNjb2RlOmJyb3dzZXJWaWV3OnN0YXJ0RWxlbWVudFBpY2tlcicsIChfZXZlbnQ6IHVua25vd24sIG9wdGlvbnM6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMpID0+IHtcblx0XHRlbGVtZW50UGlja2VyLnN0YXJ0KG9wdGlvbnMpO1xuXHR9KTtcblx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpicm93c2VyVmlldzpzdG9wRWxlbWVudFBpY2tlcicsIChfZXZlbnQ6IHVua25vd24pID0+IHtcblx0XHRlbGVtZW50UGlja2VyLnN0b3AoKTtcblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6c3RhcnRBcmVhUGlja2VyJywgKF9ldmVudDogdW5rbm93bikgPT4ge1xuXHRcdGFyZWFQaWNrZXIuc3RhcnQoKTtcblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6c3RvcEFyZWFQaWNrZXInLCAoX2V2ZW50OiB1bmtub3duKSA9PiB7XG5cdFx0YXJlYVBpY2tlci5zdG9wKCk7XG5cdH0pO1xuXHRpcGNSZW5kZXJlci5vbigndnNjb2RlOmJyb3dzZXJWaWV3OmhpZ2hsaWdodEVsZW1lbnQnLCAoX2V2ZW50OiB1bmtub3duLCB7IGVsZW1lbnRJZCB9OiB7IGVsZW1lbnRJZDogc3RyaW5nIH0pID0+IHtcblx0XHRjb25zdCBlbGVtZW50ID0gZ2V0RWxlbWVudChlbGVtZW50SWQpO1xuXHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRlbGVtZW50UGlja2VyLmhpZ2hsaWdodChlbGVtZW50KTtcblx0XHR9XG5cdH0pO1xuXHRpcGNSZW5kZXJlci5vbigndnNjb2RlOmJyb3dzZXJWaWV3OnNob3dFbGVtZW50Q29tbWVudCcsIChfZXZlbnQ6IHVua25vd24sIHsgZWxlbWVudElkIH06IHsgZWxlbWVudElkOiBzdHJpbmcgfSkgPT4ge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBnZXRFbGVtZW50KGVsZW1lbnRJZCk7XG5cdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdGVsZW1lbnRQaWNrZXIuY29tbWVudChlbGVtZW50LCBlbGVtZW50SWQgPT09ICdjb250ZXh0LW1lbnUtdGFyZ2V0JyA/IGNvbnRleHRNZW51VGFyZ2V0Py5hbmNob3IgOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6aGlkZUhpZ2hsaWdodCcsIChfZXZlbnQ6IHVua25vd24pID0+IHtcblx0XHRlbGVtZW50UGlja2VyLmhpZGVIaWdobGlnaHQoKTtcblx0fSk7XG5cdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6c2V0RWxlbWVudENvbW1lbnRzJywgKF9ldmVudDogdW5rbm93biwgdXBkYXRlOiBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSkgPT4ge1xuXHRcdGVsZW1lbnRQaWNrZXIudXBkYXRlQ29tbWVudHModXBkYXRlKTtcblx0fSk7XG5cblx0Y29uc3QgZ2V0RWxlbWVudCA9IChpZDogc3RyaW5nKTogRWxlbWVudCB8IG51bGwgPT4ge1xuXHRcdHN3aXRjaCAoaWQpIHtcblx0XHRcdGNhc2UgJ2FjdGl2ZSc6XG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdFx0Y2FzZSAnY29udGV4dC1tZW51LXRhcmdldCc6XG5cdFx0XHRcdHJldHVybiBjb250ZXh0TWVudVRhcmdldD8ucmVmLmRlcmVmKCkgPz8gbnVsbDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0cmFja2VkRWxlbWVudHNCeUlkLmdldChpZCk/LmRlcmVmKCkgPz8gbnVsbDtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgaXNvbGF0ZWRIZWxwZXJzID0ge1xuXHRcdC8qKlxuXHRcdCAqIEdldCB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHRleHQgaW4gdGhlIHBhZ2UuXG5cdFx0ICovXG5cdFx0Z2V0U2VsZWN0ZWRUZXh0KCk6IHN0cmluZyB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBFdmVuIGlmIHRoZSBwYWdlIGhhcyBvdmVycmlkZGVuIHdpbmRvdy5nZXRTZWxlY3Rpb24sIG91ciBjYWxsIGhlcmUgd2lsbCBzdGlsbCByZWFjaCB0aGUgb3JpZ2luYWxcblx0XHRcdFx0Ly8gaW1wbGVtZW50YXRpb24uIFRoYXQncyBiZWNhdXNlIEVsZWN0cm9uIHByb3hpZXMgZnVuY3Rpb25zLCBzdWNoIGFzIGdldFNlbGVjdGVkVGV4dCBoZXJlLCB0aGF0IGFyZVxuXHRcdFx0XHQvLyBleHBvc2VkIHRvIGEgZGlmZmVyZW50IGNvbnRleHQgdmlhIGV4cG9zZUluSXNvbGF0ZWRXb3JsZCBvciBleHBvc2VJbk1haW5Xb3JsZC5cblx0XHRcdFx0cmV0dXJuIHdpbmRvdy5nZXRTZWxlY3Rpb24oKT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdC8vIEdlbmVyYXRlIGEgdW5pcXVlIHRva2VuIGZvciB0aGlzIGZyYW1lIGluc3RhbmNlLiBUaGlzIHRva2VuIGlzIHVzZWQgdG9cblx0Ly8gY29ycmVsYXRlIHRoZSBFbGVjdHJvbiBXZWJGcmFtZU1haW4gKGF2YWlsYWJsZSB2aWEgSVBDIHNlbmRlckZyYW1lKSB3aXRoXG5cdC8vIHRoZSBDRFAgdGFyZ2V0IHNlc3Npb24gKGRpc2NvdmVyYWJsZSB2aWEgUnVudGltZS5ldmFsdWF0ZSBpbiB0aGUgbWFpbiB3b3JsZCkuXG5cdGNvbnN0IGZyYW1lVG9rZW4gPSBgZnJhbWUtJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpfWA7XG5cblx0Y29uc3QgbWFpbldvcmxkSGVscGVycyA9IHtcblx0XHRnZXRFbGVtZW50LFxuXHRcdC8qKiBPcGFxdWUgdG9rZW4gZXhwb3NlZCBmb3IgQ0RQLXNpZGUgZnJhbWUgbWF0Y2hpbmcuICovXG5cdFx0Z2V0RnJhbWVUb2tlbigpOiBzdHJpbmcgeyByZXR1cm4gZnJhbWVUb2tlbjsgfVxuXHR9O1xuXG5cdHRyeSB7XG5cdFx0Ly8gVXNlIGBjb250ZXh0QnJpZGdlYCBBUElzIHRvIGV4cG9zZSBnbG9iYWxzIHRvIHRoZSBzYW1lIGlzb2xhdGVkIHdvcmxkIHdoZXJlIHRoaXMgcHJlbG9hZCBzY3JpcHQgcnVucyAod29ybGRJZCA5OTkpLlxuXHRcdC8vIFRoZSBpc29sYXRlZEhlbHBlcnMgb2JqZWN0IHdpbGwgYmUgcmVjdXJzaXZlbHkgZnJvemVuIChhbmQgZm9yIGZ1bmN0aW9ucyBhbHNvIHByb3hpZWQpIGJ5IEVsZWN0cm9uIHRvIHByZXZlbnRcblx0XHQvLyBtb2RpZmljYXRpb24gd2l0aGluIHRoZSBnaXZlbiBjb250ZXh0LlxuXHRcdGNvbnRleHRCcmlkZ2UuZXhwb3NlSW5Jc29sYXRlZFdvcmxkKDk5OSwgJ2Jyb3dzZXJWaWV3QVBJJywgaXNvbGF0ZWRIZWxwZXJzKTtcblx0XHQvLyBFeHBvc2UgaGVscGVycyBvbiBgd2luZG93Ll9fdnNjb2RlX2hlbHBlcnNgIGluIHRoZSBwYWdlJ3MgbWFpbiB3b3JsZFxuXHRcdC8vIGZvciBDRFAgYFJ1bnRpbWUuZXZhbHVhdGVgICh3aGljaCBydW5zIGFnYWluc3QgdGhlIG1haW4gd29ybGQpIHRvIHVzZS5cblx0XHRjb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdfX3ZzY29kZV9oZWxwZXJzJywgbWFpbldvcmxkSGVscGVycyk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0Y29uc29sZS5lcnJvcihlcnJvcik7XG5cdH1cblxuXHRpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6YnJvd3NlclZpZXc6cHJlbG9hZFJlYWR5JywgZnJhbWVUb2tlbik7XG59XG5cbi8qKlxuICogRmluZCB0aGUgZGVlcGVzdCBlbGVtZW50IHRoYXQgY29udGFpbnMgZXZlcnkgZWxlbWVudCBpbiBgY2FuZGlkYXRlc2AuXG4gKiBXYWxrcyB1cCBgcGFyZW50RWxlbWVudGAgZnJvbSBlYWNoIGNhbmRpZGF0ZSB0byBidWlsZCBjaGFpbnMsIHRoZW5cbiAqIHJldHVybnMgdGhlIGxhc3Qgc2hhcmVkIGVsZW1lbnQuIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgdGhlIGNoYWluc1xuICogZG9uJ3Qgb3ZlcmxhcCAoc2hvdWxkbid0IGhhcHBlbiBmb3IgZWxlbWVudHMgaW4gdGhlIHNhbWUgZG9jdW1lbnQpLlxuICovXG5mdW5jdGlvbiBmaW5kQ29tbW9uVmlzaWJsZUFuY2VzdG9yKGNhbmRpZGF0ZXM6IHJlYWRvbmx5IChOb2RlIHwgbnVsbCB8IHVuZGVmaW5lZClbXSk6IEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmaWx0ZXJlZE5vZGVzID0gY2FuZGlkYXRlcy5maWx0ZXIoYyA9PiAhIWMpIGFzIE5vZGVbXTtcblx0Y29uc3QgdW5pcXVlID0gWy4uLm5ldyBTZXQoZmlsdGVyZWROb2Rlcy5tYXAobm9kZSA9PiBub2RlIGluc3RhbmNlb2YgRWxlbWVudCA/IG5vZGUgOiBub2RlLnBhcmVudEVsZW1lbnQpLmZpbHRlcihlID0+ICEhZSkpXSBhcyBFbGVtZW50W107XG5cdGlmICh1bmlxdWUubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIEZpbmQgdGhlIG5lYXJlc3QgdmlzaWJsZSBhbmNlc3RvciBvZiBhIHNpbmdsZSBlbGVtZW50LlxuXHRjb25zdCBmaW5kVmlzaWJsZSA9IChlbDogRWxlbWVudCk6IEVsZW1lbnQgPT4ge1xuXHRcdGZvciAobGV0IGN1cjogRWxlbWVudCB8IG51bGwgPSBlbDsgY3VyOyBjdXIgPSBjdXIucGFyZW50RWxlbWVudCkge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBjdXIgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCA/IGN1ci5vZmZzZXRXaWR0aCA6IGN1ci5jbGllbnRXaWR0aDtcblx0XHRcdGNvbnN0IGhlaWdodCA9IGN1ciBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ID8gY3VyLm9mZnNldEhlaWdodCA6IGN1ci5jbGllbnRIZWlnaHQ7XG5cdFx0XHRpZiAod2lkdGggPiAwICYmIGhlaWdodCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIGN1cjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGVsO1xuXHR9O1xuXG5cdGlmICh1bmlxdWUubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIGZpbmRWaXNpYmxlKHVuaXF1ZVswXSk7XG5cdH1cblxuXHQvLyBCdWlsZCB0aGUgYW5jZXN0b3IgY2hhaW4gZm9yIHRoZSBmaXJzdCBjYW5kaWRhdGUgKHJvb3QgXHUyMTkyIGVsZW1lbnQpLlxuXHRjb25zdCBmaXJzdENoYWluOiBFbGVtZW50W10gPSBbXTtcblx0Zm9yIChsZXQgY3VyOiBFbGVtZW50IHwgbnVsbCA9IHVuaXF1ZVswXTsgY3VyOyBjdXIgPSBjdXIucGFyZW50RWxlbWVudCkge1xuXHRcdGZpcnN0Q2hhaW4udW5zaGlmdChjdXIpO1xuXHR9XG5cblx0Ly8gUmVkdWNlIHRvIGNoYWluIHByZWZpeCBzaGFyZWQgd2l0aCBldmVyeSBvdGhlciBjYW5kaWRhdGUuXG5cdGxldCBjb21tb24gPSBmaXJzdENoYWluO1xuXHRmb3IgKGxldCBpID0gMTsgaSA8IHVuaXF1ZS5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IG90aGVyQ2hhaW46IEVsZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGN1cjogRWxlbWVudCB8IG51bGwgPSB1bmlxdWVbaV07IGN1cjsgY3VyID0gY3VyLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdG90aGVyQ2hhaW4udW5zaGlmdChjdXIpO1xuXHRcdH1cblx0XHRsZXQgaiA9IDA7XG5cdFx0Y29uc3QgbGltaXQgPSBNYXRoLm1pbihjb21tb24ubGVuZ3RoLCBvdGhlckNoYWluLmxlbmd0aCk7XG5cdFx0d2hpbGUgKGogPCBsaW1pdCAmJiBjb21tb25bal0gPT09IG90aGVyQ2hhaW5bal0pIHtcblx0XHRcdGorKztcblx0XHR9XG5cdFx0Y29tbW9uID0gY29tbW9uLnNsaWNlKDAsIGopO1xuXHRcdGlmIChjb21tb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmluZFZpc2libGUoY29tbW9uW2NvbW1vbi5sZW5ndGggLSAxXSk7XG59XG5cbi8qKlxuICogRWxlbWVudC1waWNrIGNvbnRyb2xsZXIgdXNlZCBieSB0aGUgXCJBZGQgRWxlbWVudCB0byBDaGF0XCIgZmxvdy5cbiAqXG4gKiBgc3RhcnQoeyB0aGVtZSB9KWAgbW91bnRzIGEgdHJhbnNwYXJlbnQgb3ZlcmxheSBvbiB0aGUgcGFnZSB0aGF0XG4gKiBoaWdobGlnaHRzIHRoZSBlbGVtZW50IHVuZGVyIHRoZSBwb2ludGVyIChjbGljaykgb3IgZmluZHMgdGhlIGRlZXBlc3RcbiAqIGNvbW1vbiBhbmNlc3RvciBvZiB0aGUgZWxlbWVudHMgY292ZXJlZCBieSBhIGNsaWNrK2RyYWcgcmVjdGFuZ2xlLiBPblxuICogc2VsZWN0aW9uIHRoZSBwaWNrZWQgYEVsZW1lbnRgIGlzIHJlZ2lzdGVyZWQgd2l0aCB0aGUgc2hhcmVkIGB0cmFjaygpYFxuICogaGVscGVyIGFuZCB0aGUgaG9zdCBpcyBub3RpZmllZCB3aXRoIHRoZSByZXN1bHRpbmcgaWQ7IHRoZSBvdmVybGF5IGlzXG4gKiB0aGVuIHRvcm4gZG93bi4gYHN0b3AoKWAgdGVhcnMgZG93biB3aXRob3V0IHBpY2tpbmcuXG4gKi9cbmNsYXNzIEVsZW1lbnRQaWNrZXIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRFJBR19USFJFU0hPTERfUFggPSA0O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VSU09SX0RFRkFVTFQgPSAnLyogVlMgQ29kZSBpbmplY3RlZCBzdHlsZSAqLyAqIHsgY3Vyc29yOiBkZWZhdWx0ICFpbXBvcnRhbnQ7IH0nO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VSU09SX0NST1NTSEFJUiA9ICcvKiBWUyBDb2RlIGluamVjdGVkIHN0eWxlICovICogeyBjdXJzb3I6IGNyb3NzaGFpciAhaW1wb3J0YW50OyB9JztcblxuXHRwcml2YXRlIF9zZWxlY3Rpb25BY3RpdmUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY29udGludW91cyA9IGZhbHNlO1xuXHRwcml2YXRlIF9jb21tZW50TW9kZSA9IGZhbHNlO1xuXG5cdC8vIERPTSBcdTIwMTQgY3JlYXRlZCBvbmNlIGluIHRoZSBjb25zdHJ1Y3RvciwgcmV1c2VkIGFjcm9zcyBzdGFydC9zdG9wIGN5Y2xlcy5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hhZG93SG9zdDogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRCYWNrZHJvcDogU1ZHU1ZHRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudEJhY2tkcm9wQ3V0b3V0OiBTVkdSZWN0RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGlnaGxpZ2h0U2hhcGU6IFNWR1JlY3RFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oaWdobGlnaHQ6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX292ZXJsYXk6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbDogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VsZWN0b3I6IEhUTUxTcGFuRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxDbGFzc2VzOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsRGltczogSFRNTFNwYW5FbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50UHJldmlldzogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRQcmV2aWV3Qm9keTogSFRNTFNwYW5FbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcmFnYm94OiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudExheWVyOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudENvbXBvc2VyOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudElucHV0OiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50U2VuZEJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIHsgdGFyZ2V0OiBFbGVtZW50OyBwaW46IEhUTUxEaXZFbGVtZW50OyBudW1iZXJFbGVtZW50OiBIVE1MU3BhbkVsZW1lbnQ7IGJvZHk6IHN0cmluZzsgb3JkaW5hbDogbnVtYmVyOyBvZmZzZXQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ29tbWVudHMgPSBuZXcgTWFwPHN0cmluZywgeyB0YXJnZXQ6IEVsZW1lbnQ7IGFuY2hvcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9OyBib2R5OiBzdHJpbmcgfT4oKTtcblxuXHQvLyBJbnRlcmFjdGlvbiBzdGF0ZSAocmVzZXQgb24gc3RvcClcblx0cHJpdmF0ZSBfZHJhZ1N0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RyYWdTdGFydFRhcmdldDogRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGlnaGxpZ2h0VGFyZ2V0OiBFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leHRlcm5hbEhpZ2hsaWdodFRhcmdldDogRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9jdXNlZFRhcmdldDogRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3Vyc29yU3R5bGVzaGVldDogSFRNTFN0eWxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzbWlzc2VkQ29tbWVudE9uUG9pbnRlckRvd24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfY29tbWVudFRhcmdldDogRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWVudEFuY2hvcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tZW50QmFja2Ryb3BUYXJnZXQ6IEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRCYWNrZHJvcFJlcXVlc3QgPSAwO1xuXHRwcml2YXRlIF9jb21tZW50UHJldmlld0VsZW1lbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tZW50UHJldmlld0hpZGVUaW1lb3V0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRQcmV2aWV3QW5pbWF0aW9uczogQW5pbWF0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBfY29tbWVudFByZXZpZXdDb2xsYXBzaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlZHVjZWRNb3Rpb24gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vblBpY2tlZDogKGVsZW1lbnQ6IEVsZW1lbnQsIGNvbW1lbnQ/OiBzdHJpbmcpID0+IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1lbnRSZW1vdmVkOiAoZWxlbWVudElkOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25TdG9wcGVkOiAoKSA9PiB2b2lkXG5cdCkge1xuXHRcdC8vIEJ1aWxkIHRoZSBzaGFkb3cgRE9NIHRyZWUgb25jZS4gVGhlIGhvc3QgaXMgYXBwZW5kZWQvcmVtb3ZlZCBmcm9tIHRoZVxuXHRcdC8vIGRvY3VtZW50IG9uIHN0YXJ0L3N0b3Agc28gdGhlIG92ZXJsYXkgb25seSBjYXB0dXJlcyBldmVudHMgd2hlbiBhY3RpdmUuXG5cdFx0Y29uc3Qgc2hhZG93SG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHNoYWRvd0hvc3Quc2V0QXR0cmlidXRlKCdkYXRhLXZzY29kZS1waWNrLWhvc3QnLCAnJyk7XG5cdFx0c2hhZG93SG9zdC5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAwOyBsZWZ0OiAwOyB3aWR0aDogMDsgaGVpZ2h0OiAwOyB6LWluZGV4OiAyMTQ3NDgzNjQ3OyBwb2ludGVyLWV2ZW50czogbm9uZTsnO1xuXHRcdGNvbnN0IHJvb3QgPSBzaGFkb3dIb3N0LmF0dGFjaFNoYWRvdyh7IG1vZGU6ICdjbG9zZWQnIH0pO1xuXHRcdHJvb3QuYXBwZW5kQ2hpbGQoRWxlbWVudFBpY2tlci5fYnVpbGRTdHlsZSgpKTtcblx0XHR0aGlzLl9zaGFkb3dIb3N0ID0gc2hhZG93SG9zdDtcblxuXHRcdGNvbnN0IHN2Z05hbWVzcGFjZSA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG5cdFx0Y29uc3QgY29tbWVudEJhY2tkcm9wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05hbWVzcGFjZSwgJ3N2ZycpO1xuXHRcdGNvbW1lbnRCYWNrZHJvcC5jbGFzc0xpc3QuYWRkKCdjb21tZW50LWJhY2tkcm9wJyk7XG5cdFx0Y29uc3QgYmFja2Ryb3BNYXNrSWQgPSBgdnNjb2RlLWNvbW1lbnQtY3V0b3V0LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YDtcblx0XHRjb25zdCBiYWNrZHJvcERlZmluaXRpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05hbWVzcGFjZSwgJ2RlZnMnKTtcblx0XHRjb25zdCBiYWNrZHJvcE1hc2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAnbWFzaycpO1xuXHRcdGJhY2tkcm9wTWFzay5pZCA9IGJhY2tkcm9wTWFza0lkO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ21hc2tVbml0cycsICd1c2VyU3BhY2VPblVzZScpO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ3gnLCAnMCcpO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ3knLCAnMCcpO1xuXHRcdGJhY2tkcm9wTWFzay5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzEwMCUnKTtcblx0XHRiYWNrZHJvcE1hc2suc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTAwJScpO1xuXHRcdGNvbnN0IGJhY2tkcm9wTWFza0ZpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAncmVjdCcpO1xuXHRcdGJhY2tkcm9wTWFza0ZpbGwuc2V0QXR0cmlidXRlKCd3aWR0aCcsICcxMDAlJyk7XG5cdFx0YmFja2Ryb3BNYXNrRmlsbC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICcxMDAlJyk7XG5cdFx0YmFja2Ryb3BNYXNrRmlsbC5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnd2hpdGUnKTtcblx0XHRjb25zdCBiYWNrZHJvcEN1dG91dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdyZWN0Jyk7XG5cdFx0YmFja2Ryb3BDdXRvdXQuc2V0QXR0cmlidXRlKCdmaWxsJywgJ2JsYWNrJyk7XG5cdFx0YmFja2Ryb3BNYXNrLmFwcGVuZChiYWNrZHJvcE1hc2tGaWxsLCBiYWNrZHJvcEN1dG91dCk7XG5cdFx0YmFja2Ryb3BEZWZpbml0aW9ucy5hcHBlbmRDaGlsZChiYWNrZHJvcE1hc2spO1xuXHRcdGNvbnN0IGJhY2tkcm9wRmlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdyZWN0Jyk7XG5cdFx0YmFja2Ryb3BGaWxsLmNsYXNzTGlzdC5hZGQoJ2NvbW1lbnQtYmFja2Ryb3AtZmlsbCcpO1xuXHRcdGJhY2tkcm9wRmlsbC5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzEwMCUnKTtcblx0XHRiYWNrZHJvcEZpbGwuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTAwJScpO1xuXHRcdGJhY2tkcm9wRmlsbC5zZXRBdHRyaWJ1dGUoJ21hc2snLCBgdXJsKCMke2JhY2tkcm9wTWFza0lkfSlgKTtcblx0XHRjb25zdCBoaWdobGlnaHRTaGFwZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdyZWN0Jyk7XG5cdFx0aGlnaGxpZ2h0U2hhcGUuY2xhc3NMaXN0LmFkZCgnaGlnaGxpZ2h0LXNoYXBlJyk7XG5cdFx0aGlnaGxpZ2h0U2hhcGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRjb21tZW50QmFja2Ryb3AuYXBwZW5kKGJhY2tkcm9wRGVmaW5pdGlvbnMsIGJhY2tkcm9wRmlsbCwgaGlnaGxpZ2h0U2hhcGUpO1xuXHRcdHJvb3QuYXBwZW5kQ2hpbGQoY29tbWVudEJhY2tkcm9wKTtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3AgPSBjb21tZW50QmFja2Ryb3A7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wQ3V0b3V0ID0gYmFja2Ryb3BDdXRvdXQ7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUgPSBoaWdobGlnaHRTaGFwZTtcblxuXHRcdGNvbnN0IGhpZ2hsaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGhpZ2hsaWdodC5jbGFzc05hbWUgPSAnaGlnaGxpZ2h0Jztcblx0XHRoaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRyb290LmFwcGVuZENoaWxkKGhpZ2hsaWdodCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0ID0gaGlnaGxpZ2h0O1xuXG5cdFx0Y29uc3QgY29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcblx0XHRjb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbi5jbGFzc05hbWUgPSAnY29tbWVudC1wcmV2aWV3LXJlbW92ZSc7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOYW1lc3BhY2UsICdzdmcnKTtcblx0XHRjb21tZW50UHJldmlld1JlbW92ZUljb24uc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAxNiAxNicpO1xuXHRcdGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvbi5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnY3VycmVudENvbG9yJyk7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvblBhdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAncGF0aCcpO1xuXHRcdGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvblBhdGguc2V0QXR0cmlidXRlKCdkJywgJ00zLjg1NCAzLjE0NmEuNS41IDAgMCAwLS43MDguNzA4TDcuMjkzIDhsLTQuMTQ3IDQuMTQ2YS41LjUgMCAwIDAgLjcwOC43MDhMOCA4LjcwN2w0LjE0NiA0LjE0N2EuNS41IDAgMCAwIC43MDgtLjcwOEw4LjcwNyA4bDQuMTQ3LTQuMTQ2YS41LjUgMCAwIDAtLjcwOC0uNzA4TDggNy4yOTMgMy44NTQgMy4xNDZaJyk7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVJY29uLmFwcGVuZENoaWxkKGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvblBhdGgpO1xuXHRcdGNvbW1lbnRQcmV2aWV3UmVtb3ZlQnV0dG9uLmFwcGVuZENoaWxkKGNvbW1lbnRQcmV2aWV3UmVtb3ZlSWNvbik7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24udGl0bGUgPSBsb2NhbGl6ZWRTdHJpbmdzLnJlbW92ZUNvbW1lbnQ7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5yZW1vdmVFbGVtZW50Q29tbWVudCk7XG5cdFx0Y29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlQ29tbWVudCh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24gPSBjb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbjtcblxuXHRcdGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRvdmVybGF5LmNsYXNzTmFtZSA9ICdvdmVybGF5Jztcblx0XHRyb290LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXHRcdHRoaXMuX292ZXJsYXkgPSBvdmVybGF5O1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRsYWJlbC5jbGFzc05hbWUgPSAnbGFiZWwnO1xuXHRcdGxhYmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZChsYWJlbCk7XG5cdFx0dGhpcy5fbGFiZWwgPSBsYWJlbDtcblxuXHRcdGNvbnN0IGxhYmVsSW5mbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRsYWJlbEluZm8uY2xhc3NOYW1lID0gJ2xhYmVsLWluZm8nO1xuXHRcdGxhYmVsLmFwcGVuZENoaWxkKGxhYmVsSW5mbyk7XG5cblx0XHRjb25zdCBsYWJlbFNlbGVjdG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGxhYmVsU2VsZWN0b3IuY2xhc3NOYW1lID0gJ2xhYmVsLXNlbGVjdG9yJztcblx0XHRsYWJlbEluZm8uYXBwZW5kQ2hpbGQobGFiZWxTZWxlY3Rvcik7XG5cdFx0dGhpcy5fbGFiZWxTZWxlY3RvciA9IGxhYmVsU2VsZWN0b3I7XG5cblx0XHRjb25zdCBsYWJlbENsYXNzZXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0bGFiZWxDbGFzc2VzLmNsYXNzTmFtZSA9ICdsYWJlbC1jbGFzc2VzJztcblx0XHRsYWJlbEluZm8uYXBwZW5kQ2hpbGQobGFiZWxDbGFzc2VzKTtcblx0XHR0aGlzLl9sYWJlbENsYXNzZXMgPSBsYWJlbENsYXNzZXM7XG5cblx0XHRjb25zdCBsYWJlbERpbXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0bGFiZWxEaW1zLmNsYXNzTmFtZSA9ICdsYWJlbC1kaW1zJztcblx0XHRsYWJlbC5hcHBlbmRDaGlsZChsYWJlbERpbXMpO1xuXHRcdHRoaXMuX2xhYmVsRGltcyA9IGxhYmVsRGltcztcblxuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29tbWVudFByZXZpZXcuY2xhc3NOYW1lID0gJ2NvbW1lbnQtc3VyZmFjZSBjb21tZW50LXByZXZpZXcnO1xuXHRcdGNvbW1lbnRQcmV2aWV3LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29tbWVudFByZXZpZXcuc2V0QXR0cmlidXRlKCdyb2xlJywgJ25vdGUnKTtcblx0XHRjb25zdCBjb21tZW50UHJldmlld0JvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0Y29tbWVudFByZXZpZXdCb2R5LmNsYXNzTmFtZSA9ICdjb21tZW50LXByZXZpZXctYm9keSc7XG5cdFx0Y29tbWVudFByZXZpZXcuYXBwZW5kQ2hpbGQoY29tbWVudFByZXZpZXdCb2R5KTtcblx0XHRjb21tZW50UHJldmlldy5hcHBlbmRDaGlsZChjb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbik7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZChjb21tZW50UHJldmlldyk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXcgPSBjb21tZW50UHJldmlldztcblx0XHR0aGlzLl9jb21tZW50UHJldmlld0JvZHkgPSBjb21tZW50UHJldmlld0JvZHk7XG5cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgW2hpZ2hsaWdodCwgbGFiZWwsIGNvbW1lbnRQcmV2aWV3XSkge1xuXHRcdFx0ZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4gdGhpcy5fY2FuY2VsQ29tbWVudFByZXZpZXdIaWRlKCkpO1xuXHRcdFx0ZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4gdGhpcy5fc2NoZWR1bGVDb21tZW50UHJldmlld0hpZGUoKSk7XG5cdFx0XHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzaW4nLCAoKSA9PiB0aGlzLl9jYW5jZWxDb21tZW50UHJldmlld0hpZGUoKSk7XG5cdFx0XHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3Vzb3V0JywgKCkgPT4gdGhpcy5fc2NoZWR1bGVDb21tZW50UHJldmlld0hpZGUoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHJhZ2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRyYWdib3guY2xhc3NOYW1lID0gJ2RyYWdib3gnO1xuXHRcdGRyYWdib3guc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRyb290LmFwcGVuZENoaWxkKGRyYWdib3gpO1xuXHRcdHRoaXMuX2RyYWdib3ggPSBkcmFnYm94O1xuXG5cdFx0Y29uc3QgY29tbWVudExheWVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29tbWVudExheWVyLmNsYXNzTmFtZSA9ICdjb21tZW50LWxheWVyJztcblx0XHRyb290LmFwcGVuZENoaWxkKGNvbW1lbnRMYXllcik7XG5cdFx0dGhpcy5fY29tbWVudExheWVyID0gY29tbWVudExheWVyO1xuXG5cdFx0Y29uc3QgY29tbWVudENvbXBvc2VyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29tbWVudENvbXBvc2VyLmNsYXNzTmFtZSA9ICdjb21tZW50LXN1cmZhY2UgY29tbWVudC1jb21wb3Nlcic7XG5cdFx0Y29tbWVudENvbXBvc2VyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29tbWVudENvbXBvc2VyLnNldEF0dHJpYnV0ZSgncm9sZScsICdkaWFsb2cnKTtcblx0XHRjb21tZW50Q29tcG9zZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5jb21tZW50T25TZWxlY3RlZEVsZW1lbnQpO1xuXHRcdGNvbW1lbnRDb21wb3Nlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbW9kYWwnLCAndHJ1ZScpO1xuXHRcdGNvbW1lbnRMYXllci5hcHBlbmRDaGlsZChjb21tZW50Q29tcG9zZXIpO1xuXHRcdHRoaXMuX2NvbW1lbnRDb21wb3NlciA9IGNvbW1lbnRDb21wb3NlcjtcblxuXHRcdGNvbnN0IGNvbW1lbnRJbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJyk7XG5cdFx0Y29tbWVudElucHV0LmNsYXNzTmFtZSA9ICdjb21tZW50LWlucHV0Jztcblx0XHRjb21tZW50SW5wdXQucm93cyA9IDE7XG5cdFx0Y29tbWVudElucHV0LnBsYWNlaG9sZGVyID0gbG9jYWxpemVkU3RyaW5ncy5hZGRDb21tZW50UGxhY2Vob2xkZXI7XG5cdFx0Y29tbWVudElucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplZFN0cmluZ3MuY29tbWVudE9uU2VsZWN0ZWRFbGVtZW50KTtcblx0XHRjb21tZW50SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB0aGlzLl9sYXlvdXRDb21tZW50SW5wdXQoKSk7XG5cdFx0Y29tbWVudElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInICYmICFldmVudC5pc0NvbXBvc2luZykge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLl9zdWJtaXRDb21tZW50KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29tbWVudENvbXBvc2VyLmFwcGVuZENoaWxkKGNvbW1lbnRJbnB1dCk7XG5cdFx0dGhpcy5fY29tbWVudElucHV0ID0gY29tbWVudElucHV0O1xuXG5cdFx0Y29uc3Qgc2VuZEJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuXHRcdHNlbmRCdXR0b24uY2xhc3NOYW1lID0gJ2NvbW1lbnQtc2VuZCc7XG5cdFx0c2VuZEJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdFx0Y29uc3Qgc2VuZEJ1dHRvbkljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAnc3ZnJyk7XG5cdFx0c2VuZEJ1dHRvbkljb24uc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAxNiAxNicpO1xuXHRcdHNlbmRCdXR0b25JY29uLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdjdXJyZW50Q29sb3InKTtcblx0XHRzZW5kQnV0dG9uSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBzZW5kQnV0dG9uSWNvblBhdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTmFtZXNwYWNlLCAncGF0aCcpO1xuXHRcdHNlbmRCdXR0b25JY29uUGF0aC5zZXRBdHRyaWJ1dGUoJ2QnLCAnTTguNSAzYS41LjUgMCAwIDAtMSAwdjQuNUgzYS41LjUgMCAwIDAgMCAxaDQuNVYxM2EuNS41IDAgMCAwIDEgMFY4LjVIMTNhLjUuNSAwIDAgMCAwLTFIOC41VjNaJyk7XG5cdFx0c2VuZEJ1dHRvbkljb24uYXBwZW5kQ2hpbGQoc2VuZEJ1dHRvbkljb25QYXRoKTtcblx0XHRzZW5kQnV0dG9uLmFwcGVuZENoaWxkKHNlbmRCdXR0b25JY29uKTtcblx0XHRzZW5kQnV0dG9uLnRpdGxlID0gbG9jYWxpemVkU3RyaW5ncy5hZGRDb21tZW50O1xuXHRcdHNlbmRCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5hZGRDb21tZW50KTtcblx0XHRzZW5kQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5fc3VibWl0Q29tbWVudCgpKTtcblx0XHRjb21tZW50Q29tcG9zZXIuYXBwZW5kQ2hpbGQoc2VuZEJ1dHRvbik7XG5cdFx0dGhpcy5fY29tbWVudFNlbmRCdXR0b24gPSBzZW5kQnV0dG9uO1xuXG5cdFx0Y29tbWVudENvbXBvc2VyLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQua2V5ICE9PSAnVGFiJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQuc2hpZnRLZXkgJiYgZXZlbnQudGFyZ2V0ID09PSBjb21tZW50SW5wdXQpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0c2VuZEJ1dHRvbi5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmICghZXZlbnQuc2hpZnRLZXkgJiYgZXZlbnQudGFyZ2V0ID09PSBzZW5kQnV0dG9uKSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGNvbW1lbnRJbnB1dC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Njcm9sbCcsICgpID0+IHRoaXMuX29uU2Nyb2xsT3JSZXNpemUoKSwgeyBwYXNzaXZlOiB0cnVlLCBjYXB0dXJlOiB0cnVlIH0pO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCAoKSA9PiB0aGlzLl9vblNjcm9sbE9yUmVzaXplKCkpO1xuXHR9XG5cblx0c3RhcnQob3B0aW9uczogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNlbGVjdGlvbk9wdGlvbnMob3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0dGhpcy5fY29tbWVudE1vZGUgPSBvcHRpb25zLm1vZGUgPT09IGNvbW1lbnRFbGVtZW50U2VsZWN0aW9uTW9kZTtcblx0XHR0aGlzLl9jb250aW51b3VzID0gb3B0aW9ucy5jb250aW51b3VzID8/IGZhbHNlO1xuXHRcdHRoaXMuX2Vuc3VyZU1vdW50ZWQoKTtcblx0XHR0aGlzLl9zZWxlY3Rpb25BY3RpdmUgPSB0cnVlO1xuXHRcdHRoaXMuX292ZXJsYXkuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cblx0XHQvLyBJbmplY3QgYSBzdHlsZXNoZWV0IGludG8gdGhlIHBhZ2UgdG8gb3ZlcnJpZGUgYWxsIGN1cnNvcnMgd2hpbGUgZWxlbWVudCBzZWxlY3Rpb24gaXMgYWN0aXZlLFxuXHRcdC8vIHNvIHRoZSBjdXJzb3IgYWx3YXlzIGFwcGVhcnMgYXMgYSBub3JtYWwgcG9pbnRlciBldmVuIHdoZW4gb3ZlciBlLmcuIGxpbmtzLlxuXHRcdC8vIFVwZGF0ZWQgdG8gY3Jvc3NoYWlyIGluIF9vblBvaW50ZXJEb3duLCByZXNldCBpbiBfb25Qb2ludGVyVXAuXG5cdFx0Y29uc3QgY3Vyc29yU3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdGN1cnNvclN0eWxlLnRleHRDb250ZW50ID0gRWxlbWVudFBpY2tlci5fQ1VSU09SX0RFRkFVTFQ7XG5cdFx0ZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChjdXJzb3JTdHlsZSk7XG5cdFx0dGhpcy5fY3Vyc29yU3R5bGVzaGVldCA9IGN1cnNvclN0eWxlO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgaGlnaC1mcmVxdWVuY3kgbGlzdGVuZXJzIG9ubHkgd2hpbGUgc2VsZWN0aW9uIGlzIGFjdGl2ZS5cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcm1vdmUnLCB0aGlzLl9vblBvaW50ZXJNb3ZlLCB0cnVlKTtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybGVhdmUnLCB0aGlzLl9vblBvaW50ZXJMZWF2ZSwgdHJ1ZSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJkb3duJywgdGhpcy5fb25Qb2ludGVyRG93biwgdHJ1ZSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsIHRoaXMuX29uUG9pbnRlclVwLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNpbicsIHRoaXMuX29uRm9jdXNJbiwgdHJ1ZSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCB0aGlzLl9vbldpbmRvd0JsdXIpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0cnVlKTtcblxuXHRcdGlmICghdGhpcy5fZXh0ZXJuYWxIaWdobGlnaHRUYXJnZXQpIHtcblx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gdGhpcy5fZ2V0Rm9jdXNlZEVsZW1lbnQoKTtcblx0XHRcdHRoaXMuX2ZvY3VzZWRUYXJnZXQgPSBvcHRpb25zLmhpZ2hsaWdodEZvY3VzZWRFbGVtZW50ID8gZm9jdXNlZEVsZW1lbnQgOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHQodGhpcy5fZm9jdXNlZFRhcmdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTZWxlY3Rpb25PcHRpb25zKG9wdGlvbnM6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNDb21tZW50TW9kZSA9IHRoaXMuX2NvbW1lbnRNb2RlO1xuXHRcdHRoaXMuX2NvbW1lbnRNb2RlID0gb3B0aW9ucy5tb2RlID09PSBjb21tZW50RWxlbWVudFNlbGVjdGlvbk1vZGU7XG5cdFx0dGhpcy5fY29udGludW91cyA9IG9wdGlvbnMuY29udGludW91cyA/PyBmYWxzZTtcblx0XHRpZiAod2FzQ29tbWVudE1vZGUgJiYgIXRoaXMuX2NvbW1lbnRNb2RlICYmIHRoaXMuX2NvbW1lbnRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX2Nsb3NlQ29tbWVudENvbXBvc2VyKCk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmhpZ2hsaWdodEZvY3VzZWRFbGVtZW50ICYmICF0aGlzLl9jb21tZW50VGFyZ2V0ICYmICF0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCAmJiAhdGhpcy5fZXh0ZXJuYWxIaWdobGlnaHRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX2ZvY3VzZWRUYXJnZXQgPSB0aGlzLl9nZXRGb2N1c2VkRWxlbWVudCgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2ZvY3VzZWRUYXJnZXQpO1xuXHRcdH1cblx0fVxuXG5cdHN0b3AoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uQWN0aXZlID0gZmFsc2U7XG5cdFx0dGhpcy5fY2xvc2VDb21tZW50Q29tcG9zZXIoKTtcblx0XHR0aGlzLl9vdmVybGF5LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0Py5yZW1vdmUoKTtcblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0ID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gUmVtb3ZlIGhpZ2gtZnJlcXVlbmN5IGxpc3RlbmVycy5cblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcm1vdmUnLCB0aGlzLl9vblBvaW50ZXJNb3ZlLCB0cnVlKTtcblx0XHRkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdwb2ludGVybGVhdmUnLCB0aGlzLl9vblBvaW50ZXJMZWF2ZSwgdHJ1ZSk7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJkb3duJywgdGhpcy5fb25Qb2ludGVyRG93biwgdHJ1ZSk7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsIHRoaXMuX29uUG9pbnRlclVwLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignZm9jdXNpbicsIHRoaXMuX29uRm9jdXNJbiwgdHJ1ZSk7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCB0aGlzLl9vbldpbmRvd0JsdXIpO1xuXHRcdHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0cnVlKTtcblxuXHRcdHRoaXMuX2hpZ2hsaWdodC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX2xhYmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX2RyYWdTdGFydCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kcmFnU3RhcnRUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGlzbWlzc2VkQ29tbWVudE9uUG9pbnRlckRvd24gPSBmYWxzZTtcblx0XHR0aGlzLl9oaWdobGlnaHRUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZm9jdXNlZFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fZXh0ZXJuYWxIaWdobGlnaHRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25TdG9wcGVkKCk7XG5cdFx0dGhpcy5fdW5tb3VudFdoZW5JZGxlKCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSB0aGVtZSBjb2xvcnMgYXBwbGllZCB0byB0aGUgb3ZlcmxheS5cblx0ICogQ2FuIGJlIGNhbGxlZCBhdCBhbnkgdGltZTsgdGFrZXMgZWZmZWN0IGltbWVkaWF0ZWx5LlxuXHQgKi9cblx0c2V0VGhlbWUodGhlbWU6IElCcm93c2VyVmlld1RoZW1lKTogdm9pZCB7XG5cdFx0RWxlbWVudFBpY2tlci5fYXBwbHlUaGVtZSh0aGlzLl9zaGFkb3dIb3N0LCB0aGVtZSk7XG5cdFx0dGhpcy5fcmVkdWNlZE1vdGlvbiA9IHRoZW1lLnJlZHVjZWRNb3Rpb24gPz8gZmFsc2U7XG5cdFx0dGhpcy5fc2hhZG93SG9zdC5jbGFzc0xpc3QudG9nZ2xlKCdyZWR1Y2UtbW90aW9uJywgdGhpcy5fcmVkdWNlZE1vdGlvbik7XG5cdH1cblxuXHR1cGRhdGVMb2NhbGl6ZWRTdHJpbmdzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FwcGx5TG9jYWxpemVkU3RyaW5ncygpO1xuXHR9XG5cblx0cmVzb2x2ZUNvbnRleHRNZW51VGFyZ2V0KGV2ZW50OiBNb3VzZUV2ZW50KTogRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkICYmIGV2ZW50LmNvbXBvc2VkUGF0aCgpLmluY2x1ZGVzKHRoaXMuX3NoYWRvd0hvc3QpKSB7XG5cdFx0XHR0aGlzLl9oaWRlQWN0aXZlQ29tbWVudFByZXZpZXcoKTtcblx0XHRcdHJldHVybiB0aGlzLl9waWNrRWxlbWVudEF0KGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCA/IGV2ZW50LnRhcmdldCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWdobGlnaHQgYSBzcGVjaWZpYyBlbGVtZW50IHdpdGhvdXQgc3RhcnRpbmcgYSBwaWNrIHNlc3Npb24uXG5cdCAqIE1vdW50cyB0aGUgc2hhZG93IGhvc3QgaWYgbm90IGFscmVhZHkgaW4gdGhlIGRvY3VtZW50LlxuXHQgKi9cblx0aGlnaGxpZ2h0KGVsZW1lbnQ6IEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVNb3VudGVkKCk7XG5cdFx0dGhpcy5fZXh0ZXJuYWxIaWdobGlnaHRUYXJnZXQgPSBlbGVtZW50O1xuXHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodChlbGVtZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWRlIGFueSBjdXJyZW50IGhpZ2hsaWdodC4gSWYgbm8gcGljayBzZXNzaW9uIGlzIGFjdGl2ZSwgYWxzb1xuXHQgKiByZW1vdmVzIHRoZSBzaGFkb3cgaG9zdCBmcm9tIHRoZSBkb2N1bWVudC5cblx0ICovXG5cdGhpZGVIaWdobGlnaHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZXh0ZXJuYWxIaWdobGlnaHRUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUYXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fdW5tb3VudFdoZW5JZGxlKCk7XG5cdH1cblxuXHRjb21tZW50KGVsZW1lbnQ6IEVsZW1lbnQsIGFuY2hvcj86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdH1cblx0XHR0aGlzLnN0YXJ0KHsgbW9kZTogY29tbWVudEVsZW1lbnRTZWxlY3Rpb25Nb2RlIH0pO1xuXHRcdGNvbnN0IGJvdW5kcyA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0dGhpcy5fc2hvd0NvbW1lbnRDb21wb3NlcihlbGVtZW50LCBhbmNob3IgPz8ge1xuXHRcdFx0eDogYm91bmRzLmxlZnQgKyBib3VuZHMud2lkdGggLyAyLFxuXHRcdFx0eTogYm91bmRzLnRvcCArIGJvdW5kcy5oZWlnaHQgLyAyXG5cdFx0fSk7XG5cdH1cblxuXHR1cGRhdGVDb21tZW50cyh1cGRhdGU6IElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlKTogdm9pZCB7XG5cdFx0aWYgKHVwZGF0ZS5jb21tZW50cykge1xuXHRcdFx0Y29uc3QgaW5jb21pbmcgPSBuZXcgTWFwKHVwZGF0ZS5jb21tZW50cy5tYXAoKGNvbW1lbnQsIGluZGV4KSA9PiBbY29tbWVudC5lbGVtZW50SWQsIHsgYm9keTogY29tbWVudC5ib2R5LCBvcmRpbmFsOiBpbmRleCArIDEgfV0pKTtcblx0XHRcdGZvciAoY29uc3QgW2VsZW1lbnRJZCwgY29tbWVudF0gb2YgdGhpcy5fY29tbWVudHMpIHtcblx0XHRcdFx0Y29uc3QgaW5jb21pbmdDb21tZW50ID0gaW5jb21pbmcuZ2V0KGVsZW1lbnRJZCk7XG5cdFx0XHRcdGlmICghaW5jb21pbmdDb21tZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJDb21tZW50UHJldmlldyhjb21tZW50LnRhcmdldCk7XG5cdFx0XHRcdFx0Y29tbWVudC5waW4ucmVtb3ZlKCk7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWVudHMuZGVsZXRlKGVsZW1lbnRJZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29tbWVudC5vcmRpbmFsID0gaW5jb21pbmdDb21tZW50Lm9yZGluYWw7XG5cdFx0XHRcdFx0aWYgKGluY29taW5nQ29tbWVudC5ib2R5ID09PSBjb21tZW50LmJvZHkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb21tZW50LmJvZHkgPSBpbmNvbWluZ0NvbW1lbnQuYm9keTtcblx0XHRcdFx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQgPT09IGVsZW1lbnRJZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2V0Q29tbWVudFByZXZpZXdCb2R5KGluY29taW5nQ29tbWVudC5ib2R5KTtcblx0XHRcdFx0XHRcdHRoaXMuX3JlbmRlckhpZ2hsaWdodChjb21tZW50LnRhcmdldCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtlbGVtZW50SWQsIGNvbW1lbnRdIG9mIGluY29taW5nKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jb21tZW50cy5oYXMoZWxlbWVudElkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nQ29tbWVudHMuZ2V0KGVsZW1lbnRJZCk7XG5cdFx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlQ29tbWVudFBpbihlbGVtZW50SWQsIHBlbmRpbmcudGFyZ2V0LCBwZW5kaW5nLmFuY2hvciwgY29tbWVudC5ib2R5LCBjb21tZW50Lm9yZGluYWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZWxlbWVudElkIG9mIHVwZGF0ZS5wZW5kaW5nQ29tbWVudElkc1RvRGlzY2FyZCA/PyBbXSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NvbW1lbnRzLmRlbGV0ZShlbGVtZW50SWQpO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVDb21tZW50UGluTnVtYmVycygpO1xuXHRcdHRoaXMuX3VubW91bnRXaGVuSWRsZSgpO1xuXHR9XG5cblx0Ly8gLS0tIEV2ZW50IGhhbmRsZXJzIC0tLVxuXG5cdHByaXZhdGUgX29uUG9pbnRlck1vdmUgPSAoZTogUG9pbnRlckV2ZW50KTogdm9pZCA9PiB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUYXJnZXQgfHwgdGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQgfHwgdGhpcy5fZXh0ZXJuYWxIaWdobGlnaHRUYXJnZXQgfHwgZS5jb21wb3NlZFBhdGgoKS5pbmNsdWRlcyh0aGlzLl9zaGFkb3dIb3N0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRpZiAoIXRoaXMuX2RyYWdTdGFydCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX3BpY2tFbGVtZW50QXQoZS5jbGllbnRYLCBlLmNsaWVudFkpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZHggPSBNYXRoLmFicyhlLmNsaWVudFggLSB0aGlzLl9kcmFnU3RhcnQueCk7XG5cdFx0Y29uc3QgZHkgPSBNYXRoLmFicyhlLmNsaWVudFkgLSB0aGlzLl9kcmFnU3RhcnQueSk7XG5cdFx0aWYgKGR4IDwgRWxlbWVudFBpY2tlci5fRFJBR19USFJFU0hPTERfUFggJiYgZHkgPCBFbGVtZW50UGlja2VyLl9EUkFHX1RIUkVTSE9MRF9QWCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsZWZ0ID0gTWF0aC5taW4odGhpcy5fZHJhZ1N0YXJ0LngsIGUuY2xpZW50WCk7XG5cdFx0Y29uc3QgdG9wID0gTWF0aC5taW4odGhpcy5fZHJhZ1N0YXJ0LnksIGUuY2xpZW50WSk7XG5cdFx0aWYgKHRoaXMuX2RyYWdib3gpIHtcblx0XHRcdHRoaXMuX2RyYWdib3guc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblx0XHRcdHRoaXMuX2RyYWdib3guc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdHRoaXMuX2RyYWdib3guc3R5bGUud2lkdGggPSBgJHtkeH1weGA7XG5cdFx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLmhlaWdodCA9IGAke2R5fXB4YDtcblx0XHR9XG5cdFx0Ly8gTGl2ZSBwcmV2aWV3IG9mIHRoZSBkZWVwZXN0IGNvbW1vbiBhbmNlc3RvciB0aGF0IHRoZSByZWdpb25cblx0XHQvLyBjdXJyZW50bHkgcmVzb2x2ZXMgdG8sIHNvIHRoZSB1c2VyIHNlZXMgZXhhY3RseSB3aGF0IHdpbGwgYmVcblx0XHQvLyBzZWxlY3RlZCBpZiB0aGV5IHJlbGVhc2UgdGhlIGRyYWcgbm93LlxuXHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh0aGlzLl9waWNrUmVnaW9uQW5jZXN0b3IoeyB4OiBsZWZ0LCB5OiB0b3AsIHdpZHRoOiBkeCwgaGVpZ2h0OiBkeSB9KSk7XG5cdH07XG5cblx0cHJpdmF0ZSBfb25Qb2ludGVyTGVhdmUgPSAoKTogdm9pZCA9PiB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUgfHwgdGhpcy5fY29tbWVudFRhcmdldCB8fCB0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCB8fCB0aGlzLl9leHRlcm5hbEhpZ2hsaWdodFRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2RyYWdTdGFydCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2ZvY3VzZWRUYXJnZXQpO1xuXHRcdH1cblx0fTtcblxuXHRwcml2YXRlIF9vblBvaW50ZXJEb3duID0gKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc21pc3NlZENvbW1lbnRPblBvaW50ZXJEb3duID0gZmFsc2U7XG5cdFx0aWYgKGUuY29tcG9zZWRQYXRoKCkuaW5jbHVkZXModGhpcy5fc2hhZG93SG9zdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX2Rpc21pc3NlZENvbW1lbnRPblBvaW50ZXJEb3duID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2ZpbmlzaENvbW1lbnRJbnRlcmFjdGlvbigpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZHJhZ1N0YXJ0ID0geyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9O1xuXHRcdHRoaXMuX2RyYWdTdGFydFRhcmdldCA9IHRoaXMuX3BpY2tFbGVtZW50QXQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuXHRcdGlmICh0aGlzLl9jdXJzb3JTdHlsZXNoZWV0KSB7XG5cdFx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0LnRleHRDb250ZW50ID0gRWxlbWVudFBpY2tlci5fQ1VSU09SX0NST1NTSEFJUjtcblx0XHR9XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdH07XG5cblx0cHJpdmF0ZSBfb25Qb2ludGVyVXAgPSAoZTogUG9pbnRlckV2ZW50KTogdm9pZCA9PiB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2Rpc21pc3NlZENvbW1lbnRPblBvaW50ZXJEb3duKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5jb21wb3NlZFBhdGgoKS5pbmNsdWRlcyh0aGlzLl9zaGFkb3dIb3N0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2RyYWdTdGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkeCA9IE1hdGguYWJzKGUuY2xpZW50WCAtIHRoaXMuX2RyYWdTdGFydC54KTtcblx0XHRjb25zdCBkeSA9IE1hdGguYWJzKGUuY2xpZW50WSAtIHRoaXMuX2RyYWdTdGFydC55KTtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX2RyYWdTdGFydDtcblx0XHR0aGlzLl9kcmFnU3RhcnQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2N1cnNvclN0eWxlc2hlZXQpIHtcblx0XHRcdHRoaXMuX2N1cnNvclN0eWxlc2hlZXQudGV4dENvbnRlbnQgPSBFbGVtZW50UGlja2VyLl9DVVJTT1JfREVGQVVMVDtcblx0XHR9XG5cblx0XHRpZiAoZHggPCBFbGVtZW50UGlja2VyLl9EUkFHX1RIUkVTSE9MRF9QWCAmJiBkeSA8IEVsZW1lbnRQaWNrZXIuX0RSQUdfVEhSRVNIT0xEX1BYKSB7XG5cdFx0XHQvLyBDbGljayBcdTIxOTIgcGljayB0aGUgZWxlbWVudCB1bmRlciB0aGUgcG9pbnRlci5cblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2RyYWdTdGFydFRhcmdldCA/PyB0aGlzLl9waWNrRWxlbWVudEF0KGUuY2xpZW50WCwgZS5jbGllbnRZKTtcblx0XHRcdHRoaXMuX2RyYWdTdGFydFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWl0KHRhcmdldCwgeyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRHJhZyBcdTIxOTIgcGljayB0aGUgZGVlcGVzdCBjb21tb24gYW5jZXN0b3Igb2YgdGhlIHJlZ2lvbi5cblx0XHRcdHRoaXMuX2RyYWdTdGFydFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9kcmFnYm94KSB7XG5cdFx0XHRcdHRoaXMuX2RyYWdib3guc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH1cblx0XHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgbGVmdCA9IE1hdGgubWluKHN0YXJ0LngsIGUuY2xpZW50WCk7XG5cdFx0XHRjb25zdCB0b3AgPSBNYXRoLm1pbihzdGFydC55LCBlLmNsaWVudFkpO1xuXHRcdFx0Y29uc3QgYW5jZXN0b3IgPSB0aGlzLl9waWNrUmVnaW9uQW5jZXN0b3IoeyB4OiBsZWZ0LCB5OiB0b3AsIHdpZHRoOiBkeCwgaGVpZ2h0OiBkeSB9KTtcblx0XHRcdGlmIChhbmNlc3Rvcikge1xuXHRcdFx0XHR0aGlzLl9jb21taXQoYW5jZXN0b3IsIHsgeDogZS5jbGllbnRYLCB5OiBlLmNsaWVudFkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uQ2xpY2sgPSAoZTogRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGlzbWlzc2VkQ29tbWVudE9uUG9pbnRlckRvd24pIHtcblx0XHRcdHRoaXMuX2Rpc21pc3NlZENvbW1lbnRPblBvaW50ZXJEb3duID0gZmFsc2U7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5jb21wb3NlZFBhdGgoKS5pbmNsdWRlcyh0aGlzLl9zaGFkb3dIb3N0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0fTtcblxuXHRwcml2YXRlIF9vbkZvY3VzSW4gPSAoZXZlbnQ6IEZvY3VzRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSB8fCB0aGlzLl9jb21tZW50VGFyZ2V0IHx8IHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChldmVudC5jb21wb3NlZFBhdGgoKS5pbmNsdWRlcyh0aGlzLl9zaGFkb3dIb3N0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IHRoaXMuX2dldEZvY3VzZWRFbGVtZW50KCk7XG5cdFx0dGhpcy5fZm9jdXNlZFRhcmdldCA9IGZvY3VzZWRFbGVtZW50Py5tYXRjaGVzKCc6Zm9jdXMtdmlzaWJsZScpID8gZm9jdXNlZEVsZW1lbnQgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2ZvY3VzZWRUYXJnZXQpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uV2luZG93Qmx1ciA9ICgpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSB8fCB0aGlzLl9jb21tZW50VGFyZ2V0IHx8IHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2ZvY3VzZWRUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHVuZGVmaW5lZCk7XG5cdH07XG5cblx0cHJpdmF0ZSBfb25LZXlEb3duID0gKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9jb21tZW50VGFyZ2V0O1xuXHRcdFx0XHR0aGlzLl9maW5pc2hDb21tZW50SW50ZXJhY3Rpb24oKTtcblx0XHRcdFx0dGhpcy5fZm9jdXNDb21tZW50VGFyZ2V0KHRhcmdldCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicgJiYgIWUuaXNDb21wb3NpbmcpIHtcblx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gdGhpcy5fZ2V0Rm9jdXNlZEVsZW1lbnQoKTtcblx0XHRcdGlmIChmb2N1c2VkRWxlbWVudCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2NvbW1pdChmb2N1c2VkRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdHByaXZhdGUgX29uU2Nyb2xsT3JSZXNpemUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRQcmV2aWV3Q29sbGFwc2luZykge1xuXHRcdFx0dGhpcy5faGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NhbmNlbENvbW1lbnRQcmV2aWV3QW5pbWF0aW9ucygpO1xuXHRcdGlmICh0aGlzLl9oaWdobGlnaHRUYXJnZXQpIHtcblx0XHRcdHRoaXMuX3JlbmRlckhpZ2hsaWdodCh0aGlzLl9oaWdobGlnaHRUYXJnZXQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29tbWVudEJhY2tkcm9wVGFyZ2V0KSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRDb21tZW50QmFja2Ryb3AodGhpcy5fY29tbWVudEJhY2tkcm9wVGFyZ2V0KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjb21tZW50IG9mIHRoaXMuX2NvbW1lbnRzLnZhbHVlcygpKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRDb21tZW50UGluKGNvbW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBQaWNraW5nIGhlbHBlcnMgLS0tXG5cblx0cHJpdmF0ZSBfZ2V0Rm9jdXNlZEVsZW1lbnQoKTogRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFkb2N1bWVudC5oYXNGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0d2hpbGUgKGFjdGl2ZUVsZW1lbnQ/LnNoYWRvd1Jvb3Q/LmFjdGl2ZUVsZW1lbnQpIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQgPSBhY3RpdmVFbGVtZW50LnNoYWRvd1Jvb3QuYWN0aXZlRWxlbWVudDtcblx0XHR9XG5cdFx0aWYgKCFhY3RpdmVFbGVtZW50IHx8IGFjdGl2ZUVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkgfHwgYWN0aXZlRWxlbWVudCA9PT0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGFjdGl2ZUVsZW1lbnQgPT09IHRoaXMuX3NoYWRvd0hvc3QgfHwgYWN0aXZlRWxlbWVudCBpbnN0YW5jZW9mIEhUTUxJRnJhbWVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aXZlRWxlbWVudDtcblx0fVxuXG5cdC8qKiBSZXR1cm4gdGhlIHBhZ2UgZWxlbWVudCB1bmRlciBhIHZpZXdwb3J0IHBvaW50LCBza2lwcGluZyBvdXIgb3duIG92ZXJsYXkgaG9zdC4gKi9cblx0cHJpdmF0ZSBfcGlja0VsZW1lbnRBdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBkb2N1bWVudC5lbGVtZW50c0Zyb21Qb2ludCh4LCB5KTtcblx0XHRmb3IgKGNvbnN0IGVsIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRcdGlmIChlbCA9PT0gdGhpcy5fc2hhZG93SG9zdCB8fCB0aGlzLl9zaGFkb3dIb3N0LmNvbnRhaW5zKGVsKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlbDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBlbGVtZW50IHRoYXQgXCJjb3ZlcnNcIiBhIGRyYWcgcmVjdGFuZ2xlLlxuXHQgKlxuXHQgKiBTYW1wbGVzIGBlbGVtZW50RnJvbVBvaW50YCBhdCB0aGUgNCBjb3JuZXJzLCA0IGVkZ2UgbWlkcG9pbnRzLCBhbmRcblx0ICogY2VudGVyLCB0aGVuIHJldHVybnMgdGhlaXIgZGVlcGVzdCBjb21tb24gYW5jZXN0b3IuXG5cdCAqL1xuXHRwcml2YXRlIF9waWNrUmVnaW9uQW5jZXN0b3IocmVjdDogSUJyb3dzZXJWaWV3UmVjdCk6IEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsgeCwgeSwgd2lkdGgsIGhlaWdodCB9ID0gcmVjdDtcblx0XHRjb25zdCB4MiA9IHggKyB3aWR0aDtcblx0XHRjb25zdCB5MiA9IHkgKyBoZWlnaHQ7XG5cdFx0Y29uc3QgY3ggPSB4ICsgd2lkdGggLyAyO1xuXHRcdGNvbnN0IGN5ID0geSArIGhlaWdodCAvIDI7XG5cdFx0Y29uc3Qgc2FtcGxlczogRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbc3gsIHN5XSBvZiBbXG5cdFx0XHRbeCwgeV0sIFt4MiwgeV0sIFt4LCB5Ml0sIFt4MiwgeTJdLCAgICAgICAvLyBjb3JuZXJzXG5cdFx0XHRbY3gsIHldLCBbY3gsIHkyXSwgW3gsIGN5XSwgW3gyLCBjeV0sICAgICAgLy8gZWRnZSBtaWRwb2ludHNcblx0XHRcdFtjeCwgY3ldICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNlbnRlclxuXHRcdF0pIHtcblx0XHRcdGNvbnN0IGVsID0gdGhpcy5fcGlja0VsZW1lbnRBdChzeCwgc3kpO1xuXHRcdFx0aWYgKGVsKSB7XG5cdFx0XHRcdHNhbXBsZXMucHVzaChlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmaW5kQ29tbW9uVmlzaWJsZUFuY2VzdG9yKHNhbXBsZXMpO1xuXHR9XG5cblx0Ly8gLS0tIEhpZ2hsaWdodCAtLS1cblxuXHRwcml2YXRlIF9yZW5kZXJIaWdobGlnaHQodGFyZ2V0OiBFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ID0gdGhpcy5faGlnaGxpZ2h0O1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fbGFiZWw7XG5cblx0XHRjb25zdCByZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHNjcm9sbFggPSB3aW5kb3cuc2Nyb2xsWCB8fCAwO1xuXHRcdGNvbnN0IHNjcm9sbFkgPSB3aW5kb3cuc2Nyb2xsWSB8fCAwO1xuXHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xuXHRcdGNvbnN0IHZpZXdwb3J0V2lkdGggPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG5cdFx0Y29uc3QgdmlzaWJsZVJlY3QgPSB0aGlzLl9nZXRWaXNpYmxlVGFyZ2V0Qm91bmRzKHJlY3QpO1xuXHRcdGNvbnN0IGxhYmVsSGVpZ2h0ID0gMjI7IC8vIGxhYmVsIGhlaWdodCAoMjApICsgMnB4IGdhcCBhYm92ZSB0aGUgYm94LlxuXG5cdFx0Ly8gSGlnaGxpZ2h0IGJveCBpcyBpbiAqcGFnZSogY29vcmRpbmF0ZXMgc28gaXQgc2Nyb2xscyB3aXRoIHRoZSBkb2N1bWVudC5cblx0XHRoaWdobGlnaHQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0aGlnaGxpZ2h0LnN0eWxlLmxlZnQgPSBgJHtyZWN0LmxlZnQgKyBzY3JvbGxYfXB4YDtcblx0XHRoaWdobGlnaHQuc3R5bGUudG9wID0gYCR7cmVjdC50b3AgKyBzY3JvbGxZfXB4YDtcblx0XHRoaWdobGlnaHQuc3R5bGUud2lkdGggPSBgJHtyZWN0LndpZHRofXB4YDtcblx0XHRoaWdobGlnaHQuc3R5bGUuaGVpZ2h0ID0gYCR7cmVjdC5oZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2hpZ2hsaWdodFNoYXBlLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdHRoaXMuX2hpZ2hsaWdodFNoYXBlLnNldEF0dHJpYnV0ZSgneCcsIGAke3Zpc2libGVSZWN0Lnh9YCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUuc2V0QXR0cmlidXRlKCd5JywgYCR7dmlzaWJsZVJlY3QueX1gKTtcblx0XHR0aGlzLl9oaWdobGlnaHRTaGFwZS5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgYCR7dmlzaWJsZVJlY3Qud2lkdGh9YCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBgJHt2aXNpYmxlUmVjdC5oZWlnaHR9YCk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUuc2V0QXR0cmlidXRlKCdyeCcsICcyJyk7XG5cblx0XHQvLyBMYWJlbCBpcyBpbiAqdmlld3BvcnQqIGNvb3JkaW5hdGVzIGFuZCBzdGlja3ktY2xhbXBlZCB0byB0aGUgdmlld3BvcnQuXG5cdFx0Y29uc3QgdGFnTmFtZSA9IFN0cmluZyh0YXJnZXQudGFnTmFtZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCBpZFBhcnQgPSB0YXJnZXQuaWQgPyBgIyR7dGFyZ2V0LmlkfWAgOiAnJztcblx0XHRjb25zdCBjbGFzc1BhcnQgPSB0YXJnZXQuY2xhc3NMaXN0Lmxlbmd0aFxuXHRcdFx0PyAnLicgKyBbLi4udGFyZ2V0LmNsYXNzTGlzdF0uam9pbignLicpXG5cdFx0XHQ6ICcnO1xuXHRcdHRoaXMuX2xhYmVsU2VsZWN0b3IudGV4dENvbnRlbnQgPSB0YWdOYW1lICsgaWRQYXJ0O1xuXHRcdHRoaXMuX2xhYmVsQ2xhc3Nlcy50ZXh0Q29udGVudCA9IGNsYXNzUGFydDtcblx0XHR0aGlzLl9sYWJlbERpbXMudGV4dENvbnRlbnQgPSBgJHtNYXRoLnJvdW5kKHJlY3Qud2lkdGgpfSBcXHUwMGQ3ICR7TWF0aC5yb3VuZChyZWN0LmhlaWdodCl9YDtcblx0XHRsYWJlbC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1mbGV4Jztcblx0XHRjb25zdCBpZGVhbFRvcCA9IHJlY3QudG9wIC0gbGFiZWxIZWlnaHQ7XG5cdFx0Y29uc3QgbGFiZWxUb3AgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih2aWV3cG9ydEhlaWdodCAtIGxhYmVsSGVpZ2h0LCBpZGVhbFRvcCkpO1xuXHRcdC8vIFVzZSBjbGllbnRXaWR0aCAoZXhjbHVkZXMgc2Nyb2xsYmFyKSByYXRoZXIgdGhhbiBpbm5lcldpZHRoIHNvIHRoZVxuXHRcdC8vIGxhYmVsIGRvZXNuJ3QgZXh0ZW5kIGJlaGluZCB0aGUgc2Nyb2xsYmFyIG9uIFdpbmRvd3MvTGludXguXG5cdFx0Ly8gUG9zaXRpb24gbGFiZWwgYXQgdGhlIGVsZW1lbnQncyBsZWZ0IGVkZ2UsIGJ1dCBwdXNoIGl0IGxlZnQgaWYgaXRcblx0XHQvLyB3b3VsZCBvdmVyZmxvdyB0aGUgdmlld3BvcnQuIENsYW1wIHRvIDAgc28gaXQgbmV2ZXIgZ29lcyBvZmYtc2NyZWVuLlxuXHRcdGxhYmVsLnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0Y29uc3QgbmF0dXJhbFdpZHRoID0gbGFiZWwub2Zmc2V0V2lkdGg7XG5cdFx0Y29uc3QgaWRlYWxMZWZ0ID0gcmVjdC5sZWZ0O1xuXHRcdGNvbnN0IGxhYmVsTGVmdCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGlkZWFsTGVmdCwgdmlld3BvcnRXaWR0aCAtIG5hdHVyYWxXaWR0aCkpO1xuXHRcdGxhYmVsLnN0eWxlLmxlZnQgPSBgJHtsYWJlbExlZnR9cHhgO1xuXHRcdGxhYmVsLnN0eWxlLnRvcCA9IGAke2xhYmVsVG9wfXB4YDtcblxuXHRcdGxldCBjb21tZW50U3VyZmFjZUFib3ZlID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBzdXJmYWNlIG9mIFt0aGlzLl9jb21tZW50UHJldmlldywgdGhpcy5fY29tbWVudENvbXBvc2VyXSkge1xuXHRcdFx0aWYgKHN1cmZhY2Uuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnKSB7XG5cdFx0XHRcdGNvbW1lbnRTdXJmYWNlQWJvdmUgPSB0aGlzLl9sYXlvdXRDb21tZW50U3VyZmFjZShzdXJmYWNlLCB2aXNpYmxlUmVjdCwgdmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHQpID09PSAnYWJvdmUnIHx8IGNvbW1lbnRTdXJmYWNlQWJvdmU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjb21tZW50U3VyZmFjZUFib3ZlKSB7XG5cdFx0XHRsYWJlbC5zdHlsZS50b3AgPSBgJHtNYXRoLm1heCgwLCBNYXRoLm1pbih2aWV3cG9ydEhlaWdodCAtIGxhYmVsSGVpZ2h0LCB2aXNpYmxlUmVjdC5ib3R0b20gKyAyKSl9cHhgO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFZpc2libGVUYXJnZXRCb3VuZHMocmVjdDogRE9NUmVjdCk6IERPTVJlY3Qge1xuXHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyZWN0LmxlZnQsIHdpbmRvdy5pbm5lcldpZHRoKSk7XG5cdFx0Y29uc3QgcmlnaHQgPSBNYXRoLm1heChsZWZ0LCBNYXRoLm1pbihyZWN0LnJpZ2h0LCB3aW5kb3cuaW5uZXJXaWR0aCkpO1xuXHRcdGNvbnN0IHRvcCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHJlY3QudG9wLCB3aW5kb3cuaW5uZXJIZWlnaHQpKTtcblx0XHRjb25zdCBib3R0b20gPSBNYXRoLm1heCh0b3AsIE1hdGgubWluKHJlY3QuYm90dG9tLCB3aW5kb3cuaW5uZXJIZWlnaHQpKTtcblx0XHRyZXR1cm4gbmV3IERPTVJlY3QobGVmdCwgdG9wLCByaWdodCAtIGxlZnQsIGJvdHRvbSAtIHRvcCk7XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRDb21tZW50U3VyZmFjZShzdXJmYWNlOiBIVE1MRWxlbWVudCwgdGFyZ2V0Qm91bmRzOiBET01SZWN0LCB2aWV3cG9ydFdpZHRoOiBudW1iZXIsIHZpZXdwb3J0SGVpZ2h0OiBudW1iZXIpOiAnYWJvdmUnIHwgJ2JlbG93JyB7XG5cdFx0aWYgKHN1cmZhY2UgPT09IHRoaXMuX2NvbW1lbnRQcmV2aWV3KSB7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVXaWR0aCA9IE1hdGgubWluKDMyMCwgdmlld3BvcnRXaWR0aCAtIDE2KTtcblx0XHRcdGNvbnN0IG1heGltdW1XaWR0aCA9IE1hdGgubWluKE1hdGgubWF4KDMyMCwgdGFyZ2V0Qm91bmRzLndpZHRoKSwgYXZhaWxhYmxlV2lkdGgpO1xuXHRcdFx0c3VyZmFjZS5zdHlsZS53aWR0aCA9ICdtYXgtY29udGVudCc7XG5cdFx0XHRzdXJmYWNlLnN0eWxlLm1pbldpZHRoID0gJzAnO1xuXHRcdFx0c3VyZmFjZS5zdHlsZS5tYXhXaWR0aCA9IGAke21heGltdW1XaWR0aH1weGA7XG5cdFx0fVxuXHRcdGNvbnN0IHN1cmZhY2VIZWlnaHQgPSBzdXJmYWNlLm9mZnNldEhlaWdodDtcblx0XHRjb25zdCBiZWxvd1RvcCA9IHRhcmdldEJvdW5kcy5ib3R0b207XG5cdFx0Y29uc3QgcGxhY2VtZW50ID0gYmVsb3dUb3AgKyBzdXJmYWNlSGVpZ2h0IDw9IHZpZXdwb3J0SGVpZ2h0IC0gOCA/ICdiZWxvdycgOiAnYWJvdmUnO1xuXHRcdGNvbnN0IHN1cmZhY2VUb3AgPSBiZWxvd1RvcCArIHN1cmZhY2VIZWlnaHQgPD0gdmlld3BvcnRIZWlnaHQgLSA4XG5cdFx0XHQ/IGJlbG93VG9wXG5cdFx0XHQ6IE1hdGgubWF4KDAsIHRhcmdldEJvdW5kcy50b3AgLSBzdXJmYWNlSGVpZ2h0KTtcblx0XHRjb25zdCBzdXJmYWNlV2lkdGggPSBzdXJmYWNlLm9mZnNldFdpZHRoO1xuXHRcdGNvbnN0IGFsaWduTGVmdCA9IHRhcmdldEJvdW5kcy5sZWZ0ICsgc3VyZmFjZVdpZHRoIDw9IHZpZXdwb3J0V2lkdGg7XG5cdFx0Y29uc3QgYWxpZ25tZW50ID0gYWxpZ25MZWZ0ID8gJ2xlZnQnIDogJ3JpZ2h0Jztcblx0XHRjb25zdCBzdXJmYWNlTGVmdCA9IGFsaWduTGVmdFxuXHRcdFx0PyBNYXRoLm1heCgwLCB0YXJnZXRCb3VuZHMubGVmdClcblx0XHRcdDogTWF0aC5tYXgoMCwgdGFyZ2V0Qm91bmRzLnJpZ2h0IC0gc3VyZmFjZVdpZHRoKTtcblx0XHRzdXJmYWNlLmRhdGFzZXQuYXR0YWNobWVudENvcm5lciA9IGAke3BsYWNlbWVudCA9PT0gJ2JlbG93JyA/ICd0b3AnIDogJ2JvdHRvbSd9LSR7YWxpZ25tZW50fWA7XG5cdFx0c3VyZmFjZS5zdHlsZS5sZWZ0ID0gYCR7c3VyZmFjZUxlZnR9cHhgO1xuXHRcdHN1cmZhY2Uuc3R5bGUudG9wID0gYCR7c3VyZmFjZVRvcH1weGA7XG5cdFx0cmV0dXJuIHBsYWNlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUhpZ2hsaWdodCh0YXJnZXQ6IEVsZW1lbnQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9oaWdobGlnaHRUYXJnZXQgPSB0YXJnZXQ7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRoaXMuX2hpZ2hsaWdodC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0U2hhcGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2xhYmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9jb21tZW50UHJldmlldy5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJIaWdobGlnaHQodGFyZ2V0KTtcblx0fVxuXG5cdC8vIC0tLSBDb21taXQgLS0tXG5cblx0cHJpdmF0ZSBfY29tbWl0KHRhcmdldDogRWxlbWVudCwgYW5jaG9yPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRNb2RlKSB7XG5cdFx0XHRjb25zdCBib3VuZHMgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHR0aGlzLl9zaG93Q29tbWVudENvbXBvc2VyKHRhcmdldCwgYW5jaG9yID8/IHtcblx0XHRcdFx0eDogYm91bmRzLmxlZnQgKyBib3VuZHMud2lkdGggLyAyLFxuXHRcdFx0XHR5OiBib3VuZHMudG9wICsgYm91bmRzLmhlaWdodCAvIDIsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gV2FpdCBhIGZyYW1lIHNvIGFueSBwZW5kaW5nIGV2ZW50IGhhbmRsZXJzIGNhbiBiZSBjb21wbGV0ZWQgaW4gdGhlIHNlbGVjdGluZyBhY3RpdmUgc3RhdGUuXG5cdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5fY29udGludW91cykge1xuXHRcdFx0XHQvLyBUZWFyIGRvd24gdGhlIG92ZXJsYXkgYmVmb3JlIG5vdGlmeWluZyB0aGUgaG9zdCBzbyBhbnlcblx0XHRcdFx0Ly8gc2NyZWVuc2hvdCBjYXB0dXJlIGRvZXNuJ3QgaW5jbHVkZSBvdXIgY2hyb21lLlxuXHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodCh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25QaWNrZWQodGFyZ2V0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dDb21tZW50Q29tcG9zZXIodGFyZ2V0OiBFbGVtZW50LCBhbmNob3I6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdHRoaXMuX2NvbW1lbnRUYXJnZXQgPSB0YXJnZXQ7XG5cdFx0dGhpcy5fY29tbWVudEFuY2hvciA9IHtcblx0XHRcdHg6IGFuY2hvci54ICsgd2luZG93LnNjcm9sbFgsXG5cdFx0XHR5OiBhbmNob3IueSArIHdpbmRvdy5zY3JvbGxZXG5cdFx0fTtcblx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHQodGFyZ2V0KTtcblx0XHR0aGlzLl9zaG93Q29tbWVudEJhY2tkcm9wKHRhcmdldCk7XG5cdFx0dGhpcy5fY29tbWVudExheWVyLmNsYXNzTGlzdC5hZGQoJ2NvbXBvc2luZycpO1xuXHRcdHRoaXMuX2NvbW1lbnRJbnB1dC52YWx1ZSA9ICcnO1xuXHRcdHRoaXMuX2NvbW1lbnRDb21wb3Nlci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdHRoaXMuX2xheW91dENvbW1lbnRDb21wb3NlcigpO1xuXHRcdHRoaXMuX2xheW91dENvbW1lbnRJbnB1dCgpO1xuXHRcdHRoaXMuX2FuaW1hdGVDb21tZW50SGlnaGxpZ2h0KFxuXHRcdFx0bmV3IERPTVJlY3QoYW5jaG9yLnggLSAzLCBhbmNob3IueSAtIDMsIDYsIDYpLFxuXHRcdFx0dGFyZ2V0LFxuXHRcdFx0W3RoaXMuX2xhYmVsLCB0aGlzLl9jb21tZW50Q29tcG9zZXJdXG5cdFx0KTtcblx0XHR0aGlzLl9jb21tZW50SW5wdXQuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pO1xuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFRhcmdldCA9PT0gdGFyZ2V0KSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRJbnB1dC5mb2N1cyh7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbG9zZUNvbW1lbnRDb21wb3NlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50VGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NvbW1lbnRBbmNob3IgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faGlkZUNvbW1lbnRCYWNrZHJvcCgpO1xuXHRcdHRoaXMuX2NvbW1lbnRMYXllci5jbGFzc0xpc3QucmVtb3ZlKCdjb21wb3NpbmcnKTtcblx0XHR0aGlzLl9jb21tZW50Q29tcG9zZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl9jb21tZW50SW5wdXQudmFsdWUgPSAnJztcblx0XHR0aGlzLl9jYW5jZWxDb21tZW50UHJldmlld0FuaW1hdGlvbnMoKTtcblx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHQodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmlzaENvbW1lbnRJbnRlcmFjdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29udGludW91cykge1xuXHRcdFx0dGhpcy5fY2xvc2VDb21tZW50Q29tcG9zZXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3VibWl0Q29tbWVudCgpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9jb21tZW50VGFyZ2V0O1xuXHRcdGNvbnN0IGFuY2hvciA9IHRoaXMuX2NvbW1lbnRBbmNob3I7XG5cdFx0aWYgKCF0YXJnZXQgfHwgIWFuY2hvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBib2R5ID0gdGhpcy5fY29tbWVudElucHV0LnZhbHVlLnJlcGxhY2UoL1xccj9cXG4vZywgJyAnKTtcblx0XHRjb25zdCBlbGVtZW50SWQgPSB0aGlzLl9vblBpY2tlZCh0YXJnZXQsIGJvZHkpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tZW50cy5zZXQoZWxlbWVudElkLCB7IHRhcmdldCwgYW5jaG9yLCBib2R5IH0pO1xuXHRcdHRoaXMuX2ZpbmlzaENvbW1lbnRJbnRlcmFjdGlvbigpO1xuXHRcdHRoaXMuX2ZvY3VzQ29tbWVudFRhcmdldCh0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNDb21tZW50VGFyZ2V0KHRhcmdldDogRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGFyZ2V0LmlzQ29ubmVjdGVkIHx8ICEodGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgfHwgdGFyZ2V0IGluc3RhbmNlb2YgU1ZHRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYWRUYWJJbmRleCA9IHRhcmdldC5oYXNBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XG5cdFx0aWYgKCFoYWRUYWJJbmRleCkge1xuXHRcdFx0dGFyZ2V0LnRhYkluZGV4ID0gLTE7XG5cdFx0fVxuXHRcdHRhcmdldC5mb2N1cyh7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG5cdFx0aWYgKCFoYWRUYWJJbmRleCkge1xuXHRcdFx0dGFyZ2V0LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDb21tZW50UGluKGVsZW1lbnRJZDogc3RyaW5nLCB0YXJnZXQ6IEVsZW1lbnQsIGFuY2hvcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBib2R5OiBzdHJpbmcsIG9yZGluYWw6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2Vuc3VyZU1vdW50ZWQoKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NvbW1lbnRzLmdldChlbGVtZW50SWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0dGhpcy5fY2xlYXJDb21tZW50UHJldmlldyhleGlzdGluZy50YXJnZXQpO1xuXHRcdH1cblx0XHRleGlzdGluZz8ucGluLnJlbW92ZSgpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tZW50cy5kZWxldGUoZWxlbWVudElkKTtcblx0XHRjb25zdCByZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IG9mZnNldCA9IHtcblx0XHRcdHg6IGFuY2hvci54IC0gKHJlY3QubGVmdCArIHdpbmRvdy5zY3JvbGxYKSxcblx0XHRcdHk6IGFuY2hvci55IC0gKHJlY3QudG9wICsgd2luZG93LnNjcm9sbFkpXG5cdFx0fTtcblxuXHRcdGNvbnN0IHBpbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHBpbi5jbGFzc05hbWUgPSAnY29tbWVudC1waW4nO1xuXHRcdHBpbi50YWJJbmRleCA9IDA7XG5cdFx0cGluLnNldEF0dHJpYnV0ZSgncm9sZScsICdub3RlJyk7XG5cdFx0Y29uc3QgYnViYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGJ1YmJsZS5jbGFzc05hbWUgPSAnY29tbWVudC1waW4tYnViYmxlJztcblx0XHRjb25zdCBudW1iZXJFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdG51bWJlckVsZW1lbnQuY2xhc3NOYW1lID0gJ2NvbW1lbnQtcGluLW51bWJlcic7XG5cdFx0YnViYmxlLmFwcGVuZENoaWxkKG51bWJlckVsZW1lbnQpO1xuXHRcdHBpbi5hcHBlbmRDaGlsZChidWJibGUpO1xuXG5cdFx0Y29uc3Qgc2hvdyA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb21tZW50VGFyZ2V0IHx8IHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nob3dDb21tZW50UHJldmlldyhlbGVtZW50SWQsIHRhcmdldCwgYm9keSk7XG5cdFx0fTtcblx0XHRwaW4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsIHNob3cpO1xuXHRcdHBpbi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4gdGhpcy5fc2NoZWR1bGVDb21tZW50UHJldmlld0hpZGUoKSk7XG5cdFx0cGluLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzaW4nLCBzaG93KTtcblx0XHRwaW4uYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCAoKSA9PiB0aGlzLl9zY2hlZHVsZUNvbW1lbnRQcmV2aWV3SGlkZSgpKTtcblx0XHR0aGlzLl9jb21tZW50TGF5ZXIuYXBwZW5kQ2hpbGQocGluKTtcblx0XHRjb25zdCBjb21tZW50ID0geyB0YXJnZXQsIHBpbiwgbnVtYmVyRWxlbWVudCwgYm9keSwgb3JkaW5hbCwgb2Zmc2V0IH07XG5cdFx0dGhpcy5fY29tbWVudHMuc2V0KGVsZW1lbnRJZCwgY29tbWVudCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29tbWVudFBpbk51bWJlcnMoKTtcblx0XHR0aGlzLl9sYXlvdXRDb21tZW50UGluKGNvbW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29tbWVudFBpbk51bWJlcnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjb21tZW50IG9mIHRoaXMuX2NvbW1lbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBudW1iZXJMYWJlbCA9IFN0cmluZyhjb21tZW50Lm9yZGluYWwpO1xuXHRcdFx0Y29tbWVudC5udW1iZXJFbGVtZW50LnRleHRDb250ZW50ID0gbnVtYmVyTGFiZWw7XG5cdFx0XHRjb21tZW50LnBpbi50aXRsZSA9IGNvbW1lbnQuYm9keSB8fCB0aGlzLl9mb3JtYXRMb2NhbGl6ZWRTdHJpbmcobG9jYWxpemVkU3RyaW5ncy5lbGVtZW50Q29tbWVudCwgbnVtYmVyTGFiZWwpO1xuXHRcdFx0Y29tbWVudC5waW4uc2V0QXR0cmlidXRlKFxuXHRcdFx0XHQnYXJpYS1sYWJlbCcsXG5cdFx0XHRcdGNvbW1lbnQuYm9keVxuXHRcdFx0XHRcdD8gdGhpcy5fZm9ybWF0TG9jYWxpemVkU3RyaW5nKGxvY2FsaXplZFN0cmluZ3MuZWxlbWVudENvbW1lbnRXaXRoQm9keSwgbnVtYmVyTGFiZWwsIGNvbW1lbnQuYm9keSlcblx0XHRcdFx0XHQ6IHRoaXMuX2Zvcm1hdExvY2FsaXplZFN0cmluZyhsb2NhbGl6ZWRTdHJpbmdzLmVtcHR5RWxlbWVudENvbW1lbnQsIG51bWJlckxhYmVsKVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUxvY2FsaXplZFN0cmluZ3MoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24udGl0bGUgPSBsb2NhbGl6ZWRTdHJpbmdzLnJlbW92ZUNvbW1lbnQ7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdSZW1vdmVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5yZW1vdmVFbGVtZW50Q29tbWVudCk7XG5cdFx0dGhpcy5fY29tbWVudENvbXBvc2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplZFN0cmluZ3MuY29tbWVudE9uU2VsZWN0ZWRFbGVtZW50KTtcblx0XHR0aGlzLl9jb21tZW50SW5wdXQucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZWRTdHJpbmdzLmFkZENvbW1lbnRQbGFjZWhvbGRlcjtcblx0XHR0aGlzLl9jb21tZW50SW5wdXQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemVkU3RyaW5ncy5jb21tZW50T25TZWxlY3RlZEVsZW1lbnQpO1xuXHRcdHRoaXMuX2NvbW1lbnRTZW5kQnV0dG9uLnRpdGxlID0gbG9jYWxpemVkU3RyaW5ncy5hZGRDb21tZW50O1xuXHRcdHRoaXMuX2NvbW1lbnRTZW5kQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplZFN0cmluZ3MuYWRkQ29tbWVudCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29tbWVudFBpbk51bWJlcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdExvY2FsaXplZFN0cmluZyh0ZW1wbGF0ZTogc3RyaW5nLCAuLi52YWx1ZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGVtcGxhdGUucmVwbGFjZSgvXFx7KFxcZCspXFx9L2csIChfLCBpbmRleCkgPT4gdmFsdWVzW051bWJlcihpbmRleCldID8/ICcnKTtcblx0fVxuXG5cdHByaXZhdGUgX2xheW91dENvbW1lbnRQaW4oY29tbWVudDogeyB0YXJnZXQ6IEVsZW1lbnQ7IHBpbjogSFRNTERpdkVsZW1lbnQ7IG9mZnNldDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IH0pOiB2b2lkIHtcblx0XHRjb25zdCByZWN0ID0gY29tbWVudC50YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgeCA9IHJlY3QubGVmdCArIHdpbmRvdy5zY3JvbGxYICsgY29tbWVudC5vZmZzZXQueDtcblx0XHRjb25zdCB5ID0gcmVjdC50b3AgKyB3aW5kb3cuc2Nyb2xsWSArIGNvbW1lbnQub2Zmc2V0Lnk7XG5cdFx0Y29uc3Qgc2Nyb2xsaW5nRWxlbWVudCA9IGRvY3VtZW50LnNjcm9sbGluZ0VsZW1lbnQgPz8gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuXHRcdGNvbnN0IGhhbGZXaWR0aCA9IGNvbW1lbnQucGluLm9mZnNldFdpZHRoIC8gMjtcblx0XHRjb25zdCBoYWxmSGVpZ2h0ID0gY29tbWVudC5waW4ub2Zmc2V0SGVpZ2h0IC8gMjtcblx0XHRjb25zdCBjbGFtcGVkWCA9IE1hdGgubWF4KGhhbGZXaWR0aCwgTWF0aC5taW4oeCwgc2Nyb2xsaW5nRWxlbWVudC5zY3JvbGxXaWR0aCAtIGhhbGZXaWR0aCkpO1xuXHRcdGNvbnN0IGNsYW1wZWRZID0gTWF0aC5tYXgoaGFsZkhlaWdodCwgTWF0aC5taW4oeSwgc2Nyb2xsaW5nRWxlbWVudC5zY3JvbGxIZWlnaHQgLSBoYWxmSGVpZ2h0KSk7XG5cdFx0Y29tbWVudC5waW4uc3R5bGUubGVmdCA9IGAke2NsYW1wZWRYfXB4YDtcblx0XHRjb21tZW50LnBpbi5zdHlsZS50b3AgPSBgJHtjbGFtcGVkWX1weGA7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93Q29tbWVudFByZXZpZXcoZWxlbWVudElkOiBzdHJpbmcsIHRhcmdldDogRWxlbWVudCwgZmFsbGJhY2tCb2R5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCA9PT0gZWxlbWVudElkKSB7XG5cdFx0XHR0aGlzLl9jYW5jZWxDb21tZW50UHJldmlld0hpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQgPSBlbGVtZW50SWQ7XG5cdFx0Y29uc3QgY29tbWVudCA9IHRoaXMuX2NvbW1lbnRzLmdldChlbGVtZW50SWQpO1xuXHRcdGNvbnN0IHBpbkJvdW5kcyA9IGNvbW1lbnQgPyB0aGlzLl9nZXRDb21tZW50UGluUG9pbnRCb3VuZHMoY29tbWVudC5waW4pIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjb21tZW50KSB7XG5cdFx0XHRjb21tZW50LnBpbi5jbGFzc0xpc3QuYWRkKCdwcmV2aWV3aW5nJyk7XG5cdFx0XHRjb21tZW50LnBpbi5hZnRlcih0aGlzLl9jb21tZW50UHJldmlldyk7XG5cdFx0fVxuXHRcdGNvbnN0IGJvZHkgPSBjb21tZW50Py5ib2R5ID8/IGZhbGxiYWNrQm9keTtcblx0XHR0aGlzLl9zZXRDb21tZW50UHJldmlld0JvZHkoYm9keSk7XG5cdFx0dGhpcy5fc2hhZG93SG9zdC5jbGFzc0xpc3QuYWRkKCdjb21tZW50LXByZXZpZXctYWN0aXZlJyk7XG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRhcmdldCk7XG5cdFx0dGhpcy5fc2hvd0NvbW1lbnRCYWNrZHJvcCh0YXJnZXQpO1xuXHRcdGlmIChwaW5Cb3VuZHMpIHtcblx0XHRcdHRoaXMuX2FuaW1hdGVDb21tZW50SGlnaGxpZ2h0KFxuXHRcdFx0XHRwaW5Cb3VuZHMsXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0W3RoaXMuX2xhYmVsLCB0aGlzLl9jb21tZW50UHJldmlld11cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q29tbWVudFByZXZpZXdCb2R5KGJvZHk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3Qm9keS50ZXh0Q29udGVudCA9IGJvZHk7XG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXcudGl0bGUgPSBib2R5O1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3LmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgIWJvZHkpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb21tZW50UGluUG9pbnRCb3VuZHMocGluOiBIVE1MRWxlbWVudCk6IERPTVJlY3Qge1xuXHRcdGNvbnN0IHBpbkJvdW5kcyA9IHBpbi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4gbmV3IERPTVJlY3QocGluQm91bmRzLmxlZnQgKyA4LCBwaW5Cb3VuZHMudG9wICsgOCwgNiwgNik7XG5cdH1cblxuXHRwcml2YXRlIF9hbmltYXRlQ29tbWVudEhpZ2hsaWdodChwaW5Cb3VuZHM6IERPTVJlY3QsIHRhcmdldDogRWxlbWVudCwgc3VwcG9ydGluZ0VsZW1lbnRzOiByZWFkb25seSBIVE1MRWxlbWVudFtdLCBjb2xsYXBzaW5nID0gZmFsc2UpOiBBbmltYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9yZWR1Y2VkTW90aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXRCb3VuZHMgPSB0aGlzLl9nZXRWaXNpYmxlVGFyZ2V0Qm91bmRzKHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSk7XG5cdFx0Y29uc3QgZHVyYXRpb24gPSAxODA7XG5cdFx0Y29uc3QgZWFzaW5nID0gJ2N1YmljLWJlemllcigwLjIsIDAsIDAsIDEpJztcblx0XHRjb25zdCBwaW5LZXlmcmFtZTogS2V5ZnJhbWUgPSB7XG5cdFx0XHR4OiBgJHtwaW5Cb3VuZHMubGVmdH1weGAsXG5cdFx0XHR5OiBgJHtwaW5Cb3VuZHMudG9wfXB4YCxcblx0XHRcdHdpZHRoOiBgJHtwaW5Cb3VuZHMud2lkdGh9cHhgLFxuXHRcdFx0aGVpZ2h0OiBgJHtwaW5Cb3VuZHMuaGVpZ2h0fXB4YCxcblx0XHRcdHJ4OiBgJHtwaW5Cb3VuZHMud2lkdGggLyAyfXB4YFxuXHRcdH07XG5cdFx0Y29uc3QgdGFyZ2V0S2V5ZnJhbWU6IEtleWZyYW1lID0ge1xuXHRcdFx0eDogYCR7dGFyZ2V0Qm91bmRzLmxlZnR9cHhgLFxuXHRcdFx0eTogYCR7dGFyZ2V0Qm91bmRzLnRvcH1weGAsXG5cdFx0XHR3aWR0aDogYCR7dGFyZ2V0Qm91bmRzLndpZHRofXB4YCxcblx0XHRcdGhlaWdodDogYCR7dGFyZ2V0Qm91bmRzLmhlaWdodH1weGAsXG5cdFx0XHRyeDogJzJweCdcblx0XHR9O1xuXHRcdGNvbnN0IGhpZ2hsaWdodEFuaW1hdGlvbiA9IHRoaXMuX2hpZ2hsaWdodFNoYXBlLmFuaW1hdGUoXG5cdFx0XHRjb2xsYXBzaW5nID8gW3RhcmdldEtleWZyYW1lLCBwaW5LZXlmcmFtZV0gOiBbcGluS2V5ZnJhbWUsIHRhcmdldEtleWZyYW1lXSxcblx0XHRcdHsgZHVyYXRpb24sIGVhc2luZywgZmlsbDogJ2ZvcndhcmRzJyB9XG5cdFx0KTtcblx0XHR0aGlzLl9jb21tZW50UHJldmlld0FuaW1hdGlvbnMucHVzaChoaWdobGlnaHRBbmltYXRpb24pO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3QW5pbWF0aW9ucy5wdXNoKHRoaXMuX2NvbW1lbnRCYWNrZHJvcEN1dG91dC5hbmltYXRlKFxuXHRcdFx0Y29sbGFwc2luZyA/IFt0YXJnZXRLZXlmcmFtZSwgcGluS2V5ZnJhbWVdIDogW3BpbktleWZyYW1lLCB0YXJnZXRLZXlmcmFtZV0sXG5cdFx0XHR7IGR1cmF0aW9uLCBlYXNpbmcsIGZpbGw6ICdmb3J3YXJkcycgfVxuXHRcdCkpO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHN1cHBvcnRpbmdFbGVtZW50cykge1xuXHRcdFx0aWYgKGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaGlkZGVuS2V5ZnJhbWU6IEtleWZyYW1lID0geyBvcGFjaXR5OiAwLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGVZKC00cHgpJyB9O1xuXHRcdFx0Y29uc3Qga2V5ZnJhbWVzID0gY29sbGFwc2luZ1xuXHRcdFx0XHQ/IFt7IG9wYWNpdHk6IDEsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoMCknIH0sIHsgLi4uaGlkZGVuS2V5ZnJhbWUsIG9mZnNldDogMC41NSB9LCBoaWRkZW5LZXlmcmFtZV1cblx0XHRcdFx0OiBbaGlkZGVuS2V5ZnJhbWUsIHsgLi4uaGlkZGVuS2V5ZnJhbWUsIG9mZnNldDogMC40NSB9LCB7IG9wYWNpdHk6IDEsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoMCknIH1dO1xuXHRcdFx0dGhpcy5fY29tbWVudFByZXZpZXdBbmltYXRpb25zLnB1c2goZWxlbWVudC5hbmltYXRlKGtleWZyYW1lcywgeyBkdXJhdGlvbiwgZWFzaW5nLCBmaWxsOiAnZm9yd2FyZHMnIH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIGhpZ2hsaWdodEFuaW1hdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlQ29tbWVudFByZXZpZXdIaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbENvbW1lbnRQcmV2aWV3SGlkZSgpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGlkZVRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb21tZW50UHJldmlld0hpZGVUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY29tbWVudCA9IHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkID8gdGhpcy5fY29tbWVudHMuZ2V0KHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChcblx0XHRcdFx0Y29tbWVudD8ucGluLm1hdGNoZXMoJzpob3ZlciwgOmZvY3VzLXdpdGhpbicpIHx8XG5cdFx0XHRcdHRoaXMuX2hpZ2hsaWdodC5tYXRjaGVzKCc6aG92ZXIsIDpmb2N1cy13aXRoaW4nKSB8fFxuXHRcdFx0XHR0aGlzLl9sYWJlbC5tYXRjaGVzKCc6aG92ZXIsIDpmb2N1cy13aXRoaW4nKSB8fFxuXHRcdFx0XHR0aGlzLl9jb21tZW50UHJldmlldy5tYXRjaGVzKCc6aG92ZXIsIDpmb2N1cy13aXRoaW4nKSB8fFxuXHRcdFx0XHR0aGlzLl9jb21tZW50UHJldmlld1JlbW92ZUJ1dHRvbi5tYXRjaGVzKCc6aG92ZXIsIDpmb2N1cy13aXRoaW4nKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbGxhcHNlQWN0aXZlQ29tbWVudFByZXZpZXcoKTtcblx0XHR9LCA4MCk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxDb21tZW50UHJldmlld0hpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRQcmV2aWV3SGlkZVRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0d2luZG93LmNsZWFyVGltZW91dCh0aGlzLl9jb21tZW50UHJldmlld0hpZGVUaW1lb3V0KTtcblx0XHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3SGlkZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGFwc2VBY3RpdmVDb21tZW50UHJldmlldygpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50SWQgPSB0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZDtcblx0XHRjb25zdCBjb21tZW50ID0gZWxlbWVudElkID8gdGhpcy5fY29tbWVudHMuZ2V0KGVsZW1lbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFlbGVtZW50SWQgfHwgIWNvbW1lbnQgfHwgdGhpcy5fcmVkdWNlZE1vdGlvbikge1xuXHRcdFx0dGhpcy5faGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9zaGFkb3dIb3N0LmNsYXNzTGlzdC5hZGQoJ2NvbW1lbnQtcHJldmlldy1jb2xsYXBzaW5nJyk7XG5cdFx0dGhpcy5fZmFkZU91dENvbW1lbnRCYWNrZHJvcCgpO1xuXHRcdGxldCBoaWdobGlnaHRBbmltYXRpb246IEFuaW1hdGlvbiB8IHVuZGVmaW5lZCA9IHRoaXMuX2NvbW1lbnRQcmV2aWV3QW5pbWF0aW9uc1swXTtcblx0XHRpZiAoaGlnaGxpZ2h0QW5pbWF0aW9uKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFuaW1hdGlvbiBvZiB0aGlzLl9jb21tZW50UHJldmlld0FuaW1hdGlvbnMpIHtcblx0XHRcdFx0YW5pbWF0aW9uLnJldmVyc2UoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aGlnaGxpZ2h0QW5pbWF0aW9uID0gdGhpcy5fYW5pbWF0ZUNvbW1lbnRIaWdobGlnaHQoXG5cdFx0XHRcdHRoaXMuX2dldENvbW1lbnRQaW5Qb2ludEJvdW5kcyhjb21tZW50LnBpbiksXG5cdFx0XHRcdGNvbW1lbnQudGFyZ2V0LFxuXHRcdFx0XHRbdGhpcy5fbGFiZWwsIHRoaXMuX2NvbW1lbnRQcmV2aWV3XSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKCFoaWdobGlnaHRBbmltYXRpb24pIHtcblx0XHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRoaWdobGlnaHRBbmltYXRpb24ub25maW5pc2ggPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nICYmIHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkID09PSBlbGVtZW50SWQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWVudFByZXZpZXdDb2xsYXBzaW5nID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxDb21tZW50UHJldmlld0FuaW1hdGlvbnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBhbmltYXRpb24gb2YgdGhpcy5fY29tbWVudFByZXZpZXdBbmltYXRpb25zKSB7XG5cdFx0XHRhbmltYXRpb24uY2FuY2VsKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3QW5pbWF0aW9ucyA9IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZUFjdGl2ZUNvbW1lbnRQcmV2aWV3KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbENvbW1lbnRQcmV2aWV3SGlkZSgpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3Q29sbGFwc2luZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QuY2xhc3NMaXN0LnJlbW92ZSgnY29tbWVudC1wcmV2aWV3LWNvbGxhcHNpbmcnKTtcblx0XHR0aGlzLl9jYW5jZWxDb21tZW50UHJldmlld0FuaW1hdGlvbnMoKTtcblx0XHRpZiAodGhpcy5fY29tbWVudFByZXZpZXdFbGVtZW50SWQpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRzLmdldCh0aGlzLl9jb21tZW50UHJldmlld0VsZW1lbnRJZCk/LnBpbi5jbGFzc0xpc3QucmVtb3ZlKCdwcmV2aWV3aW5nJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3RWxlbWVudElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QuY2xhc3NMaXN0LnJlbW92ZSgnY29tbWVudC1wcmV2aWV3LWFjdGl2ZScpO1xuXHRcdHRoaXMuX2NvbW1lbnRQcmV2aWV3LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5faGlkZUNvbW1lbnRCYWNrZHJvcCgpO1xuXHRcdGlmICghdGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0KHRoaXMuX2V4dGVybmFsSGlnaGxpZ2h0VGFyZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVDb21tZW50KGVsZW1lbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWVudCA9IHRoaXMuX2NvbW1lbnRzLmdldChlbGVtZW50SWQpO1xuXHRcdGlmICghY29tbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oaWRlQWN0aXZlQ29tbWVudFByZXZpZXcoKTtcblx0XHRjb21tZW50LnBpbi5yZW1vdmUoKTtcblx0XHR0aGlzLl9jb21tZW50cy5kZWxldGUoZWxlbWVudElkKTtcblx0XHR0aGlzLl91cGRhdGVDb21tZW50UGluTnVtYmVycygpO1xuXHRcdHRoaXMuX3VubW91bnRXaGVuSWRsZSgpO1xuXHRcdHRoaXMuX29uQ29tbWVudFJlbW92ZWQoZWxlbWVudElkKTtcblx0fVxuXG5cdHByaXZhdGUgX2xheW91dENvbW1lbnRJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50SW5wdXQuc3R5bGUuaGVpZ2h0ID0gJ2F1dG8nO1xuXHRcdHRoaXMuX2NvbW1lbnRJbnB1dC5zdHlsZS5oZWlnaHQgPSBgJHtNYXRoLm1pbih0aGlzLl9jb21tZW50SW5wdXQuc2Nyb2xsSGVpZ2h0LCA5Nil9cHhgO1xuXHRcdHRoaXMuX2xheW91dENvbW1lbnRDb21wb3NlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Q29tbWVudEJhY2tkcm9wKHRhcmdldDogRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlY3QgPSB0aGlzLl9nZXRWaXNpYmxlVGFyZ2V0Qm91bmRzKHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSk7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wQ3V0b3V0LnNldEF0dHJpYnV0ZSgneCcsIGAke3JlY3QueH1gKTtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3BDdXRvdXQuc2V0QXR0cmlidXRlKCd5JywgYCR7cmVjdC55fWApO1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcEN1dG91dC5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgYCR7cmVjdC53aWR0aH1gKTtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3BDdXRvdXQuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBgJHtyZWN0LmhlaWdodH1gKTtcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3BDdXRvdXQuc2V0QXR0cmlidXRlKCdyeCcsICcyJyk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93Q29tbWVudEJhY2tkcm9wKHRhcmdldDogRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSArK3RoaXMuX2NvbW1lbnRCYWNrZHJvcFJlcXVlc3Q7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wVGFyZ2V0ID0gdGFyZ2V0O1xuXHRcdHRoaXMuX2xheW91dENvbW1lbnRCYWNrZHJvcCh0YXJnZXQpO1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcC5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb21tZW50QmFja2Ryb3BSZXF1ZXN0ID09PSByZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcC5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlQ29tbWVudEJhY2tkcm9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcFJlcXVlc3QrKztcblx0XHR0aGlzLl9jb21tZW50QmFja2Ryb3BUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZhZGVPdXRDb21tZW50QmFja2Ryb3AoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWVudEJhY2tkcm9wUmVxdWVzdCsrO1xuXHRcdHRoaXMuX2NvbW1lbnRCYWNrZHJvcC5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckNvbW1lbnRQcmV2aWV3KHRhcmdldDogRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb21tZW50VGFyZ2V0IHx8IHRoaXMuX2NvbW1lbnRCYWNrZHJvcFRhcmdldCAhPT0gdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hpZGVBY3RpdmVDb21tZW50UHJldmlldygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Q29tbWVudENvbXBvc2VyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29tbWVudFRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJIaWdobGlnaHQodGhpcy5fY29tbWVudFRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVNb3VudGVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2hhZG93SG9zdC5wYXJlbnROb2RlKSB7XG5cdFx0XHRkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fc2hhZG93SG9zdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdW5tb3VudFdoZW5JZGxlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlICYmICF0aGlzLl9oaWdobGlnaHRUYXJnZXQgJiYgdGhpcy5fY29tbWVudHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc2hhZG93SG9zdC5yZW1vdmUoKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gU3RhdGljIGhlbHBlcnMgLS0tXG5cblx0LyoqXG5cdCAqIEluamVjdCB0aGUgc2hhZG93LXJvb3Qgc3R5bGVzaGVldC4gQ3VzdG9tIHByb3BlcnRpZXMgb24gdGhlIGhvc3Rcblx0ICogZWxlbWVudCBkcml2ZSB0aGUgY29sb3JzIHNvIHRoZSB3b3JrYmVuY2ggY2FuIHRoZW1lIHRoZW0uXG5cdCAqXG5cdCAqIFdlIGRlbGliZXJhdGVseSBkbyAqKm5vdCoqIHVzZSBhIGAqYCBzZWxlY3RvciB3aXRoIGBhbGw6IGluaXRpYWxgIFx1MjAxNFxuXHQgKiB0aGF0IHdvdWxkIGFsc28gcmVzZXQgYDxzdHlsZT5gJ3MgZGVmYXVsdCBgZGlzcGxheTogbm9uZWAsIGNhdXNpbmdcblx0ICogdGhlIGxpdGVyYWwgQ1NTIHNvdXJjZSB0byByZW5kZXIgYXMgcGFnZSB0ZXh0LlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2J1aWxkU3R5bGUoKTogSFRNTFN0eWxlRWxlbWVudCB7XG5cdFx0Y29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdHN0eWxlLnRleHRDb250ZW50ID0gYFxuXHRcdFx0Omhvc3Qge1xuXHRcdFx0XHRhbGw6IGluaXRpYWw7XG5cdFx0XHRcdGZvbnQtZmFtaWx5OiB2YXIoLS1waWNrLWZvbnQsIHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgc2Fucy1zZXJpZik7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0XHQuaGlnaGxpZ2h0IHtcblx0XHRcdFx0cG9zaXRpb246IGFic29sdXRlOyBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHR6LWluZGV4OiAyO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtYmFja2Ryb3Age1xuXHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHRcdGluc2V0OiAwO1xuXHRcdFx0XHR3aWR0aDogMTAwJTtcblx0XHRcdFx0aGVpZ2h0OiAxMDAlO1xuXHRcdFx0XHRwb2ludGVyLWV2ZW50czogbm9uZTtcblx0XHRcdFx0ei1pbmRleDogMjtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LWJhY2tkcm9wLWZpbGwge1xuXHRcdFx0XHRmaWxsOiB2YXIoLS12c2NvZGUtd2lkZ2V0LXNoYWRvdywgdHJhbnNwYXJlbnQpO1xuXHRcdFx0XHRvcGFjaXR5OiAwO1xuXHRcdFx0XHR0cmFuc2l0aW9uOiBvcGFjaXR5IDEyMG1zIGxpbmVhcjtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LWJhY2tkcm9wLnZpc2libGUgLmNvbW1lbnQtYmFja2Ryb3AtZmlsbCB7XG5cdFx0XHRcdG9wYWNpdHk6IDE7XG5cdFx0XHR9XG5cdFx0XHQuaGlnaGxpZ2h0LXNoYXBlIHtcblx0XHRcdFx0ZmlsbDogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgIzAwNzhkNCkgMTIlLCB0cmFuc3BhcmVudCk7XG5cdFx0XHRcdHN0cm9rZTogdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3OGQ0KTtcblx0XHRcdFx0c3Ryb2tlLXdpZHRoOiAycHg7XG5cdFx0XHR9XG5cdFx0XHQub3ZlcmxheSB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHR6LWluZGV4OiAxO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtbGF5ZXIge1xuXHRcdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7IGluc2V0OiAwOyBwb2ludGVyLWV2ZW50czogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXN1cmZhY2Uge1xuXHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHRcdGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cdFx0XHRcdHdpZHRoOiBtaW4oMzIwcHgsIGNhbGMoMTAwdncgLSAxNnB4KSk7XG5cdFx0XHRcdGJvcmRlcjogdmFyKC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzcywgMXB4KSBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciwgdmFyKC0tdnNjb2RlLWNvbnRyYXN0Qm9yZGVyLCAjNDU0NTQ1KSk7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IHZhcigtLXZzY29kZS1jb3JuZXJSYWRpdXMtbGFyZ2UsIDhweCk7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYmFja2dyb3VuZCwgIzI1MjUyNik7XG5cdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWZvcmVncm91bmQsICNjY2NjY2MpO1xuXHRcdFx0XHRib3gtc2hhZG93OiAwIDJweCA2cHggdmFyKC0tdnNjb2RlLXdpZGdldC1zaGFkb3csIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0Zm9udC1zaXplOiAxM3B4O1xuXHRcdFx0XHRmb250LXdlaWdodDogNDAwO1xuXHRcdFx0XHR6LWluZGV4OiAzO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtc3VyZmFjZVtkYXRhLWF0dGFjaG1lbnQtY29ybmVyPSd0b3AtbGVmdCddIHtcblx0XHRcdFx0Ym9yZGVyLXRvcC1sZWZ0LXJhZGl1czogMDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXN1cmZhY2VbZGF0YS1hdHRhY2htZW50LWNvcm5lcj0ndG9wLXJpZ2h0J10ge1xuXHRcdFx0XHRib3JkZXItdG9wLXJpZ2h0LXJhZGl1czogMDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXN1cmZhY2VbZGF0YS1hdHRhY2htZW50LWNvcm5lcj0nYm90dG9tLWxlZnQnXSB7XG5cdFx0XHRcdGJvcmRlci1ib3R0b20tbGVmdC1yYWRpdXM6IDA7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1zdXJmYWNlW2RhdGEtYXR0YWNobWVudC1jb3JuZXI9J2JvdHRvbS1yaWdodCddIHtcblx0XHRcdFx0Ym9yZGVyLWJvdHRvbS1yaWdodC1yYWRpdXM6IDA7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1wcmV2aWV3IHtcblx0XHRcdFx0YWxpZ24taXRlbXM6IGZsZXgtc3RhcnQ7XG5cdFx0XHRcdGdhcDogOHB4O1xuXHRcdFx0XHRtYXgtaGVpZ2h0OiA5NnB4O1xuXHRcdFx0XHRwYWRkaW5nOiA2cHggOHB4O1xuXHRcdFx0XHRvdmVyZmxvdzogaGlkZGVuO1xuXHRcdFx0XHRsaW5lLWhlaWdodDogMjBweDtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IG5vbmU7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1wcmV2aWV3LmVtcHR5IHtcblx0XHRcdFx0Z2FwOiAwO1xuXHRcdFx0XHRwYWRkaW5nOiA0cHg7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1wcmV2aWV3LmVtcHR5IC5jb21tZW50LXByZXZpZXctYm9keSB7XG5cdFx0XHRcdGRpc3BsYXk6IG5vbmU7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1wcmV2aWV3LmVtcHR5IC5jb21tZW50LXByZXZpZXctcmVtb3ZlIHtcblx0XHRcdFx0bWFyZ2luLWJsb2NrOiAwO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcHJldmlldy1ib2R5IHtcblx0XHRcdFx0ZmxleDogMTtcblx0XHRcdFx0bWluLXdpZHRoOiAwO1xuXHRcdFx0XHRtYXgtaGVpZ2h0OiA4MnB4O1xuXHRcdFx0XHRvdmVyZmxvdy14OiBoaWRkZW47XG5cdFx0XHRcdG92ZXJmbG93LXk6IGF1dG87XG5cdFx0XHRcdG92ZXJmbG93LXdyYXA6IGFueXdoZXJlO1xuXHRcdFx0XHRzY3JvbGxiYXItd2lkdGg6IHRoaW47XG5cdFx0XHRcdHdoaXRlLXNwYWNlOiBwcmUtd3JhcDtcblx0XHRcdH1cblx0XHRcdDpob3N0KC5jb21tZW50LXByZXZpZXctYWN0aXZlKSAuaGlnaGxpZ2h0LFxuXHRcdFx0Omhvc3QoLmNvbW1lbnQtcHJldmlldy1hY3RpdmUpIC5sYWJlbCxcblx0XHRcdDpob3N0KC5jb21tZW50LXByZXZpZXctYWN0aXZlKSAuY29tbWVudC1wcmV2aWV3IHtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IGF1dG87XG5cdFx0XHR9XG5cdFx0XHQ6aG9zdCguY29tbWVudC1wcmV2aWV3LWNvbGxhcHNpbmcpIC5oaWdobGlnaHQsXG5cdFx0XHQ6aG9zdCguY29tbWVudC1wcmV2aWV3LWNvbGxhcHNpbmcpIC5sYWJlbCxcblx0XHRcdDpob3N0KC5jb21tZW50LXByZXZpZXctY29sbGFwc2luZykgLmNvbW1lbnQtcHJldmlldyB7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcHJldmlldy1yZW1vdmUge1xuXHRcdFx0XHRmbGV4OiBub25lO1xuXHRcdFx0XHRkaXNwbGF5OiBncmlkO1xuXHRcdFx0XHRwbGFjZS1pdGVtczogY2VudGVyO1xuXHRcdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHR3aWR0aDogMjRweDtcblx0XHRcdFx0aGVpZ2h0OiAyNHB4O1xuXHRcdFx0XHRtYXJnaW4tYmxvY2s6IC0ycHg7XG5cdFx0XHRcdHBhZGRpbmc6IDA7XG5cdFx0XHRcdGJvcmRlcjogMDtcblx0XHRcdFx0Ym9yZGVyLXJhZGl1czogdmFyKC0tdnNjb2RlLWNvcm5lclJhZGl1cy1zbWFsbCwgNHB4KTtcblx0XHRcdFx0YmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG5cdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWZvcmVncm91bmQsIGluaGVyaXQpO1xuXHRcdFx0XHRjdXJzb3I6IHBvaW50ZXI7XG5cdFx0XHRcdGZvbnQtZmFtaWx5OiBpbmhlcml0O1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcHJldmlldy1yZW1vdmUgc3ZnIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHdpZHRoOiB2YXIoLS12c2NvZGUtY29kaWNvbkZvbnRTaXplLCAxNnB4KTtcblx0XHRcdFx0aGVpZ2h0OiB2YXIoLS12c2NvZGUtY29kaWNvbkZvbnRTaXplLCAxNnB4KTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXByZXZpZXctcmVtb3ZlOmhvdmVyIHtcblx0XHRcdFx0YmFja2dyb3VuZDogdmFyKC0tdnNjb2RlLXRvb2xiYXItaG92ZXJCYWNrZ3JvdW5kLCB0cmFuc3BhcmVudCk7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1jb21wb3NlciB7XG5cdFx0XHRcdGFsaWduLWl0ZW1zOiBmbGV4LWVuZDsgZ2FwOiA2cHg7IHBhZGRpbmc6IDZweDtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IGF1dG87XG5cdFx0XHRcdHotaW5kZXg6IDQ7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1pbnB1dCB7XG5cdFx0XHRcdGZsZXg6IDE7IG1pbi13aWR0aDogMDsgcmVzaXplOiBub25lOyBvdmVyZmxvdzogYXV0bztcblx0XHRcdFx0c2Nyb2xsYmFyLXdpZHRoOiBub25lO1xuXHRcdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94OyBtYXJnaW46IDA7IHBhZGRpbmc6IDJweCA2cHg7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBjb2xvcjogaW5oZXJpdDtcblx0XHRcdFx0Ym9yZGVyOiB2YXIoLS12c2NvZGUtc3Ryb2tlVGhpY2tuZXNzLCAxcHgpIHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyLCB2YXIoLS12c2NvZGUtY29udHJhc3RCb3JkZXIsICM0NTQ1NDUpKTtcblx0XHRcdFx0Ym9yZGVyLXJhZGl1czogdmFyKC0tdnNjb2RlLWNvcm5lclJhZGl1cy1zbWFsbCwgNHB4KTtcblx0XHRcdFx0b3V0bGluZTogMDtcblx0XHRcdFx0Zm9udDogaW5oZXJpdDtcblx0XHRcdFx0bGluZS1oZWlnaHQ6IDIwcHg7XG5cdFx0XHRcdGNhcmV0LWNvbG9yOiB2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIsIGN1cnJlbnRDb2xvcik7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1pbnB1dDo6LXdlYmtpdC1zY3JvbGxiYXIge1xuXHRcdFx0XHRkaXNwbGF5OiBub25lO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtaW5wdXQ6OnBsYWNlaG9sZGVyIHtcblx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS1pbnB1dC1wbGFjZWhvbGRlckZvcmVncm91bmQsIHZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQsICNjY2NjY2NiMykpO1xuXHRcdFx0XHRvcGFjaXR5OiAxO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtc2VuZCB7XG5cdFx0XHRcdGJveC1zaXppbmc6IGJvcmRlci1ib3g7IGJvcmRlcjogMDsgY3Vyc29yOiBwb2ludGVyOyBmb250LWZhbWlseTogaW5oZXJpdDtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXNlbmQge1xuXHRcdFx0XHRmbGV4OiBub25lOyB3aWR0aDogMjRweDsgaGVpZ2h0OiAyNHB4OyBwYWRkaW5nOiAwO1xuXHRcdFx0XHRib3JkZXItcmFkaXVzOiB2YXIoLS12c2NvZGUtY29ybmVyUmFkaXVzLXNtYWxsLCA0cHgpO1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcblx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtZm9yZWdyb3VuZCwgI2NjY2NjYyk7XG5cdFx0XHRcdGRpc3BsYXk6IGdyaWQ7XG5cdFx0XHRcdHBsYWNlLWl0ZW1zOiBjZW50ZXI7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1zZW5kIHN2ZyB7XG5cdFx0XHRcdGRpc3BsYXk6IGJsb2NrO1xuXHRcdFx0XHR3aWR0aDogdmFyKC0tdnNjb2RlLWNvZGljb25Gb250U2l6ZSwgMTZweCk7XG5cdFx0XHRcdGhlaWdodDogdmFyKC0tdnNjb2RlLWNvZGljb25Gb250U2l6ZSwgMTZweCk7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1zZW5kOmhvdmVyIHtcblx0XHRcdFx0YmFja2dyb3VuZDogdmFyKC0tdnNjb2RlLXRvb2xiYXItaG92ZXJCYWNrZ3JvdW5kLCB0cmFuc3BhcmVudCk7XG5cdFx0XHR9XG5cdFx0XHQuY29tbWVudC1waW4ge1xuXHRcdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7XG5cdFx0XHRcdGRpc3BsYXk6IGdyaWQ7XG5cdFx0XHRcdHBsYWNlLWl0ZW1zOiBjZW50ZXI7XG5cdFx0XHRcdHdpZHRoOiAyMnB4O1xuXHRcdFx0XHRoZWlnaHQ6IDIycHg7XG5cdFx0XHRcdHRyYW5zZm9ybTogdHJhbnNsYXRlKC0xMXB4LCAtMTFweCk7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuXHRcdFx0XHR6LWluZGV4OiA0O1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtbGF5ZXIuY29tcG9zaW5nIC5jb21tZW50LXBpbiB7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lO1xuXHRcdFx0XHR6LWluZGV4OiBhdXRvO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcGluOmhvdmVyLCAuY29tbWVudC1waW46Zm9jdXMtd2l0aGluIHtcblx0XHRcdFx0ei1pbmRleDogNTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXBpbi5wcmV2aWV3aW5nOm5vdCg6Zm9jdXMtd2l0aGluKSAuY29tbWVudC1waW4tYnViYmxlIHtcblx0XHRcdFx0dmlzaWJpbGl0eTogaGlkZGVuO1xuXHRcdFx0fVxuXHRcdFx0LmNvbW1lbnQtcGluLWJ1YmJsZSB7XG5cdFx0XHRcdGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cdFx0XHRcdGRpc3BsYXk6IGdyaWQ7XG5cdFx0XHRcdHBsYWNlLWl0ZW1zOiBjZW50ZXI7XG5cdFx0XHRcdHdpZHRoOiAyMnB4O1xuXHRcdFx0XHRoZWlnaHQ6IDIycHg7XG5cdFx0XHRcdHBhZGRpbmc6IDA7XG5cdFx0XHRcdGJvcmRlcjogdmFyKC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzcywgMXB4KSBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJhY2tncm91bmQsICMyNTI1MjYpO1xuXHRcdFx0XHRib3JkZXItcmFkaXVzOiB2YXIoLS12c2NvZGUtY29ybmVyUmFkaXVzLWNpcmNsZSwgOTk5OXB4KTtcblx0XHRcdFx0YmFja2dyb3VuZDogdmFyKC0tdnNjb2RlLWJ1dHRvbi1iYWNrZ3JvdW5kLCAjMDA3OGQ0KTtcblx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tZm9yZWdyb3VuZCwgd2hpdGUpO1xuXHRcdFx0XHRib3gtc2hhZG93OiAwIDJweCA2cHggdmFyKC0tdnNjb2RlLXdpZGdldC1zaGFkb3csIHRyYW5zcGFyZW50KTtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXBpbi1udW1iZXIge1xuXHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdFx0d2lkdGg6IDEwMCU7XG5cdFx0XHRcdGZvbnQtc2l6ZTogMTFweDtcblx0XHRcdFx0Zm9udC13ZWlnaHQ6IDYwMDtcblx0XHRcdFx0bGluZS1oZWlnaHQ6IDEycHg7XG5cdFx0XHRcdHRleHQtYWxpZ246IGNlbnRlcjtcblx0XHRcdH1cblx0XHRcdC5jb21tZW50LXNlbmQ6Zm9jdXMtdmlzaWJsZSwgLmNvbW1lbnQtcHJldmlldy1yZW1vdmU6Zm9jdXMtdmlzaWJsZSwgLmNvbW1lbnQtcGluOmZvY3VzLXZpc2libGUsIC5jb21tZW50LWlucHV0OmZvY3VzLXZpc2libGUge1xuXHRcdFx0XHRvdXRsaW5lOiAycHggc29saWQgdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3OGQ0KTtcblx0XHRcdFx0b3V0bGluZS1vZmZzZXQ6IDJweDtcblx0XHRcdH1cblx0XHRcdDpob3N0KC5yZWR1Y2UtbW90aW9uKSAuY29tbWVudC1iYWNrZHJvcC1maWxsIHtcblx0XHRcdFx0dHJhbnNpdGlvbjogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5sYWJlbCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgYm94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0ZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4OyBoZWlnaHQ6IDIwcHg7IHBhZGRpbmc6IDAgNnB4O1xuXHRcdFx0XHRtYXgtd2lkdGg6IG1pbigxMDAlLCAzMjBweCk7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS1idXR0b24tYmFja2dyb3VuZCwgIzAwNzhkNCk7XG5cdFx0XHRcdGNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQsIHdoaXRlKTtcblx0XHRcdFx0Zm9udC1mYW1pbHk6IGluaGVyaXQ7XG5cdFx0XHRcdGZvbnQtc2l6ZTogMTFweDsgbGluZS1oZWlnaHQ6IDIwcHg7XG5cdFx0XHRcdHdoaXRlLXNwYWNlOiBub3dyYXA7XG5cdFx0XHRcdGJvcmRlci1yYWRpdXM6IDJweDtcblx0XHRcdFx0Ym94LXNoYWRvdzogMCAxcHggNHB4IHJnYmEoMCwgMCwgMCwgMC4yNSk7XG5cdFx0XHRcdHotaW5kZXg6IDM7XG5cdFx0XHR9XG5cdFx0XHQubGFiZWwtaW5mbyB7XG5cdFx0XHRcdGRpc3BsYXk6IGlubGluZS1ibG9jazsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7IG1pbi13aWR0aDogMDtcblx0XHRcdH1cblx0XHRcdC5sYWJlbC1zZWxlY3RvciB7XG5cdFx0XHRcdGZvbnQtd2VpZ2h0OiA2MDA7XG5cdFx0XHR9XG5cdFx0XHQubGFiZWwtZGltcyB7XG5cdFx0XHRcdGZsZXgtc2hyaW5rOiAwOyBvcGFjaXR5OiAwLjg7XG5cdFx0XHR9XG5cdFx0XHQuZHJhZ2JveCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgYm94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0Ym9yZGVyOiAxcHggZG90dGVkIHZhcigtLXZzY29kZS1mb2N1c0JvcmRlciwgI2EwYWFiZSk7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuXHRcdFx0XHR6LWluZGV4OiAyO1xuXHRcdFx0fVxuXHRcdGA7XG5cdFx0cmV0dXJuIHN0eWxlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FwcGx5VGhlbWUoaG9zdDogSFRNTEVsZW1lbnQsIHRoZW1lOiBJQnJvd3NlclZpZXdUaGVtZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWZvY3VzQm9yZGVyJywgdGhlbWU/LmZvY3VzQm9yZGVyID8/IG51bGwpO1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWJ1dHRvbi1iYWNrZ3JvdW5kJywgdGhlbWU/LmJ1dHRvbkJhY2tncm91bmQgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQnLCB0aGVtZT8uYnV0dG9uRm9yZWdyb3VuZCA/PyBudWxsKTtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1lZGl0b3JXaWRnZXQtYmFja2dyb3VuZCcsIHRoZW1lPy53aWRnZXRCYWNrZ3JvdW5kID8/IG51bGwpO1xuXHRcdGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvcldpZGdldC1mb3JlZ3JvdW5kJywgdGhlbWU/LndpZGdldEZvcmVncm91bmQgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlcicsIHRoZW1lPy53aWRnZXRCb3JkZXIgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtd2lkZ2V0LXNoYWRvdycsIHRoZW1lPy53aWRnZXRTaGFkb3cgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtY29udHJhc3RCb3JkZXInLCB0aGVtZT8uY29udHJhc3RCb3JkZXIgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kJywgdGhlbWU/LmRlc2NyaXB0aW9uRm9yZWdyb3VuZCA/PyBudWxsKTtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1pbnB1dC1wbGFjZWhvbGRlckZvcmVncm91bmQnLCB0aGVtZT8uaW5wdXRQbGFjZWhvbGRlckZvcmVncm91bmQgPz8gbnVsbCk7XG5cdFx0aG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtdG9vbGJhci1ob3ZlckJhY2tncm91bmQnLCB0aGVtZT8udG9vbGJhckhvdmVyQmFja2dyb3VuZCA/PyBudWxsKTtcblx0XHRob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXBpY2stZm9udCcsIHRoZW1lPy5mb250ID8/IG51bGwpO1xuXHR9XG59XG5cbi8qKlxuICogRHJhZy10by1zZWxlY3QgcmVjdGFuZ2xlIHBpY2tlciB1c2VkIGJ5IHRoZSBcIkFkZCBBcmVhIFNjcmVlbnNob3QgdG8gQ2hhdFwiXG4gKiBmbG93LiBNb3VudHMgYSB0cmFuc3BhcmVudCBzaGFkb3cgb3ZlcmxheSB0aGF0IGNhcHR1cmVzIHBvaW50ZXJcbiAqIGV2ZW50cywgZHJhd3MgYSBkb3R0ZWQgcnViYmVyLWJhbmQgcmVjdGFuZ2xlIHdoaWxlIGRyYWdnaW5nLCBhbmQgb24gcG9pbnRlclxuICogdXAgcmVwb3J0cyB0aGUgc2VsZWN0ZWQgcmVnaW9uIGluICoqdmlld3BvcnQgY29vcmRpbmF0ZXMqKi4gRVNDIG9yIGFcbiAqIHplcm8tYXJlYSBkcmFnIGNhbmNlbHMgdGhlIHBpY2suXG4gKi9cbmNsYXNzIEFyZWFQaWNrZXIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUlOX0FSRUFfUFggPSA0O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VSU09SX0NST1NTSEFJUiA9ICcvKiBWUyBDb2RlIGluamVjdGVkIHN0eWxlICovICogeyBjdXJzb3I6IGNyb3NzaGFpciAhaW1wb3J0YW50OyB9JztcblxuXHRwcml2YXRlIF9zZWxlY3Rpb25BY3RpdmUgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGFkb3dIb3N0OiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJhZ2JveDogSFRNTERpdkVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfZHJhZ1N0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnNvclN0eWxlc2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25QaWNrZWQ6IChyZWN0OiBJQnJvd3NlclZpZXdSZWN0KSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uU3RvcHBlZDogKCkgPT4gdm9pZFxuXHQpIHtcblx0XHRjb25zdCBzaGFkb3dIb3N0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0c2hhZG93SG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdnNjb2RlLWFyZWEtcGljay1ob3N0JywgJycpO1xuXHRcdHNoYWRvd0hvc3Quc3R5bGUuY3NzVGV4dCA9ICdwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogMDsgbGVmdDogMDsgd2lkdGg6IDA7IGhlaWdodDogMDsgei1pbmRleDogMjE0NzQ4MzY0NzsgcG9pbnRlci1ldmVudHM6IG5vbmU7Jztcblx0XHRjb25zdCByb290ID0gc2hhZG93SG9zdC5hdHRhY2hTaGFkb3coeyBtb2RlOiAnY2xvc2VkJyB9KTtcblx0XHRyb290LmFwcGVuZENoaWxkKEFyZWFQaWNrZXIuX2J1aWxkU3R5bGUoKSk7XG5cdFx0dGhpcy5fc2hhZG93SG9zdCA9IHNoYWRvd0hvc3Q7XG5cblx0XHQvLyBBIGZpeGVkIGZ1bGwtdmlld3BvcnQgbGF5ZXIgYmVsb3cgdGhlIGRyYWdib3ggc28gdGhlIHBhZ2UgdW5kZXJuZWF0aFxuXHRcdC8vIGRvZXNuJ3QgcmVjZWl2ZSBob3Zlci9jbGljayBldmVudHMgd2hpbGUgd2UncmUgcGlja2luZy4gVGhlIGxheWVyIGlzXG5cdFx0Ly8gdHJhbnNwYXJlbnQgXHUyMDE0IHRoZSBhY3R1YWwgcGFnZSBpcyBzdGlsbCB2aXNpYmxlLlxuXHRcdGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRvdmVybGF5LmNsYXNzTmFtZSA9ICdvdmVybGF5Jztcblx0XHRyb290LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG5cdFx0Y29uc3QgZHJhZ2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRyYWdib3guY2xhc3NOYW1lID0gJ2RyYWdib3gnO1xuXHRcdGRyYWdib3guc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRyb290LmFwcGVuZENoaWxkKGRyYWdib3gpO1xuXHRcdHRoaXMuX2RyYWdib3ggPSBkcmFnYm94O1xuXHR9XG5cblx0c3RhcnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kcmFnU3RhcnQgPSB1bmRlZmluZWQ7XG5cblx0XHRkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fc2hhZG93SG9zdCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uQWN0aXZlID0gdHJ1ZTtcblxuXHRcdC8vIEZvcmNlIGEgY3Jvc3NoYWlyIGN1cnNvciBhY3Jvc3MgdGhlIHdob2xlIHBhZ2Ugd2hpbGUgcGlja2luZy5cblx0XHRjb25zdCBjdXJzb3JTdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG5cdFx0Y3Vyc29yU3R5bGUuc2V0QXR0cmlidXRlKCdkYXRhLXZzY29kZS1hcmVhLXBpY2stY3Vyc29yJywgJycpO1xuXHRcdGN1cnNvclN0eWxlLnRleHRDb250ZW50ID0gQXJlYVBpY2tlci5fQ1VSU09SX0NST1NTSEFJUjtcblx0XHRkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGN1cnNvclN0eWxlKTtcblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0ID0gY3Vyc29yU3R5bGU7XG5cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcm1vdmUnLCB0aGlzLl9vblBvaW50ZXJNb3ZlLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmRvd24nLCB0aGlzLl9vblBvaW50ZXJEb3duLCB0cnVlKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgdGhpcy5fb25Qb2ludGVyVXAsIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjb250ZXh0bWVudScsIHRoaXMuX29uQ2xpY2ssIHRydWUpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0cnVlKTtcblx0fVxuXG5cdHN0b3AoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdGVhcmRvd24oKTtcblx0XHR0aGlzLl9vblN0b3BwZWQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTeW5jaHJvbm91cyB0ZWFyZG93biBvZiB0aGUgb3ZlcmxheSwgY3Vyc29yIHN0eWxlLCBhbmQgZXZlbnQgbGlzdGVuZXJzLlxuXHQgKiBVc2VkIGJ5IGJvdGgge0BsaW5rIHN0b3B9ICh3aGljaCB0aGVuIGZpcmVzIGBfb25TdG9wcGVkYCkgYW5kIGBfb25Qb2ludGVyVXBgXG5cdCAqICh3aGljaCBmaXJlcyBgX29uUGlja2VkYCBvciBgX29uU3RvcHBlZGAgYWZ0ZXIgdGVhcmRvd24gY29tcGxldGVzLCBzbyB0aGVcblx0ICogSVBDIGNvbnN1bWVyIGNhbiBjYXB0dXJlIHRoZSBwYWdlIHdpdGhvdXQgb3VyIG92ZXJsYXkgaW4gdGhlIGZyYW1lKS5cblx0ICovXG5cdHByaXZhdGUgX3RlYXJkb3duKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3NoYWRvd0hvc3QucmVtb3ZlKCk7XG5cblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0Py5yZW1vdmUoKTtcblx0XHR0aGlzLl9jdXJzb3JTdHlsZXNoZWV0ID0gdW5kZWZpbmVkO1xuXG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJtb3ZlJywgdGhpcy5fb25Qb2ludGVyTW92ZSwgdHJ1ZSk7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJkb3duJywgdGhpcy5fb25Qb2ludGVyRG93biwgdHJ1ZSk7XG5cdFx0d2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsIHRoaXMuX29uUG9pbnRlclVwLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCB0aGlzLl9vbkNsaWNrLCB0cnVlKTtcblx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuX29uS2V5RG93biwgdHJ1ZSk7XG5cblx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5sZWZ0ID0gJzBweCc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS50b3AgPSAnMHB4Jztcblx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLndpZHRoID0gJzBweCc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5oZWlnaHQgPSAnMHB4Jztcblx0XHR0aGlzLl9kcmFnU3RhcnQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRUaGVtZSh0aGVtZTogSUJyb3dzZXJWaWV3VGhlbWUpOiB2b2lkIHtcblx0XHR0aGlzLl9zaGFkb3dIb3N0LnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1mb2N1c0JvcmRlcicsIHRoZW1lPy5mb2N1c0JvcmRlciA/PyBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgX29uUG9pbnRlckRvd24gPSAoZTogUG9pbnRlckV2ZW50KTogdm9pZCA9PiB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25BY3RpdmUgfHwgZS5idXR0b24gIT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZHJhZ1N0YXJ0ID0geyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9O1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5sZWZ0ID0gYCR7ZS5jbGllbnRYfXB4YDtcblx0XHR0aGlzLl9kcmFnYm94LnN0eWxlLnRvcCA9IGAke2UuY2xpZW50WX1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS53aWR0aCA9ICcwcHgnO1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUuaGVpZ2h0ID0gJzBweCc7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdH07XG5cblx0cHJpdmF0ZSBfb25Qb2ludGVyTW92ZSA9IChlOiBQb2ludGVyRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSB8fCAhdGhpcy5fZHJhZ1N0YXJ0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1pbih0aGlzLl9kcmFnU3RhcnQueCwgZS5jbGllbnRYKTtcblx0XHRjb25zdCB0b3AgPSBNYXRoLm1pbih0aGlzLl9kcmFnU3RhcnQueSwgZS5jbGllbnRZKTtcblx0XHRjb25zdCB3aWR0aCA9IE1hdGguYWJzKGUuY2xpZW50WCAtIHRoaXMuX2RyYWdTdGFydC54KTtcblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLmFicyhlLmNsaWVudFkgLSB0aGlzLl9kcmFnU3RhcnQueSk7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdHRoaXMuX2RyYWdib3guc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0dGhpcy5fZHJhZ2JveC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uUG9pbnRlclVwID0gKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlIHx8ICF0aGlzLl9kcmFnU3RhcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLl9kcmFnU3RhcnQ7XG5cblx0XHRjb25zdCBsZWZ0ID0gTWF0aC5taW4oc3RhcnQueCwgZS5jbGllbnRYKTtcblx0XHRjb25zdCB0b3AgPSBNYXRoLm1pbihzdGFydC55LCBlLmNsaWVudFkpO1xuXHRcdGNvbnN0IHdpZHRoID0gTWF0aC5hYnMoZS5jbGllbnRYIC0gc3RhcnQueCk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5hYnMoZS5jbGllbnRZIC0gc3RhcnQueSk7XG5cblx0XHQvLyBUZWFyIGRvd24gdGhlIG92ZXJsYXkgYmVmb3JlIGNvbW1pdHRpbmcgc28gdGhlIElQQyBjb25zdW1lciBjYW5cblx0XHQvLyBpbW1lZGlhdGVseSBzdGFydCBhIHNjcmVlbnNob3Qgd2l0aG91dCBvdXIgZHJhZ2JveCBiZWluZyBpbiB0aGUgd2F5LlxuXHRcdHRoaXMuX3RlYXJkb3duKCk7XG5cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGlmICh3aWR0aCA8IEFyZWFQaWNrZXIuX01JTl9BUkVBX1BYIHx8IGhlaWdodCA8IEFyZWFQaWNrZXIuX01JTl9BUkVBX1BYKSB7XG5cdFx0XHR0aGlzLl9vblN0b3BwZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBLZWVwIHJlY3RhbmdsZSBpbiB2aWV3cG9ydCAoY2xpZW50KSBjb29yZGluYXRlcyB0byBtYXRjaCBvdGhlciBzY3JlZW5zaG90XG5cdFx0Ly8gY2FwdHVyZSBjYWxsIHNpdGVzIHRoYXQgcGFzcyB2aWV3cG9ydC1zcGFjZSBib3VuZHMgYXMgcGFnZVJlY3QuIFRoZVxuXHRcdC8vIG1haW4tcHJvY2VzcyBjbGlwIG1hdGggKGBwYWdlUmVjdCAqIHZpc3VhbFZpZXdwb3J0U2NhbGUgKiB6b29tRmFjdG9yYClcblx0XHQvLyBtZWFzdXJlcyBmcm9tIHRoZSB2aXN1YWwgdmlld3BvcnQgb3JpZ2luLCBzbyBzdWJ0cmFjdCB0aGUgdmlzdWFsXG5cdFx0Ly8gdmlld3BvcnQncyBvZmZzZXQgKG5vbi16ZXJvIG9ubHkgd2hlbiBwaW5jaC1wYW5uZWQpIHRvIGNvbnZlcnQgbGF5b3V0LVxuXHRcdC8vIHZpZXdwb3J0IGNsaWVudCBjb29yZHMgaW50byB0aGUgc2FtZSBjb29yZCBzcGFjZSB0aGF0IEFkZCBFbGVtZW50IHRvXG5cdFx0Ly8gQ2hhdCdzIENEUCBib3gtbW9kZWwgYm91bmRzIHVzZS5cblx0XHRjb25zdCB2diA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydDtcblx0XHRjb25zdCBvZmZzZXRMZWZ0ID0gdnY/Lm9mZnNldExlZnQgPz8gMDtcblx0XHRjb25zdCBvZmZzZXRUb3AgPSB2dj8ub2Zmc2V0VG9wID8/IDA7XG5cdFx0Y29uc3QgcmVjdCA9IHsgeDogbGVmdCAtIG9mZnNldExlZnQsIHk6IHRvcCAtIG9mZnNldFRvcCwgd2lkdGgsIGhlaWdodCB9O1xuXG5cdFx0Ly8gVGhlIHN5bmNocm9ub3VzIERPTSB0ZWFyZG93biBhYm92ZSBpcyB0aGUgcHJlcmVxdWlzaXRlIFx1MjAxNCB0aGUgbmV4dCBjb21wb3NpdG9yXG5cdFx0Ly8gZnJhbWUgd29uJ3QgY29udGFpbiB0aGUgb3ZlcmxheS4gV2FpdGluZyBmb3IgdGhhdCBmcmFtZSB0byBhY3R1YWxseSBsYW5kXG5cdFx0Ly8gYmVmb3JlIHJlYWRpbmcgdGhlIEdQVSBzdXJmYWNlIGlzIHRoZSBjb25zdW1lcidzIHJlc3BvbnNpYmlsaXR5IChzZWVcblx0XHQvLyBgYXdhaXROZXh0UGFpbnRgIGluIGBCcm93c2VyVmlldy5jYXB0dXJlU2NyZWVuc2hvdGApLlxuXHRcdHRoaXMuX29uUGlja2VkKHJlY3QpO1xuXHR9O1xuXG5cdHByaXZhdGUgX29uQ2xpY2sgPSAoZTogRXZlbnQpOiB2b2lkID0+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0fTtcblxuXHRwcml2YXRlIF9vbktleURvd24gPSAoZTogS2V5Ym9hcmRFdmVudCk6IHZvaWQgPT4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9XG5cdH07XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2J1aWxkU3R5bGUoKTogSFRNTFN0eWxlRWxlbWVudCB7XG5cdFx0Y29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdHN0eWxlLnRleHRDb250ZW50ID0gYFxuXHRcdFx0Omhvc3Qge1xuXHRcdFx0XHRhbGw6IGluaXRpYWw7XG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0XHQub3ZlcmxheSB7XG5cdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuXHRcdFx0XHR6LWluZGV4OiAxO1xuXHRcdFx0XHQvKiBDYXB0dXJlIGhpdC10ZXN0aW5nIHNvIHBvaW50ZXIgZXZlbnRzIGRvbid0IHJlYWNoIHRoZSB1bmRlcmx5aW5nXG5cdFx0XHRcdCAqIHBhZ2UgZHVyaW5nIGEgcGljayBcdTIwMTQgb3RoZXJ3aXNlIGhvdmVyLzpob3ZlciBzdHlsZXMgd291bGRcblx0XHRcdFx0ICogZmlyZSBvbiBlbGVtZW50cyBiZW5lYXRoIHRoZSBjdXJzb3Igd2hpbGUgd2UncmUgZHJhZ2dpbmcuICovXG5cdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuXHRcdFx0fVxuXHRcdFx0LmRyYWdib3gge1xuXHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7IGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cdFx0XHRcdGJvcmRlcjogMXB4IGRhc2hlZCB2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIsICMwMDc4ZDQpO1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyLCAjMDA3OGQ0KSAxMiUsIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0ei1pbmRleDogMjtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IGF1dG87XG5cdFx0XHR9XG5cdFx0YDtcblx0XHRyZXR1cm4gc3R5bGU7XG5cdH1cbn1cblxuaW5pdCgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBV0EsTUFBTSw4QkFBOEI7QUFDcEMsSUFBSSxtQkFBd0Q7QUFBQSxFQUMzRCxZQUFZO0FBQUEsRUFDWix1QkFBdUI7QUFBQSxFQUN2QiwwQkFBMEI7QUFBQSxFQUMxQixnQkFBZ0I7QUFBQSxFQUNoQix3QkFBd0I7QUFBQSxFQUN4QixxQkFBcUI7QUFBQSxFQUNyQixlQUFlO0FBQUEsRUFDZixzQkFBc0I7QUFDdkI7QUFZQSxTQUFTLE9BQU87QUFDZixRQUFNLEVBQUUsZUFBZSxZQUFZLElBQUksUUFBUSxVQUFVO0FBV3pELFFBQU0sMkJBQTJCO0FBQUEsSUFDaEMsS0FBSztBQUFBLE1BQ0osUUFBUSxvQkFBSSxJQUFJLENBQUMsV0FBVyxhQUFhLGFBQWEsY0FBYyxhQUFhLFFBQVEsQ0FBQztBQUFBLE1BQzFGLFNBQVMsb0JBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQUEsTUFDMUMsV0FBVyxvQkFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUM7QUFBQSxJQUM5QjtBQUFBLElBQ0EsUUFBUTtBQUFBLE1BQ1AsUUFBUSxvQkFBSSxJQUFJLENBQUMsV0FBVyxhQUFhLGFBQWEsY0FBYyxRQUFRLE9BQU8sYUFBYSxRQUFR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O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQXVQcEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUsWUFBWSxNQUFtQixPQUE0QztBQUN6RixTQUFLLE1BQU0sWUFBWSx3QkFBd0IsT0FBTyxlQUFlLElBQUk7QUFDekUsU0FBSyxNQUFNLFlBQVksOEJBQThC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
